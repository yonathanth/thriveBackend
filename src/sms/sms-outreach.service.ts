import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { SmsService } from './sms.service';

export type OutreachKind = 'absent' | 'inactive';

export interface OutreachCandidate {
  /** Website member id */
  id: number;
  fullName: string;
  phoneNumber: string;
  serviceName: string | null;
  /** Days since the last visit (absent) or since the membership ended (inactive) */
  days: number;
}

export const DEFAULT_TEMPLATES: Record<OutreachKind, string> = {
  absent:
    "Hi {name}, we haven't seen you at the gym for {days} days. We miss you! Come back and keep your progress going.",
  inactive:
    "Hi {name}, we miss you at the gym! It's been {days} days since your membership ended. Come back and renew, we'd love to see you again.",
};

/** AfroMessage takes personalised messages in batches; smaller ones fail more gracefully. */
const SEND_BATCH = 100;

export function renderOutreach(template: string | undefined, kind: OutreachKind, c: OutreachCandidate): string {
  const t = template?.trim() || DEFAULT_TEMPLATES[kind];
  return t
    .replace(/\{name\}/g, c.fullName.trim())
    .replace(/\{days\}/g, String(c.days))
    .replace(/\{service\}/g, c.serviceName ?? 'your membership')
    .replace(/\{gym\}/g, 'the gym');
}

/**
 * The website's by-hand version of the desktop's absent / inactive member SMS: the
 * lists come from the synced members and attendance, counted in the gym's timezone.
 */
@Injectable()
export class SmsOutreachService {
  private readonly timeZone: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly sms: SmsService,
    config: ConfigService,
  ) {
    this.timeZone = config.get<string>('APP_TIMEZONE') || 'Africa/Addis_Ababa';
  }

  /**
   * Absent: active, unfrozen members not seen for at least `minDays` (counted from
   * their last visit, or their start date if they have not come since).
   * Inactive: members whose membership lapsed at least `minDays` ago; all when omitted.
   * `maxDays`, when given, is the most days either can be (inclusive).
   */
  async candidates(kind: OutreachKind, minDays?: number, maxDays?: number): Promise<OutreachCandidate[]> {
    for (const [name, v] of [['minDays', minDays], ['maxDays', maxDays]] as const) {
      if (v != null && (!Number.isInteger(v) || v < 0)) {
        throw new BadRequestException(`${name} must be a whole number of days`);
      }
    }
    if (minDays != null && maxDays != null && maxDays < minDays) {
      throw new BadRequestException('The range ends before it starts');
    }
    const today = `(now() AT TIME ZONE $1)::date`;
    const local = (col: string) => `(${col} AT TIME ZONE $1)::date`;
    const sql =
      kind === 'absent'
        ? `SELECT * FROM (
             SELECT m.id, m."fullName", m."phoneNumber", s.name AS "serviceName",
                    ${today} - GREATEST(
                      ${local('m."subscriptionStartDate"')},
                      COALESCE(
                        (SELECT MAX(${local('a.date')}) FROM attendance a
                          WHERE a."memberId" = m.id AND a."deletedAt" IS NULL),
                        ${local('m."subscriptionStartDate"')})) AS days
               FROM member m LEFT JOIN service s ON s.id = m."serviceId"
              WHERE m."deletedAt" IS NULL AND m.status = 'active' AND COALESCE(m.frozen, 0) = 0
                AND TRIM(COALESCE(m."phoneNumber", '')) <> ''
           ) x WHERE x.days >= $2 AND ($3::int IS NULL OR x.days <= $3) ORDER BY x.days DESC, x."fullName"`
        : `SELECT * FROM (
             SELECT m.id, m."fullName", m."phoneNumber", s.name AS "serviceName",
                    ${today} - LEAST(${local('m."subscriptionEndDate"')}, ${today}) AS days
               FROM member m LEFT JOIN service s ON s.id = m."serviceId"
              WHERE m."deletedAt" IS NULL AND m.status = 'inactive'
                AND TRIM(COALESCE(m."phoneNumber", '')) <> ''
           ) x WHERE x.days >= $2 AND ($3::int IS NULL OR x.days <= $3) ORDER BY x.days ASC, x."fullName"`;
    const rows: OutreachCandidate[] = await this.dataSource.query(sql, [
      this.timeZone,
      minDays ?? (kind === 'absent' ? 1 : 0),
      maxDays ?? null,
    ]);
    return rows.map(r => ({ ...r, days: Number(r.days) }));
  }

  /**
   * Sends to the chosen members of the list as it is now, each with their own message.
   * Members who have since left the list are skipped.
   */
  async send(
    kind: OutreachKind,
    memberIds: number[],
    minDays?: number,
    template?: string,
    maxDays?: number,
  ): Promise<{ sent: number; skipped: number; campaignIds: string[] }> {
    const wanted = new Set(memberIds);
    const chosen = (await this.candidates(kind, minDays, maxDays)).filter(c => wanted.has(c.id));
    const campaign = kind === 'absent' ? 'absent-members' : 'inactive-members';
    const campaignIds: string[] = [];
    let sent = 0;
    for (let i = 0; i < chosen.length; i += SEND_BATCH) {
      const batch = chosen.slice(i, i + SEND_BATCH);
      const result = await this.sms.sendPersonalizedBulk(
        batch.map(c => ({ phone: c.phoneNumber, message: renderOutreach(template, kind, c) })),
        campaign,
      );
      sent += result.count;
      if (result.campaignId) campaignIds.push(result.campaignId);
    }
    return { sent, skipped: memberIds.length - chosen.length, campaignIds };
  }
}
