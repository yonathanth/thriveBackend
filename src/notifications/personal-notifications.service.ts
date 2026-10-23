import { BadRequestException, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, In, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Notification } from '../entities/notification.entity';
import { Admin } from '../entities/admin.entity';
import { PushService } from './push.service';
import { FreezeChange, NotificationsService } from './notifications.service';
import { isNotificationType, memberEventText, NotificationType, TextOptions } from './notification-text';
import { PERSONAL_TYPES } from './notification-access';
import { MessageAudience } from './dto/notification.dto';
import { AuditActor, WebAuditService } from '../web-audit/web-audit.service';
import { ProgressService } from '../progress/progress.service';

/** One notification for one account. */
export interface PersonalItem {
  recipientId: number;
  /** Unique per notification: the same item created twice is stored once. */
  eventUid: string;
  type: string;
  title: string;
  body: string;
  /** Page opened when it is clicked, in the recipient's part of the site */
  url: string;
  memberLocalId?: number | null;
  data?: Record<string, unknown>;
}

/** Only these are pushed to devices; older ones are in-app only. */
const PUSH_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** Daily notifications go out from this local hour. */
const DAILY_FROM_HOUR = 9;
/** Days before a membership ends that its member is reminded. */
const MEMBER_REMINDER_DAYS = [7, 3, 1];

const HOME: Record<string, string> = {
  admin: '/admin/notifications',
  manager: '/admin/notifications',
  trainer: '/trainer/notifications',
  member: '/member/notifications',
};

function names(list: string[], max = 5): string {
  const shown = list.slice(0, max).join(', ');
  return list.length > max ? `${shown} and ${list.length - max} more` : shown;
}

/**
 * Notifications addressed to one account, for every role: members about their own
 * membership, trainers about their clients, anyone a message from staff. Desk
 * notifications for admins and managers stay in NotificationsService.
 */
@Injectable()
export class PersonalNotificationsService implements OnModuleInit {
  private readonly logger = new Logger(PersonalNotificationsService.name);
  private readonly textOptions: TextOptions;

  constructor(
    config: ConfigService,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectRepository(Admin) private readonly accounts: Repository<Admin>,
    private readonly dataSource: DataSource,
    private readonly push: PushService,
    private readonly desk: NotificationsService,
    private readonly webAudit: WebAuditService,
    @Optional() private readonly progress?: ProgressService,
  ) {
    this.textOptions = {
      timeZone: config.get<string>('APP_TIMEZONE') || 'Africa/Addis_Ababa',
      currency: config.get<string>('APP_CURRENCY') || 'ETB',
    };
  }

  onModuleInit() {
    this.desk.afterCreated = (created) => this.fromSyncedEvents(created);
    this.desk.afterFreezeChanges = (changes) => this.fromFreezeChanges(changes);
  }

  /**
   * Stores the items (ones already stored are skipped) and pushes the new, recent ones
   * to the recipients' devices. Returns how many were new.
   */
  async create(items: PersonalItem[], occurredAt = new Date()): Promise<number> {
    const rows = items.filter((i) => (PERSONAL_TYPES as readonly string[]).includes(i.type));
    if (rows.length === 0) return 0;
    const result = await this.notifications
      .createQueryBuilder()
      .insert()
      .into(Notification)
      .values(
        rows.map((i) => ({
          eventUid: i.eventUid.slice(0, 64),
          type: i.type,
          title: i.title.slice(0, 255),
          body: i.body,
          recipientId: i.recipientId,
          memberLocalId: i.memberLocalId ?? null,
          transactionLocalId: null,
          data: { ...(i.data ?? {}), url: i.url },
          occurredAt,
        })) as QueryDeepPartialEntity<Notification>[],
      )
      .orIgnore()
      .returning(['id'])
      .execute();
    const ids = (result.raw as { id: number }[]).map((r) => r.id);
    if (ids.length && Date.now() - occurredAt.getTime() <= PUSH_MAX_AGE_MS) {
      await this.pushStored(ids);
    }
    return ids.length;
  }

