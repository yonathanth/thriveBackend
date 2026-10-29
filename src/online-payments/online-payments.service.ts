import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import { Member } from '../entities/member.entity';
import { OnlinePayment } from '../entities/online-payment.entity';
import { PotentialCustomer } from '../entities/potential-customer.entity';
import { Service } from '../entities/service.entity';
import type { AuthUser } from '../auth/roles.guard';
import { SantimPayClient } from './santimpay.client';

/** A checkout left unpaid this long is closed, after one last check with SantimPay. */
const CHECKOUT_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Decisions the gym app reports back, and what each may follow. */
const DECISIONS: Record<string, string[]> = {
  applied: ['paid'],
  rejected: ['paid'],
  refunded: ['rejected'],
};

/** SantimPay wants +251XXXXXXXXX; anything else is left off rather than refused. */
export function santimPayPhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (/^251[79]\d{8}$/.test(digits)) return `+${digits}`;
  if (/^0[79]\d{8}$/.test(digits)) return `+251${digits.slice(1)}`;
  if (/^[79]\d{8}$/.test(digits)) return `+251${digits}`;
  return null;
}

/** The last nine digits: how one phone number is compared across the ways it is written. */
const phoneKey = (raw: string | null | undefined) => (raw ?? '').replace(/\D/g, '').slice(-9);
/** The same, in SQL, for a column. */
const phoneKeySql = (column: string) => `RIGHT(regexp_replace(${column}, '[^0-9]', '', 'g'), 9)`;

/** Someone new joining from the website, before they are a member. */
export interface JoinInput {
  fullName: string;
  phoneNumber: string;
  email?: string;
  serviceLocalId: number;
}

export interface MemberPaymentView {
  reference: string;
  plan: string;
  amount: number;
  status: string;
  paidVia: string | null;
  paidAt: string | null;
  createdAt: string;
  note: string | null;
}

/**
 * Online renewals, and new people joining. The website prices and takes the payment;
 * it never changes a membership or creates a member. Paid payments wait for the gym
 * app, where staff apply or reject them.
 */
@Injectable()
export class OnlinePaymentsService {
  private readonly logger = new Logger(OnlinePaymentsService.name);

  constructor(
    @InjectRepository(OnlinePayment) private payments: Repository<OnlinePayment>,
    @InjectRepository(Member) private members: Repository<Member>,
    @InjectRepository(Service) private services: Repository<Service>,
    @InjectRepository(PotentialCustomer) private leads: Repository<PotentialCustomer>,
    private santimPay: SantimPayClient,
  ) {}

  private async ownMember(user: AuthUser): Promise<Member> {
    const member =
      user.memberLocalId != null
        ? await this.members.findOne({
            where: { localId: user.memberLocalId },
            relations: ['service'],
          })
        : null;
    if (!member) throw new NotFoundException('No membership is linked to this account');
    return member;
  }

  /**
   * Why this member cannot renew online right now, or null when they can. With `settle`,
   * unfinished checkouts are first checked with SantimPay: one that was paid after all
   * blocks a second payment, while abandoned ones (a failed method, Cancel) do not,
   * since SantimPay will not take another attempt on the same checkout.
   */
  private async blocker(member: Member, settle = false): Promise<string | null> {
    if (!this.santimPay.enabled) return 'Online payment is not available yet.';
    if (member.frozen === 1 || member.status === 'frozen')
      return 'Your membership is frozen. Please talk to the front desk.';
    if (member.status !== 'active' && member.status !== 'inactive')
      return 'Your membership has not started yet. Please talk to the front desk.';
    if (settle) {
      const unfinished = await this.payments.find({
        where: { memberLocalId: member.localId, status: 'initiated' },
      });
      for (const p of unfinished) await this.confirm(p.reference);
    }
    const waiting = await this.payments.findOne({
      where: { memberLocalId: member.localId, status: 'paid' },
    });
    if (waiting) return 'Your last online payment is waiting for the gym to confirm it.';
    return null;
  }

  /** Plans on sale for one person: group plans are paid at the desk. */
  private plans() {
    return this.services.find({
      where: { status: 'active', groupSize: IsNull() },
      order: { price: 'ASC' },
    });
  }

  private view(p: OnlinePayment): MemberPaymentView {
    return {
      reference: p.reference,
      plan: p.serviceName,
      amount: p.amount,
      status: p.status,
      paidVia: p.paidVia,
      paidAt: p.paidAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      note: p.status === 'rejected' || p.status === 'refunded' ? p.note : null,
    };
  }

