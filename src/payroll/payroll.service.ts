import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { PayoutApproval } from '../entities/payout-approval.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { Staff } from '../entities/staff.entity';
import { SyncRecord } from '../entities/sync-record.entity';
import { AuditActor, WebAuditService } from '../web-audit/web-audit.service';

/** A payout as the gym app syncs it (sync_record entity 'payroll_payout'). */
interface PayoutData {
  staff_id?: number;
  period_start?: string;
  /** The day after the last day */
  period_end?: string;
  status?: string;
  calculated_amount?: number;
  /** JSON text: [{ kind, label, amount }] */
  lines?: string | unknown[];
  paid_amount?: number | null;
  paid_date?: string | null;
  payment_method?: string | null;
  note?: string | null;
}

export interface PayoutLine {
  kind: string;
  label: string;
  amount: number;
}

/**
 * building: the period is running (a live estimate); due: it ended, waiting for an
 * admin; approved: approved here, waiting for the gym app to record it; recorded:
 * paid and booked as an expense.
 */
export type PayoutStatus = 'building' | 'due' | 'approved' | 'recorded';

export interface PayoutView {
  payoutLocalId: number;
  staffLocalId: number;
  staffName: string;
  periodStart: string;
  periodLast: string;
  status: PayoutStatus;
  calculatedAmount: number;
  lines: PayoutLine[];
  approval: {
    paidAmount: number;
    paidDate: string;
    paymentMethod: string | null;
    note: string | null;
    approvedByName: string;
    approvedAt: string;
    recordedAt: string | null;
  } | null;
}