  /** Pushes stored personal notifications to their recipients' devices. Never throws. */
  private async pushStored(ids: number[]): Promise<void> {
    try {
      const stored = await this.notifications.find({ where: { id: In(ids) } });
      const byType = new Map<string, Notification[]>();
      for (const n of stored) byType.set(n.type, [...(byType.get(n.type) ?? []), n]);
      for (const [type, list] of byType) {
        const subs = await this.push.subscriptionsOf([...new Set(list.map((n) => n.recipientId as number))], type);
        for (const n of list) {
          const mine = subs.filter((s) => s.adminId === n.recipientId);
          if (!mine.length) continue;
          await this.push.send(mine, {
            title: n.title,
            body: n.body,
            url: typeof n.data?.['url'] === 'string' ? (n.data['url'] as string) : '/',
            tag: `notification-${n.id}`,
            type: n.type,
            notificationId: n.id,
            timestamp: n.occurredAt.getTime(),
          });
        }
      }
    } catch (error) {
      this.logger.error(`Failed to push personal notifications: ${error instanceof Error ? error.message : error}`);
    }
  }

  /** The active member account linked to each desktop member id. */
  private async memberAccounts(memberLocalIds: number[]): Promise<Map<number, number>> {
    if (!memberLocalIds.length) return new Map();
    const rows = await this.accounts.find({
      where: { role: 'member', isActive: true, memberLocalId: In(memberLocalIds) },
      select: ['id', 'memberLocalId'],
    });
    return new Map(rows.map((a) => [a.memberLocalId as number, a.id]));
  }

  /** Tells members about their own payments and plan changes that just synced. */
  async fromSyncedEvents(created: Notification[]): Promise<void> {
    const about = created.filter((n) => n.recipientId == null && n.memberLocalId != null && isNotificationType(n.type));
    if (!about.length) return;
    const accounts = await this.memberAccounts([...new Set(about.map((n) => n.memberLocalId as number))]);
    const items: PersonalItem[] = [];
    for (const n of about) {
      const recipientId = accounts.get(n.memberLocalId as number);
      if (!recipientId) continue;
      const text = memberEventText(n.type as NotificationType, n.data ?? {}, this.textOptions);
      if (!text) continue;
      items.push({
        recipientId,
        eventUid: `member:${n.eventUid}`,
        type: text.type,
        title: text.title,
        body: text.body,
        url: '/member/dashboard',
        memberLocalId: n.memberLocalId,
      });
    }
    // Stored with the time it happened, so a backlog from a long-offline desktop is not pushed.
    const when = new Map(about.map((n) => [`member:${n.eventUid}`, n.occurredAt]));
    for (const item of items) await this.create([item], when.get(item.eventUid));
  }