  async options(user: AuthUser) {
    const member = await this.ownMember(user);
    const blocked = await this.blocker(member);
    const plans = await this.plans();
    return {
      canPay: blocked === null,
      reason: blocked,
      currentPlanId: member.serviceLocalId,
      endDate: member.subscriptionEndDate.toISOString(),
      status: member.status,
      plans: plans.map((s) => ({
        id: s.localId,
        name: s.name,
        price: Number(s.price),
        periodDays: s.period,
        description: s.description,
        current: s.localId === member.serviceLocalId,
      })),
    };
  }

  async mine(user: AuthUser): Promise<MemberPaymentView[]> {
    const member = await this.ownMember(user);
    const rows = await this.payments.find({
      where: { memberLocalId: member.localId },
      order: { id: 'DESC' },
      take: 20,
    });
    return rows.map((p) => this.view(p));
  }

  /** Prices the chosen plan here, never from the browser, and opens a SantimPay checkout. */
  async start(user: AuthUser, serviceLocalId: number) {
    const member = await this.ownMember(user);
    const blocked = await this.blocker(member, true);
    if (blocked) throw new ConflictException(blocked);
    const plan = (await this.plans()).find((s) => s.localId === serviceLocalId);
    if (!plan) throw new BadRequestException('That plan cannot be paid for online.');
    const amount = Math.round(Number(plan.price) * 100) / 100;
    if (!(amount > 0)) throw new BadRequestException('That plan has no price to pay.');

    const { site, api } = this.urls();
    if (!site || !api) throw new ConflictException('Online payment is not available yet.');

    const payment = await this.payments.save(
      this.payments.create({
        reference: randomUUID(),
        kind: 'renewal',
        memberLocalId: member.localId,
        memberName: member.fullName,
        serviceLocalId: plan.localId,
        serviceName: plan.name,
        servicePeriod: plan.period,
        amount,
        status: 'initiated',
        phoneNumber: santimPayPhone(member.phoneNumber),
      }),
    );
    return this.checkout(payment, `Membership renewal: ${plan.name}`, `${site}/member`);
  }

  private urls() {
    return {
      site: (process.env.PUBLIC_SITE_URL ?? '').replace(/\/+$/, ''),
      api: (process.env.PUBLIC_API_URL ?? '').replace(/\/+$/, ''),
    };
  }

  /** Opens SantimPay's page for a saved payment; it sends the payer back to `returnTo`. */
  private async checkout(payment: OnlinePayment, reason: string, returnTo: string) {
    const { api } = this.urls();
    const back = (result: string) =>
      `${returnTo}?result=${result}&ref=${payment.reference}`;
    try {
      const url = await this.santimPay.checkoutUrl({
        id: payment.reference,
        amount: payment.amount,
        reason,
        successUrl: back('success'),
        failureUrl: back('failed'),
        cancelUrl: back('cancelled'),
        notifyUrl: `${api}/api/online-payments/santimpay/notify`,
        // Not sent: SantimPay locks a number it is given, and people may pay from
        // another phone or account. The number that paid is recorded on confirmation.
      });
      return { reference: payment.reference, checkoutUrl: url };
    } catch (e) {
      await this.payments.update(payment.id, {
        status: 'failed',
        note: `Could not start: ${(e as Error).message}`,
      });
      throw new ConflictException('The payment could not be started. Please try again.');
    }
  }

  // ---- Joining from the website (no account) -------------------------------

  /** Whether the join page can offer paying online at all. */
  joinAvailable(): boolean {
    const { site, api } = this.urls();
    return this.santimPay.enabled && !!site && !!api;
  }

  /** Join payments from this number in the given states. */
  private joinsFrom(key: string, statuses: string[]) {
    return this.payments
      .createQueryBuilder('p')
      .where(`p.kind = 'join' AND p.status IN (:...statuses)`, { statuses })
      .andWhere(`${phoneKeySql('p."contactPhone"')} = :key`, { key })
      .getMany();
  }

