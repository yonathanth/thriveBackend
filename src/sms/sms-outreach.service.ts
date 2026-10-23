import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BatchResult, SmsService } from './sms.service';

/**
 * Who to text: every member with a phone, active members, members whose membership
 * ends soon, members not seen lately, or members whose membership lapsed.
 */
export type OutreachKind =
  'all' | 'active' | 'expiring' | 'absent' | 'inactive';
export const OUTREACH_KINDS: OutreachKind[] = [
  'all',
  'active',
  'expiring',
  'absent',
  'inactive',
];

export interface OutreachCandidate {
  /** Website member id */
  id: number;
  fullName: string;
  phoneNumber: string;
  serviceName: string | null;
  status: string;
  /** Local date the membership ends, YYYY-MM-DD */
  expiryDate: string | null;
  /** Days until the membership ends (negative once it has) */
  daysLeft: number | null;
  /**
   * The number the list is about: days since the last visit (absent), since the
   * membership ended (inactive), or until it ends (the others).
   */
  days: number;
}

export const DEFAULT_TEMPLATES: Record<OutreachKind, string> = {
  all: 'Hi {name}, ',
  active: 'Hi {name}, ',
  expiring:
    'Hi {name}, your membership expires on {expiry_date} ({days_left} day(s) left). Renew to keep enjoying {service}!',
  absent:
    "Hi {name}, we haven't seen you at the gym for {days} days. We miss you! Come back and keep your progress going.",
  inactive:
    "Hi {name}, we miss you at the gym! It's been {days} days since your membership ended. Come back and renew, we'd love to see you again.",
};

/** One member's message. Placeholders: {name}, {days}, {days_left}, {expiry_date}, {service}, {gym}. */
export function renderOutreach(
  template: string | undefined,
  kind: OutreachKind,
  c: OutreachCandidate,
): string {
  const t = template?.trim() || DEFAULT_TEMPLATES[kind];
  return t
    .replace(/\{name\}/g, c.fullName.trim())
    .replace(/\{days\}/g, String(c.days))
    .replace(
      /\{days_left\}/g,
      c.daysLeft == null ? '' : String(Math.max(c.daysLeft, 0)),
    )
    .replace(/\{expiry_date\}/g, c.expiryDate ?? '')
    .replace(/\{service\}/g, c.serviceName ?? 'your membership')
    .replace(/\{gym\}/g, 'the gym');
}

/**
 * Member lists for sending by hand from the website, from the synced members and
 * attendance, counted in the gym's timezone. Nothing here sends on its own: automatic
 * messages come from the desktop app.
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
   * - all: every member with a phone. active: active members.
   * - expiring: active members whose membership ends within minDays..maxDays (0..7 by default).
   * - absent: active, unfrozen members not seen for at least minDays (1 by default),
   *   counted from their last visit, or their start date if they have not come since.
   * - inactive: members whose membership lapsed at least minDays ago (all by default).
   * `maxDays`, when given, is the most days `days` can be (inclusive).
   */
  async candidates(
    kind: OutreachKind,
    minDays?: number,
    maxDays?: number,
  ): Promise<OutreachCandidate[]> {
    if (!OUTREACH_KINDS.includes(kind))
      throw new BadRequestException(
        `kind must be one of ${OUTREACH_KINDS.join(', ')}`,
      );
    for (const [name, v] of [
      ['minDays', minDays],
      ['maxDays', maxDays],
    ] as const) {
      if (v != null && (!Number.isInteger(v) || v < 0)) {
        throw new BadRequestException(`${name} must be a whole number of days`);
      }
    }
    if (minDays != null && maxDays != null && maxDays < minDays) {
      throw new BadRequestException('The range ends before it starts');
    }
    const today = `(now() AT TIME ZONE $1)::date`;
    const local = (col: string) => `(${col} AT TIME ZONE $1)::date`;
    const end = local('m."subscriptionEndDate"');
    const lastSeen = `GREATEST(${local('m."subscriptionStartDate"')}, COALESCE(
        (SELECT MAX(${local('a.date')}) FROM attendance a WHERE a."memberId" = m.id AND a."deletedAt" IS NULL),
        ${local('m."subscriptionStartDate"')}))`;
    const spec: Record<
      OutreachKind,
      {
        days: string;
        where: string;
        order: string;
        min: number | null;
        max: number | null;
      }
    > = {
      all: {
        days: `${end} - ${today}`,
        where: 'TRUE',
        order: 'x."fullName"',
        min: null,
        max: null,
      },
      active: {
        days: `${end} - ${today}`,
        where: `m.status = 'active'`,
        order: 'x."fullName"',
        min: null,
        max: null,
      },
      expiring: {
        days: `${end} - ${today}`,
        where: `m.status = 'active' AND COALESCE(m.frozen, 0) = 0`,
        order: 'x.days ASC, x."fullName"',
        min: 0,
        max: 7,
      },
      absent: {
        days: `${today} - ${lastSeen}`,
        where: `m.status = 'active' AND COALESCE(m.frozen, 0) = 0`,
        order: 'x.days DESC, x."fullName"',
        min: 1,
        max: null,
      },
      inactive: {
        days: `${today} - LEAST(${end}, ${today})`,
        where: `m.status = 'inactive'`,
        order: 'x.days ASC, x."fullName"',
        min: 0,
        max: null,
      },
    };
    const s = spec[kind];
    const sql = `SELECT * FROM (
        SELECT m.id, m."fullName", m."phoneNumber", s.name AS "serviceName", m.status,
               to_char(${end}, 'YYYY-MM-DD') AS "expiryDate", ${end} - ${today} AS "daysLeft",
               ${s.days} AS days
          FROM member m LEFT JOIN service s ON s.id = m."serviceId"
         WHERE m."deletedAt" IS NULL AND TRIM(COALESCE(m."phoneNumber", '')) <> '' AND ${s.where}
      ) x
      WHERE ($2::int IS NULL OR x.days >= $2) AND ($3::int IS NULL OR x.days <= $3)
      ORDER BY ${s.order}`;
    const rows: OutreachCandidate[] = await this.dataSource.query(sql, [
      this.timeZone,
      minDays ?? s.min,
      maxDays ?? s.max,
    ]);
    return rows.map((r) => ({
      ...r,
      days: Number(r.days ?? 0),
      daysLeft: r.daysLeft == null ? null : Number(r.daysLeft),
    }));
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
  ): Promise<BatchResult & { skipped: number }> {
    const wanted = new Set(memberIds);
    const chosen = (await this.candidates(kind, minDays, maxDays)).filter((c) =>
      wanted.has(c.id),
    );
    const result = await this.sms.sendBatch(
      chosen.map((c) => ({
        phone: c.phoneNumber,
        message: renderOutreach(template, kind, c),
        memberId: c.id,
      })),
    );
    return { ...result, skipped: memberIds.length - chosen.length };
  }
}
