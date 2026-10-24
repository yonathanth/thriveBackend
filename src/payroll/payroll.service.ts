import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';
import { PaymentMethod } from '../entities/payment-method.entity';
import { Service } from '../entities/service.entity';
import { Staff } from '../entities/staff.entity';
import { StaffPaySetup } from '../entities/staff-pay-setup.entity';
import { StaffPayout } from '../entities/staff-payout.entity';
import { StaffRevenueShare } from '../entities/staff-revenue-share.entity';
import { SyncRecord } from '../entities/sync-record.entity';
import { AuditActor, WebAuditService } from '../web-audit/web-audit.service';
import {
  addDays,
  describeShare,
  isDate,
  payoutLines,
  periodsUpTo,
  round2,
  shareAmount,
  shareProblem,
  type PayoutLine,
  type ShareTakings,
} from './pay-periods';

export type { PayoutLine } from './pay-periods';

/** building: the period is running; due: ended, waiting to be paid; paid: paid, figures frozen. */
export type PayoutStatus = 'building' | 'due' | 'paid';

export interface PayoutView {
  id: number;
  staffLocalId: number;
  staffName: string;
  periodStart: string;
  periodLast: string;
  status: PayoutStatus;
  calculatedAmount: number;
  lines: PayoutLine[];
  computedAt: string | null;
  payment: {
    paidAmount: number;
    paidDate: string;
    paymentMethod: string | null;
    note: string | null;
    paidByName: string;
    paidAt: string;
    /** The gym app has its copy of this payment */
    collected: boolean;
  } | null;
}

export interface SetupInput {
  baseType: string;
  baseAmount: number;
  cycle: string;
  cycleDays: number;
  cycleStart: string;
  deductAbsence: boolean;
  workDays: number[];
  active: boolean;
}

export interface ShareInput {
  id?: number | null;
  scope: string;
  targetKind?: string | null;
  targetLocalId?: number | null;
  rateType: string;
  rate: number;
}

export interface ShareView {
  id: number;
  scope: string;
  targetKind: string | null;
  targetLocalId: number | null;
  rateType: string;
  rate: number;
  description: string;
}

export interface StaffPayView {
  staffLocalId: number;
  name: string;
  role: string | null;
  status: string | null;
  setup:
    (SetupInput & { updatedAt: string; updatedByName: string | null }) | null;
  shares: ShareView[];
  current: { periodStart: string; periodLast: string; amount: number } | null;
  due: { count: number; amount: number };
}

export interface Target {
  id: number;
  name: string;
}
export type Targets = Record<'plan' | 'addon' | 'drop_in', Target[]>;

export interface PayInput {
  paidAmount: number;
  paidDate: string;
  paymentMethod?: string | null;
  note?: string | null;
}

const MAX_SHARES = 20;

/** A synced add-on's or drop-in's name. */
function recordName(r: SyncRecord): string {
  const name = r.data['name'];
  return typeof name === 'string' && name ? name : `#${r.localId}`;
}

/**
 * Payroll, run on the website. Admins set each person's pay and revenue shares here;
 * pay periods are calculated from the attendance and payments the gym app syncs, and
 * an admin marks each finished one paid with what was actually paid. The gym app
 * collects paid payouts and books them as expenses, which sync back as transactions.
 */
@Injectable()
export class PayrollService {
  private readonly timeZone: string;

  constructor(
    @InjectRepository(StaffPaySetup)
    private readonly setups: Repository<StaffPaySetup>,
    @InjectRepository(StaffRevenueShare)
    private readonly shares: Repository<StaffRevenueShare>,
    @InjectRepository(StaffPayout)
    private readonly payouts: Repository<StaffPayout>,
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
    @InjectRepository(Service) private readonly plans: Repository<Service>,
    @InjectRepository(SyncRecord)
    private readonly records: Repository<SyncRecord>,
    @InjectRepository(PaymentMethod)
    private readonly methods: Repository<PaymentMethod>,
    private readonly dataSource: DataSource,
    private readonly webAudit: WebAuditService,
    config: ConfigService,
  ) {
    this.timeZone = config.get<string>('APP_TIMEZONE') || 'Africa/Addis_Ababa';
  }