  /**
   * Someone new picks a plan and pays. Their details are kept as a registration (a lead
   * the desk can call if they never finish paying); the member is only created when
   * staff apply the payment in the gym app.
   */
  async startJoin(input: JoinInput) {
    if (!this.joinAvailable()) throw new ConflictException('Online payment is not available yet.');
    const fullName = input.fullName.trim().replace(/\s+/g, ' ');
    if (fullName.length < 2) throw new BadRequestException('Please enter your full name.');
    const phone = santimPayPhone(input.phoneNumber);
    if (!phone)
      throw new BadRequestException('Please enter an Ethiopian mobile number, like 09… or +2519….');
    const key = phoneKey(phone);
    const member = await this.members
      .createQueryBuilder('m')
      .where(`${phoneKeySql('m."phoneNumber"')} = :key`, { key })
      .getOne();
    if (member)
      throw new ConflictException(
        'This phone number already has a membership. Sign in and renew from your account, or call the front desk.',
      );

    // Settle unfinished checkouts first: an abandoned one does not block a new attempt.
    for (const p of await this.joinsFrom(key, ['initiated'])) await this.confirm(p.reference);
    if ((await this.joinsFrom(key, ['paid'])).length > 0)
      throw new ConflictException(
        'A payment from this number is already waiting for the gym to confirm it. We will be in touch shortly.',
      );

    const plan = (await this.plans()).find((s) => s.localId === input.serviceLocalId);
    if (!plan)
      throw new BadRequestException('That plan cannot be paid for online. Please call the front desk.');
    const amount = Math.round(Number(plan.price) * 100) / 100;
    if (!(amount > 0)) throw new BadRequestException('That plan has no price to pay.');
    const email = input.email?.trim() || null;

    const reference = randomUUID();
    const lead = await this.leads.save(
      this.leads.create({
        fullName,
        phoneNumber: phone,
        email,
        serviceId: plan.id,
        notes: `Joining online: ${plan.name}, ${amount} ETB (SantimPay ref ${reference}). If they paid, the payment is in Online payments: apply it there instead of registering them here.`,
        status: 'pending',
      }),
    );
    const payment = await this.payments.save(
      this.payments.create({
        reference,
        kind: 'join',
        memberLocalId: null,
        memberName: fullName,
        potentialCustomerId: lead.id,
        contactPhone: phone,
        contactEmail: email,
        serviceLocalId: plan.localId,
        serviceName: plan.name,
        servicePeriod: plan.period,
        amount,
        status: 'initiated',
        phoneNumber: phone,
      }),
    );
    return this.checkout(payment, `Membership: ${plan.name}`, `${this.urls().site}/join`);
  }

  /**
   * The join page coming back from SantimPay. The reference is a random id only the
   * payer has, and the answer carries nothing personal.
   */
  async joinStatus(reference: string) {
    const payment = await this.payments.findOne({ where: { reference, kind: 'join' } });
    if (!payment) throw new NotFoundException('Payment not found');
    const settled = (await this.confirm(reference)) ?? payment;
    return {
      reference: settled.reference,
      plan: settled.serviceName,
      amount: settled.amount,
      status: settled.status,
      paidVia: settled.paidVia,
    };
  }

  /**
   * Asks SantimPay how a checkout ended and records it. The only way a payment becomes
   * paid: a callback, the member's return page and the sweep all come through here.
   */
  async confirm(reference: string): Promise<OnlinePayment | null> {
    const payment = await this.payments.findOne({ where: { reference } });
    if (!payment || payment.status !== 'initiated') return payment;
    let result;
    try {
      result = await this.santimPay.status(reference);
    } catch (e) {
      this.logger.warn(`Status of ${reference} unknown: ${(e as Error).message}`);
      return payment;
    }
    const status = (result.status ?? '').toUpperCase();
    const expired = Date.now() - payment.createdAt.getTime() > CHECKOUT_EXPIRY_MS;
    let next: string | null = null;
    if (status === 'COMPLETED' || status === 'SUCCESS') next = 'paid';
    else if (status === 'FAILED' || status === 'DECLINED') next = 'failed';
    else if (status === 'CANCELLED' || status === 'CANCELED') next = 'cancelled';
    else if (expired) next = 'cancelled';
    if (!next) return payment;

    // Only from initiated, so a repeat callback or a race with the sweep changes nothing.
    await this.payments
      .createQueryBuilder()
      .update()
      .set({
        status: next,
        providerTxnId: result.santimPayTxnId ?? null,
        paidVia: result.paymentMethod ?? null,
        paidAt: next === 'paid' ? new Date() : null,
        note: expired && next === 'cancelled' ? 'Checkout expired' : (result.message ?? null),
        ...(next === 'paid' && result.phoneNumber ? { phoneNumber: result.phoneNumber } : {}),
      })
      .where('id = :id AND status = :from', { id: payment.id, from: 'initiated' })
      .execute();
    if (next === 'paid')
      this.logger.log(`Online payment ${reference} paid: ${payment.amount} for ${payment.memberName}`);
    return this.payments.findOne({ where: { id: payment.id } });
  }

  /** SantimPay's callback. Its body is never trusted on its own; confirm() asks SantimPay. */
  async notify(body: Record<string, unknown>, signedToken: string | undefined) {
    const valid = this.santimPay.callbackSignatureValid(signedToken);
    if (valid === false) {
      this.logger.warn('SantimPay callback with a bad signature ignored');
      return;
    }
    const reference = String(body?.thirdPartyId ?? body?.id ?? '');
    if (!reference) return;
    await this.confirm(reference);
  }