  /** A gym-calendar date, e.g. 14 Nov 2026. */
  private day(date: Date | null): string | null {
    if (!date || isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: this.textOptions.timeZone });
  }

  /** Tells members their membership was frozen, or is active again. */
  async fromFreezeChanges(changes: FreezeChange[]): Promise<void> {
    const accounts = await this.memberAccounts(changes.map((c) => c.memberLocalId));
    const items: PersonalItem[] = [];
    for (const c of changes) {
      const recipientId = accounts.get(c.memberLocalId);
      if (!recipientId) continue;
      const until = this.day(c.frozenUntilDate);
      const ends = this.day(c.subscriptionEndDate);
      items.push(
        c.frozen
          ? {
              recipientId,
              eventUid: `freeze:${c.memberLocalId}:${c.frozenUntilDate?.toISOString() ?? Date.now()}`,
              type: 'freeze_changed',
              title: 'Your membership is frozen',
              body: `${until ? `It's on hold until ${until}.` : "It's on hold for now."} Ask at the front desk if anything looks wrong.`,
              url: '/member/dashboard',
              memberLocalId: c.memberLocalId,
            }
          : {
              recipientId,
              eventUid: `unfreeze:${c.memberLocalId}:${c.subscriptionEndDate.toISOString()}`,
              type: 'freeze_changed',
              title: 'Your membership is active again',
              body: `Welcome back!${ends ? ` Your membership now runs until ${ends}.` : ''}`,
              url: '/member/dashboard',
              memberLocalId: c.memberLocalId,
            },
      );
    }
    if (items.length) await this.create(items);
  }

  // ---- Messages from staff --------------------------------------------------

  /** The active accounts an audience covers. */
  async recipientsFor(audience: MessageAudience, accountIds: number[] = []): Promise<{ id: number; role: string }[]> {
    const tz = this.textOptions.timeZone;
    const today = `(now() AT TIME ZONE $1)::date`;
    const end = `(m."subscriptionEndDate" AT TIME ZONE $1)::date`;
    const memberSql = (where: string) =>
      this.dataSource.query(
        `SELECT a.id, a.role FROM admin a
           JOIN member m ON m."localId" = a."memberLocalId" AND m."deletedAt" IS NULL
          WHERE a."isActive" = true AND a.role = 'member' AND ${where}`,
        [tz],
      ) as Promise<{ id: number; role: string }[]>;
    const byRole = (roles: string[]) =>
      this.accounts.find({ where: { isActive: true, role: In(roles) }, select: ['id', 'role'] });

    switch (audience) {
      case 'all_members':
        return byRole(['member']);
      case 'active_members':
        return memberSql(`m.status = 'active'`);
      case 'expiring_members':
        return memberSql(`m.status = 'active' AND ${end} - ${today} BETWEEN 0 AND 7`);
      case 'inactive_members':
        return memberSql(`m.status = 'inactive'`);
      case 'trainers':
        return byRole(['trainer']);
      case 'managers':
        return byRole(['manager']);
      case 'all_staff':
        return byRole(['admin', 'manager', 'trainer']);
      case 'everyone':
        return byRole(['admin', 'manager', 'trainer', 'member']);
      case 'accounts':
        if (!accountIds.length) return [];
        return this.accounts.find({ where: { isActive: true, id: In(accountIds) }, select: ['id', 'role'] });
    }
  }

  /** Sends a message from staff to an audience, in-app and to their devices. */
  async sendMessage(
    actor: AuditActor,
    input: { title: string; body: string; audience: MessageAudience; accountIds?: number[] },
  ): Promise<{ recipients: number }> {
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || !body) throw new BadRequestException('Write a title and a message');
    const recipients = await this.recipientsFor(input.audience, input.accountIds);
    if (!recipients.length) throw new BadRequestException('Nobody is in that audience');
    const batch = `msg:${Date.now().toString(36)}:${actor.id}`;
    const created = await this.create(
      recipients.map((r) => ({
        recipientId: r.id,
        eventUid: `${batch}:${r.id}`,
        type: 'message',
        title,
        body,
        url: HOME[r.role] ?? '/',
        data: { from: actor.name, fromRole: actor.role },
      })),
    );
    await this.webAudit.record(
      actor,
      'notifications',
      'send',
      `Sent "${title}" to ${created} ${created === 1 ? 'person' : 'people'} (${input.audience.replace(/_/g, ' ')})`,
      { title, body, audience: input.audience, recipients: created },
    );
    return { recipients: created };
  }

  // ---- Daily notifications --------------------------------------------------

  /**
   * Hourly, from 9:00 gym time: membership reminders to members, a client list to each
   * trainer, and a summary of memberships ending soon for the desk. Each is keyed by
   * the day, so running again (or after a restart) sends nothing twice.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async daily(now = new Date()): Promise<void> {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.textOptions.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    if (Number(get('hour')) < DAILY_FROM_HOUR) return;
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    // Progress checks due today or earlier, for members and in their trainer's list.
    const due = this.progress ? await this.progress.dueChecks(this.textOptions.timeZone).catch(() => []) : [];
    for (const [name, job] of [
      ['member reminders', () => this.memberReminders(date)],
      ['progress checks', () => this.progressCheckReminders(due)],
      ['trainer digests', () => this.trainerDigests(date, due)],
      ['expiring summary', () => this.expiringSummary(date)],
    ] as const) {
      try {
        await job();
      } catch (error) {
        this.logger.error(`Daily ${name} failed: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  private async memberReminders(date: string): Promise<void> {
    const rows: { id: number; localId: number; plan: string | null; endDate: string; daysLeft: number }[] =
      await this.dataSource.query(
        `SELECT a.id, m."localId", s.name AS plan,
                to_char((m."subscriptionEndDate" AT TIME ZONE $1)::date, 'DD Mon YYYY') AS "endDate",
                (m."subscriptionEndDate" AT TIME ZONE $1)::date - (now() AT TIME ZONE $1)::date AS "daysLeft"
           FROM admin a
           JOIN member m ON m."localId" = a."memberLocalId" AND m."deletedAt" IS NULL
           LEFT JOIN service s ON s.id = m."serviceId"
          WHERE a."isActive" = true AND a.role = 'member' AND COALESCE(m.frozen, 0) = 0
            AND (m."subscriptionEndDate" AT TIME ZONE $1)::date - (now() AT TIME ZONE $1)::date = ANY($2::int[])`,
        [this.textOptions.timeZone, [...MEMBER_REMINDER_DAYS, -1]],
      );
    const items: PersonalItem[] = rows.map((r) => {
      const days = Number(r.daysLeft);
      const plan = r.plan ? `${r.plan} ` : '';
      return days < 0
        ? {
            recipientId: r.id,
            eventUid: `expired:${r.id}:${date}`,
            type: 'membership_expired',
            title: 'Your membership has ended',
            body: `Your ${plan}membership ended on ${r.endDate}. Renew at the front desk to keep training with us.`,
            url: '/member/dashboard',
            memberLocalId: r.localId,
          }
        : {
            recipientId: r.id,
            eventUid: `expiring:${r.id}:${date}`,
            type: 'membership_expiring',
            title: days === 1 ? 'Your membership ends tomorrow' : `Your membership ends in ${days} days`,
            body: `Your ${plan}membership ends on ${r.endDate}. Renew at the front desk to keep your access.`,
            url: '/member/dashboard',
            memberLocalId: r.localId,
          };
    });
    if (items.length) await this.create(items);
  }

  /** "Time for your progress check", once per due date. */
  private async progressCheckReminders(due: { memberLocalId: number; dueDate: string }[]): Promise<void> {
    if (!due.length) return;
    const accounts = await this.memberAccounts(due.map((d) => d.memberLocalId));
    const items: PersonalItem[] = due
      .filter((d) => accounts.has(d.memberLocalId))
      .map((d) => ({
        recipientId: accounts.get(d.memberLocalId) as number,
        eventUid: `progress-due:${d.memberLocalId}:${d.dueDate}`,
        type: 'progress_check_due',
        title: 'Time for your progress check',
        body: 'Visit the front desk to get measured, so you and your trainer can see how far you have come.',
        url: '/member/progress',
        memberLocalId: d.memberLocalId,
      }));
    if (items.length) await this.create(items);
  }

  private async trainerDigests(
    date: string,
    due: { fullName: string; trainerStaffLocalId: number | null }[] = [],
  ): Promise<void> {
    const tz = this.textOptions.timeZone;
    const rows: { trainerId: number; name: string; kind: 'expiring' | 'expired' | 'absent' | 'check' }[] =
      await this.dataSource.query(
        `WITH clients AS (
           SELECT a.id AS "trainerId", m."fullName" AS name,
                  (m."subscriptionEndDate" AT TIME ZONE $1)::date - (now() AT TIME ZONE $1)::date AS days_left,
                  (now() AT TIME ZONE $1)::date - GREATEST(
                    (m."subscriptionStartDate" AT TIME ZONE $1)::date,
                    COALESCE((SELECT MAX((at.date AT TIME ZONE $1)::date) FROM attendance at
                               WHERE at."memberId" = m.id AND at."deletedAt" IS NULL),
                             (m."subscriptionStartDate" AT TIME ZONE $1)::date)) AS days_away,
                  m.status, COALESCE(m.frozen, 0) AS frozen
             FROM admin a
             JOIN member m ON m."trainerStaffLocalId" = a."staffLocalId" AND m."deletedAt" IS NULL
            WHERE a."isActive" = true AND a.role = 'trainer' AND a."staffLocalId" IS NOT NULL
         )
         SELECT "trainerId", name, 'expiring' AS kind FROM clients WHERE days_left = 3 AND frozen = 0
         UNION ALL SELECT "trainerId", name, 'expired' FROM clients WHERE days_left = -1
         UNION ALL SELECT "trainerId", name, 'absent' FROM clients
                    WHERE status = 'active' AND frozen = 0 AND days_away = 7
         ORDER BY 1, 2`,
        [tz],
      );
    // Clients due for a progress check, on their trainer's list too.
    const staffIds = [...new Set(due.map((d) => d.trainerStaffLocalId).filter((s): s is number => s != null))];
    if (staffIds.length) {
      const trainers = await this.accounts.find({
        where: { role: 'trainer', isActive: true, staffLocalId: In(staffIds) },
        select: ['id', 'staffLocalId'],
      });
      const byStaff = new Map(trainers.map((t) => [t.staffLocalId as number, t.id]));
      for (const d of due) {
        const trainerId = d.trainerStaffLocalId != null ? byStaff.get(d.trainerStaffLocalId) : undefined;
        if (trainerId) rows.push({ trainerId, name: d.fullName, kind: 'check' });
      }
    }
    const byTrainer = new Map<number, typeof rows>();
    for (const r of rows) byTrainer.set(r.trainerId, [...(byTrainer.get(r.trainerId) ?? []), r]);
    const items: PersonalItem[] = [];
    for (const [trainerId, list] of byTrainer) {
      const of = (k: string) => list.filter((r) => r.kind === k).map((r) => r.name.trim());
      const lines = [
        of('expiring').length ? `Ending in 3 days: ${names(of('expiring'))}.` : '',
        of('expired').length ? `Ended yesterday: ${names(of('expired'))}.` : '',
        of('absent').length ? `Not seen for a week: ${names(of('absent'))}.` : '',
        of('check').length ? `Due for a progress check: ${names(of('check'))}.` : '',
      ].filter(Boolean);
      items.push({
        recipientId: trainerId,
        eventUid: `trainer-digest:${trainerId}:${date}`,
        type: 'client_digest',
        title: `${list.length} client${list.length === 1 ? '' : 's'} to check on`,
        body: lines.join(' '),
        url: '/trainer',
      });
    }
    if (items.length) await this.create(items);
  }

  /** One desk notification a day listing memberships that end in the next week. */
  private async expiringSummary(date: string): Promise<void> {
    const rows: { name: string; daysLeft: number }[] = await this.dataSource.query(
      `SELECT m."fullName" AS name,
              (m."subscriptionEndDate" AT TIME ZONE $1)::date - (now() AT TIME ZONE $1)::date AS "daysLeft"
         FROM member m
        WHERE m."deletedAt" IS NULL AND m.status = 'active' AND COALESCE(m.frozen, 0) = 0
          AND (m."subscriptionEndDate" AT TIME ZONE $1)::date - (now() AT TIME ZONE $1)::date BETWEEN 0 AND 7
        ORDER BY 2, 1`,
      [this.textOptions.timeZone],
    );
    if (!rows.length) return;
    const today = rows.filter((r) => Number(r.daysLeft) === 0).length;
    const result = await this.notifications
      .createQueryBuilder()
      .insert()
      .into(Notification)
      .values({
        eventUid: `expiring-summary:${date}`,
        type: 'expiring_summary',
        title: `${rows.length} membership${rows.length === 1 ? '' : 's'} end this week`,
        body: `${today ? `${today} end today. ` : ''}${names(rows.map((r) => r.name.trim()))}.`,
        recipientId: null,
        memberLocalId: null,
        transactionLocalId: null,
        data: { url: '/admin/sms' },
        occurredAt: new Date(),
      } as QueryDeepPartialEntity<Notification>)
      .orIgnore()
      .returning(['id'])
      .execute();
    const ids = (result.raw as { id: number }[]).map((r) => r.id);
    if (ids.length) await this.desk.pushCreated(await this.notifications.find({ where: { id: In(ids) } }));
  }
}