  /** Today in the gym's time zone, YYYY-MM-DD. */
  today(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  // ---- Targets ----------------------------------------------------------------------

  /** Plans, add-ons and drop-ins a revenue share can be narrowed to. */
  async targets(): Promise<Targets> {
    const [plans, addons, dropIns] = await Promise.all([
      this.plans.find({ order: { name: 'ASC' } }),
      this.records.find({ where: { entity: 'additional_service' } }),
      this.records.find({ where: { entity: 'usage_service' } }),
    ]);
    const named = (rows: SyncRecord[]) =>
      rows
        .map((r) => ({
          id: r.localId,
          name: recordName(r),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    return {
      plan: plans.map((p) => ({ id: p.localId, name: p.name })),
      addon: named(addons),
      drop_in: named(dropIns),
    };
  }

  /** Names of targets, including ones deleted since, for describing old shares. */
  private async targetNames(): Promise<Map<string, string>> {
    const [plans, others] = await Promise.all([
      this.plans.find({ withDeleted: true }),
      this.records.find({
        where: { entity: In(['additional_service', 'usage_service']) },
        withDeleted: true,
      }),
    ]);
    const names = new Map<string, string>();
    for (const p of plans) names.set(`plan:${p.localId}`, p.name);
    for (const r of others) {
      const kind = r.entity === 'additional_service' ? 'addon' : 'drop_in';
      names.set(`${kind}:${r.localId}`, recordName(r));
    }
    return names;
  }

  private shareView(
    s: StaffRevenueShare,
    names: Map<string, string>,
  ): ShareView {
    const name =
      s.targetKind && s.targetLocalId != null
        ? (names.get(`${s.targetKind}:${s.targetLocalId}`) ??
          `#${s.targetLocalId}`)
        : null;
    return {
      id: s.id,
      scope: s.scope,
      targetKind: s.targetKind,
      targetLocalId: s.targetLocalId,
      rateType: s.rateType,
      rate: s.rate,
      description: describeShare(s, name),
    };
  }

  // ---- Pay setup --------------------------------------------------------------------

  /** Everyone on staff with their pay setup, shares, this period so far and what is due. */
  async staffList(): Promise<{ staff: StaffPayView[]; targets: Targets }> {
    await this.refreshAll();
    const [people, setups, shares, open, names, targets] = await Promise.all([
      this.staff.find({ order: { fullName: 'ASC' } }),
      this.setups.find(),
      this.shares.find({ order: { id: 'ASC' } }),
      this.payouts.find({ where: { status: In(['building', 'due']) } }),
      this.targetNames(),
      this.targets(),
    ]);
    const setupOf = new Map(setups.map((s) => [s.staffLocalId, s]));
    const list = people
      // People who left only stay listed while they have pay set up.
      .filter((p) => p.status !== 'terminated' || setupOf.has(p.localId))
      .map((p) => {
        const mine = open.filter((o) => o.staffLocalId === p.localId);
        const running = mine.find((o) => o.status === 'building');
        const due = mine.filter((o) => o.status === 'due');
        const setup = setupOf.get(p.localId);
        return {
          staffLocalId: p.localId,
          name: p.fullName,
          role: p.role,
          status: p.status,
          setup: setup ? this.setupView(setup) : null,
          shares: shares
            .filter((s) => s.staffLocalId === p.localId)
            .map((s) => this.shareView(s, names)),
          current: running
            ? {
                periodStart: running.periodStart,
                periodLast: addDays(running.periodEnd, -1),
                amount: running.calculatedAmount,
              }
            : null,
          due: {
            count: due.length,
            amount: round2(due.reduce((sum, d) => sum + d.calculatedAmount, 0)),
          },
        };
      });
    return { staff: list, targets };
  }

  private setupView(s: StaffPaySetup): StaffPayView['setup'] {
    return {
      baseType: s.baseType,
      baseAmount: s.baseAmount,
      cycle: s.cycle,
      cycleDays: s.cycleDays,
      cycleStart: s.cycleStart,
      deductAbsence: s.deductAbsence,
      workDays: [...s.workDays].sort((a, b) => a - b),
      active: s.active,
      updatedAt: s.updatedAt.toISOString(),
      updatedByName: s.updatedByName,
    };
  }

  private checkSetup(input: SetupInput): SetupInput {
    if (!['none', 'monthly', 'daily'].includes(input.baseType))
      throw new BadRequestException('Choose how the base pay works');
    if (!['monthly', 'days'].includes(input.cycle))
      throw new BadRequestException('Choose a pay cycle');
    const cycleDays = Math.round(Number(input.cycleDays));
    if (input.cycle === 'days' && !(cycleDays >= 7 && cycleDays <= 62))
      throw new BadRequestException('A pay period is 7 to 62 days');
    const baseAmount = round2(Number(input.baseAmount));
    if (!Number.isFinite(baseAmount) || baseAmount < 0)
      throw new BadRequestException('Enter a base amount of 0 or more');
    if (!isDate(input.cycleStart ?? ''))
      throw new BadRequestException(
        'Enter the day the first pay period starts',
      );
    const workDays = [...new Set((input.workDays ?? []).map(Number))]
      .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
      .sort((a, b) => a - b);
    const deductAbsence = input.baseType === 'monthly' && !!input.deductAbsence;
    if ((deductAbsence || input.baseType === 'daily') && workDays.length === 0)
      throw new BadRequestException(
        'Choose the days they are expected at work',
      );
    return {
      baseType: input.baseType,
      baseAmount: input.baseType === 'none' ? 0 : baseAmount,
      cycle: input.cycle,
      cycleDays: input.cycle === 'days' ? cycleDays : 30,
      cycleStart: input.cycleStart,
      deductAbsence,
      workDays,
      active: !!input.active,
    };
  }

  /**
   * Saves a person's pay setup and revenue shares together: the shares sent replace
   * theirs (an id keeps an existing one). Unpaid periods are recalculated at once.
   */
  async save(
    actor: AuditActor,
    staffLocalId: number,
    input: { setup: SetupInput; shares: ShareInput[] },
  ): Promise<StaffPayView> {
    const person = await this.staff.findOne({
      where: { localId: staffLocalId },
    });
    if (!person) throw new NotFoundException('Staff member not found');
    const setup = this.checkSetup(input.setup);
    const shares = (input.shares ?? []).map((s) => ({
      id: s.id ?? null,
      scope: s.scope,
      targetKind: s.targetKind ?? null,
      targetLocalId: s.targetLocalId ?? null,
      rateType: s.rateType,
      rate: round2(Number(s.rate)),
    }));
    if (shares.length > MAX_SHARES)
      throw new BadRequestException(
        `At most ${MAX_SHARES} revenue shares per person`,
      );
    shares.forEach((s, i) => {
      const problem = shareProblem(s);
      if (problem)
        throw new BadRequestException(`Revenue share ${i + 1}: ${problem}`);
    });

    // Paid periods are settled: a new cycle may not cut across one.
    const paid = await this.payouts.find({
      where: { staffLocalId, status: 'paid' },
    });
    for (const period of periodsUpTo(setup, this.today())) {
      const clash = paid.find(
        (p) =>
          p.periodStart < period.end &&
          period.start < p.periodEnd &&
          !(p.periodStart === period.start && p.periodEnd === period.end),
      );
      if (clash) {
        const latest = paid.reduce((a, b) =>
          a.periodEnd > b.periodEnd ? a : b,
        );
        throw new ConflictException(
          `These pay periods would overlap ones already paid. Start the first period on or after ${latest.periodEnd}.`,
        );
      }
    }

    const before = await this.setups.findOne({ where: { staffLocalId } });
    await this.dataSource.transaction(async (m) => {
      await m
        .getRepository(StaffPaySetup)
        .upsert({ staffLocalId, ...setup, updatedByName: actor.name }, [
          'staffLocalId',
        ]);
      const repo = m.getRepository(StaffRevenueShare);
      const keep = shares
        .filter((s) => s.id != null)
        .map((s) => s.id as number);
      await repo.delete(
        keep.length ? { staffLocalId, id: Not(In(keep)) } : { staffLocalId },
      );
      for (const s of shares) {
        const values = {
          staffLocalId,
          scope: s.scope,
          targetKind: s.targetKind,
          targetLocalId: s.targetLocalId,
          rateType: s.rateType,
          rate: s.rate,
        };
        if (s.id != null) {
          const done = await repo.update({ id: s.id, staffLocalId }, values);
          if (!done.affected) await repo.insert(values);
        } else {
          await repo.insert(values);
        }
      }
    });
    await this.refreshStaff(staffLocalId);

    const names = await this.targetNames();
    const saved = await this.shares.find({
      where: { staffLocalId },
      order: { id: 'ASC' },
    });
    const words = saved.map((s) => this.shareView(s, names).description);
    await this.webAudit.record(
      actor,
      'payroll',
      before ? 'setup_changed' : 'setup_created',
      `${before ? 'Changed' : 'Set up'} ${person.fullName}'s pay: ${this.setupWords(setup)}` +
        (words.length
          ? `; shares: ${words.join('; ')}`
          : '; no revenue shares'),
      { staffLocalId, setup, shares },
    );
    const { staff } = await this.staffList();
    return staff.find((s) => s.staffLocalId === staffLocalId)!;
  }

  private setupWords(s: SetupInput): string {
    const base =
      s.baseType === 'monthly'
        ? `${s.baseAmount} per period`
        : s.baseType === 'daily'
          ? `${s.baseAmount} per day checked in`
          : 'no base';
    const cycle =
      s.cycle === 'monthly' ? 'monthly' : `every ${s.cycleDays} days`;
    return `${base}, ${cycle} from ${s.cycleStart}${s.active ? '' : ' (off payroll)'}`;
  }

  // ---- Calculation ------------------------------------------------------------------

  private async attendedDays(
    staffLocalId: number,
    start: string,
    end: string,
  ): Promise<number> {
    const rows: { n: number }[] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT ("scannedAt" AT TIME ZONE $4)::date)::int AS n
         FROM staff_attendance
        WHERE "staffLocalId" = $1 AND "deletedAt" IS NULL
          AND ("scannedAt" AT TIME ZONE $4)::date >= $2::date
          AND ("scannedAt" AT TIME ZONE $4)::date < $3::date`,
      [staffLocalId, start, end, this.timeZone],
    );
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * A share's payments in a period, less refunds. Who was assigned when the member
   * paid comes from the gym app's payment_staff record; a payment synced without one
   * (an older gym app) falls back to today's assignment.
   */
  private async takings(
    s: StaffRevenueShare,
    start: string,
    end: string,
  ): Promise<{ payments: number; revenue: number }> {
    const memberTrainer = `CASE WHEN ps.id IS NOT NULL THEN (ps.data->>'member_trainer_id')::int ELSE m."trainerStaffLocalId" END`;
    const addonTrainer = `CASE WHEN ps.id IS NOT NULL THEN (ps.data->>'addon_trainer_id')::int ELSE (
        SELECT (sub.data->>'trainer_staff_id')::int FROM sync_record sub
         WHERE sub.entity = 'member_additional_subscription' AND sub."deletedAt" IS NULL
           AND sub."memberLocalId" = t."memberLocalId"
           AND (sub.data->>'additional_service_id')::int = t."additionalServiceLocalId"
         ORDER BY sub."localId" DESC LIMIT 1) END`;
    const plan = `t."serviceLocalId" IS NOT NULL AND t."additionalServiceLocalId" IS NULL
                  AND t."usageServiceLocalId" IS NULL AND t."stockCountLocalId" IS NULL`;
    let filter: string;
    switch (s.scope) {
      case 'assigned_members':
        filter = `${plan} AND ${memberTrainer} = $1 AND ($2::int IS NULL OR t."serviceLocalId" = $2)`;
        break;
      case 'addon_trainer':
        filter = `t."additionalServiceLocalId" IS NOT NULL AND ${addonTrainer} = $1
                  AND ($2::int IS NULL OR t."additionalServiceLocalId" = $2)`;
        break;
      case 'drop_in_instructor':
        filter = `t."usageServiceLocalId" IS NOT NULL AND ($2::int IS NULL OR t."usageServiceLocalId" = $2)
                  AND EXISTS (SELECT 1 FROM sync_record su
                               WHERE su.entity = 'service_usage' AND su."deletedAt" IS NULL
                                 AND (su.data->>'transaction_id')::int = t."localId"
                                 AND (su.data->>'trainer_staff_id')::int = $1)`;
        break;
      default:
        filter =
          s.targetKind === 'plan'
            ? `$1::int IS NOT NULL AND ${plan} AND t."serviceLocalId" = $2`
            : s.targetKind === 'addon'
              ? `$1::int IS NOT NULL AND t."additionalServiceLocalId" = $2`
              : `$1::int IS NOT NULL AND t."usageServiceLocalId" = $2`;
    }
    const rows: { payments: number; gross: number; refunded: number }[] =
      await this.dataSource.query(
        `SELECT COUNT(*)::int AS payments,
                COALESCE(SUM(t.amount), 0)::float AS gross,
                COALESCE(SUM((SELECT COALESCE(SUM(rf.amount), 0) FROM "transaction" rf
                                WHERE rf."referenceTransactionId" = t."localId"
                                  AND rf."transactionType" = 'negative_return'
                                  AND rf."deletedAt" IS NULL)), 0)::float AS refunded
           FROM "transaction" t
           LEFT JOIN sync_record ps ON ps.entity = 'payment_staff' AND ps."localId" = t."localId" AND ps."deletedAt" IS NULL
           LEFT JOIN member m ON m."localId" = t."memberLocalId"
          WHERE t."deletedAt" IS NULL AND t."transactionType" = 'income'
            AND COALESCE(t."paymentStatus", 'paid') NOT IN ('cancelled', 'refunded', 'pending')
            AND (t."transactionDate" AT TIME ZONE $5)::date >= $3::date
            AND (t."transactionDate" AT TIME ZONE $5)::date < $4::date
            AND ${filter}`,
        [s.staffLocalId, s.targetLocalId, start, end, this.timeZone],
      );
    const r = rows[0] ?? { payments: 0, gross: 0, refunded: 0 };
    return {
      payments: Number(r.payments),
      revenue: round2(Number(r.gross) - Number(r.refunded)),
    };
  }

  private async calculate(
    setup: StaffPaySetup,
    shares: StaffRevenueShare[],
    names: Map<string, string>,
    period: { start: string; end: string },
    until: string,
  ) {
    const attended = await this.attendedDays(
      setup.staffLocalId,
      period.start,
      period.end,
    );
    const takings: ShareTakings[] = [];
    for (const s of shares) {
      const { payments, revenue } = await this.takings(
        s,
        period.start,
        period.end,
      );
      takings.push({
        shareId: s.id,
        label: this.shareView(s, names).description,
        payments,
        revenue,
        amount: shareAmount(s.rateType, s.rate, payments, revenue),
      });
    }
    return payoutLines(setup, period, until, attended, takings);
  }

  /**
   * Brings one person's unpaid payouts up to date with their setup and the latest
   * synced data. Paid payouts are never touched; unpaid ones that no longer match the
   * pay cycle (it was changed) are removed.
   */
  async refreshStaff(
    staffLocalId: number,
    names?: Map<string, string>,
  ): Promise<void> {
    const today = this.today();
    const setup = await this.setups.findOne({ where: { staffLocalId } });
    const existing = await this.payouts.find({ where: { staffLocalId } });
    const paid = existing.filter((p) => p.status === 'paid');
    const wanted = setup?.active ? periodsUpTo(setup, today) : [];
    // Off payroll: finished periods stay owed, the running one goes.
    const keepUnpaid = (p: StaffPayout) =>
      wanted.some((w) => w.start === p.periodStart && w.end === p.periodEnd) ||
      (!setup?.active && p.status === 'due');
    const stale = existing.filter((p) => p.status !== 'paid' && !keepUnpaid(p));
    if (stale.length)
      await this.payouts.delete({
        id: In(stale.map((p) => p.id)),
        status: Not('paid'),
      });
    if (!setup?.active) return;

    const shares = await this.shares.find({ where: { staffLocalId } });
    const nameMap = names ?? (await this.targetNames());
    for (const period of wanted) {
      if (
        paid.some(
          (p) => p.periodStart < period.end && period.start < p.periodEnd,
        )
      )
        continue;
      const until = period.ended ? addDays(period.end, -1) : today;
      const { total, lines } = await this.calculate(
        setup,
        shares,
        nameMap,
        period,
        until,
      );
      await this.dataSource.query(
        `INSERT INTO staff_payout ("staffLocalId", "periodStart", "periodEnd", status, "calculatedAmount", lines, "computedAt")
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
         ON CONFLICT ("staffLocalId", "periodStart") DO UPDATE SET
           "periodEnd" = EXCLUDED."periodEnd", status = EXCLUDED.status,
           "calculatedAmount" = EXCLUDED."calculatedAmount", lines = EXCLUDED.lines,
           "computedAt" = EXCLUDED."computedAt", "updatedAt" = now()
         WHERE staff_payout.status <> 'paid'`,
        [
          staffLocalId,
          period.start,
          period.end,
          period.ended ? 'due' : 'building',
          total,
          JSON.stringify(lines),
        ],
      );
    }
  }

  async refreshAll(): Promise<void> {
    const [setups, stray, names] = await Promise.all([
      this.setups.find(),
      this.payouts.find({
        where: { status: Not('paid') },
        select: { staffLocalId: true },
      }),
      this.targetNames(),
    ]);
    const ids = new Set([
      ...setups.map((s) => s.staffLocalId),
      ...stray.map((p) => p.staffLocalId),
    ]);
    for (const id of ids) await this.refreshStaff(id, names);
  }

  // ---- Payouts ----------------------------------------------------------------------

  private async views(rows: StaffPayout[]): Promise<PayoutView[]> {
    if (!rows.length) return [];
    const people = await this.staff.find({
      where: { localId: In([...new Set(rows.map((r) => r.staffLocalId))]) },
      withDeleted: true,
    });
    const nameOf = new Map(people.map((s) => [s.localId, s.fullName]));
    return rows.map((r) => ({
      id: r.id,
      staffLocalId: r.staffLocalId,
      staffName: nameOf.get(r.staffLocalId) ?? `Staff #${r.staffLocalId}`,
      periodStart: r.periodStart,
      periodLast: addDays(r.periodEnd, -1),
      status: r.status as PayoutStatus,
      calculatedAmount: r.calculatedAmount,
      lines: (Array.isArray(r.lines) ? r.lines : []) as PayoutLine[],
      computedAt: r.computedAt?.toISOString() ?? null,
      payment:
        r.status === 'paid'
          ? {
              paidAmount: r.paidAmount ?? 0,
              paidDate: r.paidDate ?? '',
              paymentMethod: r.paymentMethod,
              note: r.note,
              paidByName: r.paidByName ?? '',
              paidAt: r.paidAt?.toISOString() ?? '',
              collected: r.collectedRevision === r.revision,
            }
          : null,
    }));
  }