export interface ApproveInput {
  paidAmount: number;
  paidDate: string;
  paymentMethod?: string | null;
  note?: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ENTITY = 'payroll_payout';

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function parseLines(raw: PayoutData['lines']): PayoutLine[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  return list.map(
    (l: { kind?: unknown; label?: unknown; amount?: unknown }) => ({
      kind: text(l?.kind),
      label: text(l?.label),
      amount: Number(l?.amount ?? 0),
    }),
  );
}

/**
 * Payroll on the website. The gym app calculates every pay period and syncs it; here
 * an admin approves a finished one with what was actually paid, and the gym app picks
 * the approval up and books the expense. Staff see their own payslips.
 */
@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(SyncRecord)
    private readonly records: Repository<SyncRecord>,
    @InjectRepository(PayoutApproval)
    private readonly approvals: Repository<PayoutApproval>,
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
    @InjectRepository(PaymentMethod)
    private readonly methods: Repository<PaymentMethod>,
    private readonly webAudit: WebAuditService,
  ) {}

  private async views(rows: SyncRecord[]): Promise<PayoutView[]> {
    if (rows.length === 0) return [];
    const staffIds = [
      ...new Set(rows.map((r) => Number((r.data as PayoutData).staff_id))),
    ];
    const [people, approvals] = await Promise.all([
      this.staff.find({ where: { localId: In(staffIds) }, withDeleted: true }),
      this.approvals.find({
        where: { payoutLocalId: In(rows.map((r) => r.localId)) },
      }),
    ]);
    const nameOf = new Map(people.map((s) => [s.localId, s.fullName]));
    const approvalOf = new Map(approvals.map((a) => [a.payoutLocalId, a]));
    return rows.map((r) => {
      const d = r.data as PayoutData;
      const staffLocalId = Number(d.staff_id);
      const a = approvalOf.get(r.localId);
      const status: PayoutStatus =
        d.status === 'recorded'
          ? 'recorded'
          : a
            ? 'approved'
            : d.status === 'due'
              ? 'due'
              : 'building';
      return {
        payoutLocalId: r.localId,
        staffLocalId,
        staffName: nameOf.get(staffLocalId) ?? `Staff #${staffLocalId}`,
        periodStart: String(d.period_start ?? ''),
        periodLast: d.period_end ? dayBefore(String(d.period_end)) : '',
        status,
        calculatedAmount: Number(d.calculated_amount ?? 0),
        lines: parseLines(d.lines),
        approval: a
          ? {
              paidAmount: a.paidAmount,
              paidDate: a.paidDate,
              paymentMethod: a.paymentMethod,
              note: a.note,
              approvedByName: a.approvedByName,
              approvedAt: a.approvedAt.toISOString(),
              recordedAt: a.recordedAt?.toISOString() ?? null,
            }
          : d.status === 'recorded' && d.paid_amount != null
            ? {
                // Recorded in the gym app without an approval here (e.g. an older one)
                paidAmount: Number(d.paid_amount),
                paidDate: String(d.paid_date ?? ''),
                paymentMethod: d.payment_method ?? null,
                note: d.note ?? null,
                approvedByName: '',
                approvedAt: '',
                recordedAt: null,
              }
            : null,
      };
    });
  }

  private payoutRows(staffLocalId?: number): Promise<SyncRecord[]> {
    const q = this.records
      .createQueryBuilder('r')
      .where('r.entity = :entity', { entity: ENTITY })
      .orderBy(`r.data->>'period_start'`, 'DESC')
      .addOrderBy('r.localId', 'DESC')
      .take(400);
    if (staffLocalId != null)
      q.andWhere(`(r.data->>'staff_id')::int = :staff`, {
        staff: staffLocalId,
      });
    return q.getMany();
  }

  /** Every recent payout, newest period first. */
  async list(): Promise<{ payouts: PayoutView[]; paymentMethods: string[] }> {
    const [payouts, methods] = await Promise.all([
      this.payoutRows().then((rows) => this.views(rows)),
      this.methods.find({ where: { isActive: true }, order: { name: 'ASC' } }),
    ]);
    return { payouts, paymentMethods: methods.map((m) => m.name) };
  }

  /** The signed-in staff member's own payslips: finished periods and the current estimate. */
  async mine(staffLocalId: number | null): Promise<PayoutView[]> {
    if (staffLocalId == null) return [];
    return this.views(await this.payoutRows(staffLocalId));
  }

  /**
   * Approves a finished period with what was actually paid. Until the gym app records
   * it, the approval can be changed by approving again.
   */
  async approve(
    actor: AuditActor,
    payoutLocalId: number,
    input: ApproveInput,
  ): Promise<PayoutView> {
    const row = await this.records.findOne({
      where: { entity: ENTITY, localId: payoutLocalId },
    });
    if (!row) throw new NotFoundException('Payout not found');
    const [view] = await this.views([row]);
    if (view.status === 'building')
      throw new BadRequestException('This pay period has not ended yet');
    if (view.status === 'recorded')
      throw new ConflictException('This payout is already paid and recorded');
    const paidAmount = Math.round(Number(input.paidAmount) * 100) / 100;
    if (!Number.isFinite(paidAmount) || paidAmount < 0)
      throw new BadRequestException('Enter the amount paid');
    if (!DATE.test(input.paidDate ?? ''))
      throw new BadRequestException('Enter the date it was paid');
    const method = input.paymentMethod?.trim() || null;
    const note = input.note?.trim() || null;

    const existing = await this.approvals.findOne({ where: { payoutLocalId } });
    if (existing?.recordedAt)
      throw new ConflictException(
        'The gym app has already recorded this payout',
      );
    const values = {
      payoutLocalId,
      staffLocalId: view.staffLocalId,
      periodStart: view.periodStart,
      periodLast: view.periodLast,
      calculatedAmount: view.calculatedAmount,
      paidAmount,
      paidDate: input.paidDate,
      paymentMethod: method,
      note,
      approvedById: actor.id,
      approvedByName: actor.name,
      approvedAt: new Date(),
    };
    if (existing) await this.approvals.update(existing.id, values);
    else await this.approvals.insert(values);

    const differs = Math.abs(paidAmount - view.calculatedAmount) >= 0.005;
    await this.webAudit.record(
      actor,
      'payroll',
      existing ? 'approval_changed' : 'approved',
      `${existing ? 'Changed the approval of' : 'Approved'} ${view.staffName}'s pay for ${view.periodStart} to ${view.periodLast}: ` +
        `${paidAmount} paid${differs ? ` (calculated ${view.calculatedAmount})` : ''}`,
      {
        payoutLocalId,
        staffLocalId: view.staffLocalId,
        calculatedAmount: view.calculatedAmount,
        paidAmount,
        paidDate: input.paidDate,
        paymentMethod: method,
        note,
      },
    );
    const [updated] = await this.views([row]);
    return updated;
  }

  /** For the gym app: approvals it has not recorded yet. */
  async pending() {
    const rows = await this.approvals.find({
      where: { recordedAt: IsNull() },
      order: { approvedAt: 'ASC' },
    });
    return rows.map((a) => ({
      id: a.id,
      payoutLocalId: a.payoutLocalId,
      paidAmount: a.paidAmount,
      paidDate: a.paidDate,
      paymentMethod: a.paymentMethod,
      note: a.note,
      approvedByName: a.approvedByName,
      approvedAt: a.approvedAt.toISOString(),
    }));
  }

  /** The gym app recorded these approvals as expenses. */
  async acknowledge(
    recorded: { id: number; transactionLocalId?: number | null }[],
  ): Promise<number> {
    let count = 0;
    for (const r of recorded) {
      const result = await this.approvals.update(
        { id: r.id, recordedAt: IsNull() },
        {
          recordedAt: new Date(),
          transactionLocalId: r.transactionLocalId ?? null,
        },
      );
      count += result.affected ?? 0;
    }
    return count;
  }

  /** Finished periods nobody has approved yet, for the admins' reminder. */
  async dueUnapproved(): Promise<PayoutView[]> {
    const rows = await this.records
      .createQueryBuilder('r')
      .where('r.entity = :entity', { entity: ENTITY })
      .andWhere(`r.data->>'status' = 'due'`)
      .getMany();
    return (await this.views(rows)).filter((p) => p.status === 'due');
  }
}
