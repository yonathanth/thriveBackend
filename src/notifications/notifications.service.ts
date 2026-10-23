import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityManager, In, LessThan, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Notification } from '../entities/notification.entity';
import { NotificationRead } from '../entities/notification-read.entity';
import { Member } from '../entities/member.entity';
import { Transaction } from '../entities/transaction.entity';
import { PushService, PushMessage } from './push.service';
import { Admin } from '../entities/admin.entity';
import { hiddenNotificationTypes } from './notification-access';
import {
  NotificationType,
  isNotificationType,
  notificationText,
  TextOptions,
} from './notification-text';

/** A desktop event as the sync delivers it. */
export interface DesktopEvent {
  uid: string;
  type: string;
  memberId?: number | null;
  transactionId?: number | null;
  occurredAt: string;
  data: Record<string, unknown>;
}

export interface NotificationView {
  id: number;
  type: string;
  title: string;
  body: string;
  occurredAt: string;
  read: boolean;
  /** Cloud member id, when the member is on the website */
  memberId: number | null;
  url: string;
  data: Record<string, unknown>;
}

/** Notifications older than this are pushed as part of a summary only, never one by one. */
const PUSH_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** More fresh notifications than this in one sync become a single summary push. */
const PUSH_SUMMARY_OVER = 3;