  /** Every payout, newest period first, after bringing unpaid ones up to date. */
  async list(): Promise<{ payouts: PayoutView[]; paymentMethods: string[] }> {
    await this.refreshAll();
    const [rows, methods] = await Promise.all([
      this.payouts.find({
        order: { periodStart: 'DESC', id: 'DESC' },
        take: 500,
      }),
      this.methods.find({ where: { isActive: true }, order: { name: 'ASC' } }),
    ]);
    return {
      payouts: await this.views(rows),
      paymentMethods: methods.map((m) => m.name),
    };
  }

  /** The signed-in staff member's own payslips. */
  async mine(staffLocalId: number | null): Promise<PayoutView[]> {
    if (staffLocalId == null) return [];
    await this.refreshStaff(staffLocalId);
    return this.views(
      await this.payouts.find({
        where: { staffLocalId },
        order: { periodStart: 'DESC' },
        take: 60,
      }),
    );
  }

  /**
   * Marks a finished period paid with what was actually paid, freezing its figures
   * as they are now. Paying again changes the payment.
   */
  async pay(
    actor: AuditActor,
    id: number,
    input: PayInput,
  ): Promise<PayoutView> {
    const found = await this.payouts.findOne({ where: { id } });
    if (!found) throw new NotFoundException('Payout not found');
    if (found.status === 'building')
      throw new BadRequestException('This pay period has not ended yet');
    const paidAmount = round2(Number(input.paidAmount));
    if (!Number.isFinite(paidAmount) || paidAmount < 0)
      throw new BadRequestException('Enter the amount paid');
    if (!isDate(input.paidDate ?? ''))
      throw new BadRequestException('Enter the date it was paid');
    const method = input.paymentMethod?.trim() || null;
    const note = input.note?.trim() || null;
    const changing = found.status === 'paid';
    // The latest figures, so what is frozen is what the admin is paying against.
    if (!changing) await this.refreshStaff(found.staffLocalId);

    const done = await this.payouts
      .createQueryBuilder()
      .update(StaffPayout)
      .set({
        status: 'paid',
        paidAmount,
        paidDate: input.paidDate,
        paymentMethod: method,
        note,
        paidById: actor.id,
        paidByName: actor.name,
        paidAt: new Date(),
        revision: () => 'revision + 1',
      })
      .where('id = :id AND status = :status', {
        id,
        status: changing ? 'paid' : 'due',
      })
      .execute();
    if (!done.affected)
      throw new ConflictException('This payout changed; reload and try again');

    const [view] = await this.views([
      (await this.payouts.findOne({ where: { id } }))!,
    ]);
    const differs = Math.abs(paidAmount - view.calculatedAmount) >= 0.005;
    await this.webAudit.record(
      actor,
      'payroll',
      changing ? 'payment_changed' : 'paid',
      `${changing ? 'Changed the payment of' : 'Paid'} ${view.staffName}'s pay for ${view.periodStart} to ${view.periodLast}: ` +
        `${paidAmount}${differs ? ` (calculated ${view.calculatedAmount})` : ''}`,
      {
        payoutId: id,
        staffLocalId: view.staffLocalId,
        calculatedAmount: view.calculatedAmount,
        paidAmount,
        paidDate: input.paidDate,
        paymentMethod: method,
        note,
      },
    );
    return view;
  }