  /** The member's return page: settles their own checkout before showing the result. */
  async refreshOwn(user: AuthUser, reference: string): Promise<MemberPaymentView> {
    const member = await this.ownMember(user);
    const payment = await this.payments.findOne({
      where: { reference, memberLocalId: member.localId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    const settled = (await this.confirm(reference)) ?? payment;
    return this.view(settled);
  }

  /** Callbacks can be lost: checkouts still open are asked about every few minutes. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep() {
    if (!this.santimPay.enabled) return;
    const open = await this.payments.find({
      where: {
        status: 'initiated',
        createdAt: LessThan(new Date(Date.now() - 2 * 60 * 1000)),
      },
      order: { id: 'ASC' },
      take: 50,
    });
    for (const p of open) await this.confirm(p.reference);
  }

  // ---- For managers on the website (read-only) ----------------------------

  /** Every attempt, failed ones included, for checking against SantimPay's statements. */
  async list(q: { status?: string; from?: string; to?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
    const qb = this.payments.createQueryBuilder('p');
    if (q.status) qb.andWhere('p.status = :status', { status: q.status });
    const day = (v?: string) => {
      const d = v ? new Date(v) : null;
      return d && !isNaN(d.getTime()) ? d : null;
    };
    const from = day(q.from);
    const to = day(q.to);
    if (from) qb.andWhere('p."createdAt" >= :from', { from });
    if (to) qb.andWhere('p."createdAt" < :to', { to: new Date(to.getTime() + 86_400_000) });
    const totals = await qb
      .clone()
      .select('p.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .addSelect('COALESCE(SUM(p.amount), 0)::float', 'amount')
      .groupBy('p.status')
      .getRawMany<{ status: string; count: number; amount: number }>();
    const [rows, total] = await qb
      .orderBy('p.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      data: rows.map((p) => ({
        reference: p.reference,
        kind: p.kind,
        memberLocalId: p.memberLocalId,
        memberName: p.memberName,
        plan: p.serviceName,
        amount: p.amount,
        status: p.status,
        paidVia: p.paidVia,
        phoneNumber: p.phoneNumber,
        providerTxnId: p.providerTxnId,
        paidAt: p.paidAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        decidedBy: p.decidedBy,
        decidedAt: p.decidedAt?.toISOString() ?? null,
        note: p.note,
      })),
      totals,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  // ---- For the gym app (API key) -----------------------------------------

  /** Paid payments the gym app has not stored yet. */
  async uncollected() {
    const rows = await this.payments.find({
      where: { status: 'paid', collectedAt: IsNull() },
      order: { id: 'ASC' },
      take: 200,
    });
    return rows.map((p) => ({
      reference: p.reference,
      kind: p.kind,
      memberLocalId: p.memberLocalId,
      memberName: p.memberName,
      potentialCustomerId: p.potentialCustomerId,
      contactPhone: p.contactPhone,
      contactEmail: p.contactEmail,
      serviceLocalId: p.serviceLocalId,
      serviceName: p.serviceName,
      servicePeriod: p.servicePeriod,
      amount: p.amount,
      paidVia: p.paidVia,
      phoneNumber: p.phoneNumber,
      providerTxnId: p.providerTxnId,
      paidAt: p.paidAt?.toISOString() ?? null,
    }));
  }

  async collected(references: string[]): Promise<number> {
    if (references.length === 0) return 0;
    const done = await this.payments.update(
      { reference: In(references), collectedAt: IsNull() },
      { collectedAt: new Date() },
    );
    return done.affected ?? 0;
  }

  /**
   * Staff applied, rejected or refunded a payment in the gym app. Applying a join
   * registered the person: `memberLocalId` is the member it created.
   */
  async decide(
    reference: string,
    status: string,
    by: string | null,
    note: string | null,
    memberLocalId: number | null = null,
  ) {
    const allowedFrom = DECISIONS[status];
    if (!allowedFrom) throw new BadRequestException('Unknown decision');
    const payment = await this.payments.findOne({ where: { reference } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === status) return { status };
    // A repeat of an earlier step (its answer was lost) is already done.
    if (status === 'rejected' && payment.status === 'refunded') return { status: payment.status };
    if (!allowedFrom.includes(payment.status))
      throw new ConflictException(`A ${payment.status} payment cannot become ${status}`);
    const joined = payment.kind === 'join' && status === 'applied';
    await this.payments.update(payment.id, {
      status,
      decidedBy: by,
      decidedAt: new Date(),
      note: note ?? payment.note,
      ...(joined && memberLocalId != null ? { memberLocalId } : {}),
    });
    // The lead became a member. If the member has not synced yet the link is left to
    // the gym app's lead sync, which reports the conversion with the member.
    if (joined && payment.potentialCustomerId != null) {
      const member =
        memberLocalId != null ? await this.members.findOne({ where: { localId: memberLocalId } }) : null;
      await this.leads.update(
        { id: payment.potentialCustomerId, status: 'pending' },
        { status: 'converted', convertedAt: new Date(), convertedToMemberId: member?.id ?? null },
      );
    }
    return { status };
  }
}