const TYPE_PLURALS: Record<NotificationType, [string, string]> = {
  payment: ['payment', 'payments'],
  package_changed: ['package change', 'package changes'],
  start_date_changed: ['start date change', 'start date changes'],
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly textOptions: TextOptions;
  private readonly retentionDays: number;

  constructor(
    config: ConfigService,
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(NotificationRead)
    private readonly reads: Repository<NotificationRead>,
    @InjectRepository(Member)
    private readonly members: Repository<Member>,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    private readonly push: PushService,
  ) {
    this.textOptions = {
      timeZone: config.get<string>('APP_TIMEZONE') || 'Africa/Addis_Ababa',
      currency: config.get<string>('APP_CURRENCY') || 'ETB',
    };
    const days = Number(config.get<string>('NOTIFICATION_RETENTION_DAYS'));
    this.retentionDays = Number.isFinite(days) && days > 0 ? days : 180;
  }

  /**
   * Stores the notifications for a sync's events inside its transaction.
   *
   * Acknowledged: stored now, stored before (a retry), or of a type this version does
   * not show (from a newer desktop); the desktop forgets these. Failed: could not be
   * stored; the desktop keeps them and tries again later. A notification can never fail
   * the sync it rides with: inserts run under savepoints, so a bad row is rolled back
   * alone instead of aborting the whole transaction.
   * Returns what was newly created, to push once the transaction commits.
   */
  async createFromEvents(
    events: DesktopEvent[],
    manager: EntityManager,
  ): Promise<{ acknowledged: string[]; failed: string[]; created: Notification[] }> {
    const unknown = events.filter(e => !isNotificationType(e.type)).map(e => e.uid);
    const rows = events
      .filter(e => isNotificationType(e.type))
      .map(e => {
        const { title, body } = notificationText(e.type as NotificationType, e.data ?? {}, this.textOptions);
        const occurred = new Date(e.occurredAt);
        return {
          eventUid: e.uid,
          type: e.type,
          title,
          body,
          memberLocalId: e.memberId ?? null,
          transactionLocalId: e.transactionId ?? null,
          data: e.data ?? {},
          occurredAt: isNaN(occurred.getTime()) ? new Date() : occurred,
        };
      });
    if (rows.length === 0) return { acknowledged: unknown, failed: [], created: [] };

    const insert = async (batch: typeof rows): Promise<number[]> => {
      const result = await manager
        .createQueryBuilder()
        .insert()
        .into(Notification)
        // jsonb data is free-form, which TypeORM's deep-partial typing cannot express
        .values(batch as QueryDeepPartialEntity<Notification>[])
        .orIgnore()
        .returning(['id'])
        .execute();
      return (result.raw as { id: number }[]).map(r => r.id);
    };

    const ids: number[] = [];
    const stored: string[] = [];
    const failed: string[] = [];
    await manager.query('SAVEPOINT notification_events');
    try {
      ids.push(...(await insert(rows)));
      stored.push(...rows.map(r => r.eventUid));
      await manager.query('RELEASE SAVEPOINT notification_events');
    } catch (batchError) {
      await manager.query('ROLLBACK TO SAVEPOINT notification_events');
      this.logger.warn(
        `Storing ${rows.length} notifications together failed, trying one by one: ${
          batchError instanceof Error ? batchError.message : batchError
        }`,
      );
      for (const row of rows) {
        await manager.query('SAVEPOINT notification_event');
        try {
          ids.push(...(await insert([row])));
          stored.push(row.eventUid);
          await manager.query('RELEASE SAVEPOINT notification_event');
        } catch (error) {
          await manager.query('ROLLBACK TO SAVEPOINT notification_event');
          failed.push(row.eventUid);
          this.logger.error(
            `Could not store notification for event ${row.eventUid} (${row.type}): ${
              error instanceof Error ? error.message : error
            }`,
          );
        }
      }
    }

    const created = ids.length ? await manager.find(Notification, { where: { id: In(ids) } }) : [];
    return { acknowledged: [...stored, ...unknown], failed, created };
  }

  /**
   * Pushes newly created notifications. Runs after the sync has committed and never
   * throws: a push failure must not look like a failed sync.
   */
  async pushCreated(created: Notification[]): Promise<void> {
    try {
      const now = Date.now();
      const fresh = created
        .filter(n => now - n.occurredAt.getTime() <= PUSH_MAX_AGE_MS)
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
      if (fresh.length === 0) return;

      const subs = await this.push.subscriptionsFor([...new Set(fresh.map(n => n.type))]);
      if (subs.length === 0) return;
      const urls = await this.urlsFor(fresh);

      // Each device gets only what its account's role may see (no payments for managers).
      const owners = await this.notifications.manager.find(Admin, {
        where: { id: In([...new Set(subs.map(s => s.adminId))]) },
        select: ['id', 'role'],
      });
      const roles = new Map(owners.map(a => [a.id, a.role]));

      for (const sub of subs) {
        const hidden = hiddenNotificationTypes(roles.get(sub.adminId) ?? '');
        const wanted = fresh.filter(n => sub.types.includes(n.type) && !hidden.includes(n.type));
        if (wanted.length === 0) continue;
        const messages: PushMessage[] =
          wanted.length > PUSH_SUMMARY_OVER
            ? [this.summaryMessage(wanted)]
            : wanted.map(n => ({
                title: n.title,
                body: n.body,
                url: urls.get(n.id) ?? '/admin/notifications',
                tag: `notification-${n.id}`,
                type: n.type,
                notificationId: n.id,
                timestamp: n.occurredAt.getTime(),
              }));
        for (const message of messages) {
          await this.push.send([sub], message);
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to push notifications: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private summaryMessage(list: Notification[]): PushMessage {
    const counts = new Map<NotificationType, number>();
    for (const n of list) {
      if (isNotificationType(n.type)) counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
    }
    const parts = [...counts].map(([type, count]) => {
      const [one, many] = TYPE_PLURALS[type];
      return `${count} ${count === 1 ? one : many}`;
    });
    return {
      title: `${list.length} new notifications`,
      body: parts.join(', '),
      url: '/admin/notifications',
      tag: 'notification-summary',
      type: 'summary',
      timestamp: Date.now(),
    };
  }

  /**
   * Where each notification leads: a payment to its payment record, a change to the
   * audit entry recording who made it. Without those (an older desktop, or a record not
   * on the website yet), the member's page.
   */
  private async urlsFor(
    list: Notification[],
    known?: Map<number, number>,
  ): Promise<Map<number, string>> {
    const memberIds = known ?? (await this.cloudMemberIds(list));
    const transactionIds = await this.cloudTransactionIds(list);
    return new Map(
      list.map(n => {
        const transactionId =
          n.type === 'payment' && n.transactionLocalId != null
            ? transactionIds.get(n.transactionLocalId)
            : undefined;
        const auditId = n.type !== 'payment' ? n.data?.['audit_id'] : undefined;
        const memberId = n.memberLocalId != null ? memberIds.get(n.memberLocalId) : undefined;
        const url = transactionId
          ? `/admin/transactions/${transactionId}`
          : typeof auditId === 'number'
            ? `/admin/audit-log/${auditId}`
            : memberId
              ? `/admin/members/${memberId}`
              : n.type === 'payment'
                ? '/admin/transactions'
                : '/admin/notifications';
        return [n.id, url];
      }),
    );
  }

  private async cloudTransactionIds(list: Notification[]): Promise<Map<number, number>> {
    const localIds = [
      ...new Set(
        list
          .filter(n => n.type === 'payment')
          .map(n => n.transactionLocalId)
          .filter((id): id is number => id != null),
      ),
    ];
    if (localIds.length === 0) return new Map();
    const rows = await this.transactions.find({
      where: { localId: In(localIds) },
      select: ['id', 'localId'],
    });
    return new Map(rows.map(t => [t.localId, t.id]));
  }

  private async cloudMemberIds(list: Notification[]): Promise<Map<number, number>> {
    const localIds = [
      ...new Set(list.map(n => n.memberLocalId).filter((id): id is number => id != null)),
    ];
    if (localIds.length === 0) return new Map();
    const members = await this.members.find({
      where: { localId: In(localIds) },
      select: ['id', 'localId'],
    });
    return new Map(members.map(m => [m.localId, m.id]));
  }

  async list(
    adminId: number,
    opts: { page?: number; limit?: number; unreadOnly?: boolean; type?: string; hidden?: string[] },
  ): Promise<{ data: NotificationView[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const qb = this.notifications.createQueryBuilder('n').orderBy('n.occurredAt', 'DESC').addOrderBy('n.id', 'DESC');
    if (opts.type) qb.andWhere('n.type = :type', { type: opts.type });
    if (opts.hidden?.length) qb.andWhere('n.type NOT IN (:...hidden)', { hidden: opts.hidden });
    if (opts.unreadOnly) {
      qb.andWhere(
        'NOT EXISTS (SELECT 1 FROM notification_read r WHERE r."notificationId" = n.id AND r."adminId" = :adminId)',
        { adminId },
      );
    }
    const [rows, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();

    const readIds = rows.length
      ? new Set(
          (
            await this.reads.find({
              where: { adminId, notificationId: In(rows.map(r => r.id)) },
              select: ['notificationId'],
            })
          ).map(r => r.notificationId),
        )
      : new Set<number>();
    const memberIds = await this.cloudMemberIds(rows);
    const urls = await this.urlsFor(rows, memberIds);

    return {
      data: rows.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        occurredAt: n.occurredAt.toISOString(),
        read: readIds.has(n.id),
        memberId: n.memberLocalId != null ? memberIds.get(n.memberLocalId) ?? null : null,
        url: urls.get(n.id) ?? '/admin/notifications',
        data: n.data,
      })),
      total,
      page,
      limit,
    };
  }

  async unreadCount(adminId: number, hidden: string[] = []): Promise<number> {
    const qb = this.notifications
      .createQueryBuilder('n')
      .where(
        'NOT EXISTS (SELECT 1 FROM notification_read r WHERE r."notificationId" = n.id AND r."adminId" = :adminId)',
        { adminId },
      );
    if (hidden.length) qb.andWhere('n.type NOT IN (:...hidden)', { hidden });
    return qb.getCount();
  }

  async markRead(adminId: number, ids: number[], hidden: string[] = []): Promise<void> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    const existing = (
      await this.notifications.find({ where: { id: In(unique) }, select: ['id', 'type'] })
    ).filter(n => !hidden.includes(n.type));
    if (existing.length === 0) return;
    await this.reads
      .createQueryBuilder()
      .insert()
      .into(NotificationRead)
      .values(existing.map(n => ({ notificationId: n.id, adminId })))
      .orIgnore()
      .execute();
  }

  async markAllRead(adminId: number, hidden: string[] = []): Promise<number> {
    const marked: unknown[] = await this.reads.query(
      `INSERT INTO notification_read ("notificationId", "adminId", "readAt")
       SELECT n.id, $1, NOW() FROM notification n
        WHERE NOT EXISTS (SELECT 1 FROM notification_read r WHERE r."notificationId" = n.id AND r."adminId" = $1)
          AND NOT (n.type = ANY($2::text[]))
       ON CONFLICT DO NOTHING
       RETURNING "notificationId"`,
      [adminId, hidden],
    );
    return marked.length;
  }

  /** Keeps the table from growing forever; read state goes with the notification. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async removeOld(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionDays * 86_400_000);
    const result = await this.notifications.delete({ occurredAt: LessThan(cutoff) });
    if (result.affected) {
      this.logger.log(`Removed ${result.affected} notifications older than ${this.retentionDays} days`);
    }
  }
}