  /** Undoes a payment recorded by mistake: the period is due again and recalculated. */
  async unpay(actor: AuditActor, id: number): Promise<PayoutView> {
    const found = await this.payouts.findOne({ where: { id } });
    if (!found) throw new NotFoundException('Payout not found');
    if (found.status !== 'paid')
      throw new BadRequestException('This payout is not marked paid');
    await this.payouts
      .createQueryBuilder()
      .update(StaffPayout)
      .set({
        status: 'due',
        paidAmount: null,
        paidDate: null,
        paymentMethod: null,
        note: null,
        paidById: null,
        paidByName: null,
        paidAt: null,
        revision: () => 'revision + 1',
      })
      .where('id = :id AND status = :status', { id, status: 'paid' })
      .execute();
    await this.refreshStaff(found.staffLocalId);
    const after = await this.payouts.findOne({ where: { id } });
    const [view] = await this.views([after ?? { ...found, status: 'due' }]);
    await this.webAudit.record(
      actor,
      'payroll',
      'payment_undone',
      `Undid the payment of ${view.staffName}'s pay for ${view.periodStart} to ${view.periodLast} (${found.paidAmount} had been recorded)`,
      {
        payoutId: id,
        staffLocalId: found.staffLocalId,
        paidAmount: found.paidAmount,
      },
    );
    return view;
  }

  /** Finished periods not paid yet, for the admins' reminder. */
  async dueUnpaid(): Promise<PayoutView[]> {
    await this.refreshAll();
    return this.views(await this.payouts.find({ where: { status: 'due' } }));
  }

  // ---- The gym app's copy -------------------------------------------------------------

  /**
   * For the gym app: payments it does not have the latest of. A payout no longer paid
   * (the payment was undone) comes with paid: false, so the gym app drops its copy.
   */
  async uncollected() {
    const rows = await this.payouts
      .createQueryBuilder('p')
      .where('p.revision > 0')
      .andWhere('p.revision <> COALESCE(p."collectedRevision", 0)')
      .orderBy('p.id', 'ASC')
      .take(200)
      .getMany();
    const views = await this.views(rows);
    return views.map((v, i) => ({
      id: v.id,
      revision: rows[i].revision,
      paid: v.status === 'paid',
      staffLocalId: v.staffLocalId,
      staffName: v.staffName,
      periodStart: v.periodStart,
      periodLast: v.periodLast,
      calculatedAmount: v.calculatedAmount,
      lines: v.lines.map(({ kind, label, amount }) => ({
        kind,
        label,
        amount,
      })),
      paidAmount: v.payment?.paidAmount ?? null,
      paidDate: v.payment?.paidDate ?? null,
      paymentMethod: v.payment?.paymentMethod ?? null,
      note: v.payment?.note ?? null,
      paidByName: v.payment?.paidByName ?? null,
      paidAt: v.payment?.paidAt ?? null,
    }));
  }

  /** The gym app has these revisions; a later change is sent again. */
  async collected(items: { id: number; revision: number }[]): Promise<number> {
    let count = 0;
    for (const item of items) {
      const done = await this.payouts.update(
        { id: item.id, revision: item.revision },
        { collectedRevision: item.revision },
      );
      count += done.affected ?? 0;
    }
    return count;
  }
}
