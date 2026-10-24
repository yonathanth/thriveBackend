/* eslint-disable @typescript-eslint/no-unsafe-argument -- test wiring */
/**
 * Payroll against a real PostgreSQL: the calculation is SQL, so fakes would prove
 * little. Runs only when PAYROLL_TEST_DB points at a throwaway database, e.g.
 *   PAYROLL_TEST_DB=postgres://postgres@localhost:54329/payroll_test npx jest payroll.service.db
 * Every table in that database is dropped and recreated.
 */
import * as path from 'path';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PayrollService } from './payroll.service';
import { Member } from '../entities/member.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { Service } from '../entities/service.entity';
import { Staff } from '../entities/staff.entity';
import { StaffAttendance } from '../entities/staff-attendance.entity';
import { StaffPaySetup } from '../entities/staff-pay-setup.entity';
import { StaffPayout } from '../entities/staff-payout.entity';
import { StaffRevenueShare } from '../entities/staff-revenue-share.entity';
import { SyncRecord } from '../entities/sync-record.entity';
import { Transaction } from '../entities/transaction.entity';
import { AuditActor, WebAuditService } from '../web-audit/web-audit.service';

const url = process.env.PAYROLL_TEST_DB;
const maybe = url ? describe : describe.skip;

const admin: AuditActor = { id: 1, name: 'Admin', role: 'admin' };
const setup = (over: Record<string, unknown> = {}) => ({
  baseType: 'none',
  baseAmount: 0,
  cycle: 'monthly',
  cycleDays: 30,
  cycleStart: '2026-09-01',
  deductAbsence: false,
  workDays: [1, 2, 3, 4, 5, 6],
  active: true,
  ...over,
});

maybe('PayrollService (PostgreSQL)', () => {
  let ds: DataSource;
  let svc: PayrollService;
  let audit: { record: jest.Mock };
  let txId = 100;

  const income = async (over: Partial<Transaction>) =>
    ds.getRepository(Transaction).insert({
      localId: ++txId,
      transactionType: 'income',
      amount: 1000,
      transactionDate: new Date('2026-09-10T09:00:00Z'),
      description: 'x',
      paymentStatus: 'paid',
      ...over,
    });
  const record = (
    entity: string,
    localId: number,
    data: Record<string, unknown>,
  ) =>
    ds.getRepository(SyncRecord).insert({
      entity,
      localId,
      memberLocalId: typeof data.member_id === 'number' ? data.member_id : null,
      data,
    } as any);

  beforeAll(async () => {
    ds = new DataSource({
      type: 'postgres',
      url,
      entities: [path.join(__dirname, '../entities/*.entity.ts')],
      synchronize: true,
      dropSchema: true,
    });
    await ds.initialize();
  });
  afterAll(async () => ds?.destroy());

  beforeEach(async () => {
    await ds.synchronize(true);
    audit = { record: jest.fn() };
    svc = new PayrollService(
      ds.getRepository(StaffPaySetup),
      ds.getRepository(StaffRevenueShare),
      ds.getRepository(StaffPayout),
      ds.getRepository(Staff),
      ds.getRepository(Service),
      ds.getRepository(SyncRecord),
      ds.getRepository(PaymentMethod),
      ds,
      audit as unknown as WebAuditService,
      { get: () => undefined } as unknown as ConfigService,
    );
    jest.spyOn(svc, 'today').mockReturnValue('2026-10-15');

    const staff = await ds.getRepository(Staff).save([
      { localId: 1, fullName: 'Hana', role: 'Trainer', status: 'active' },
      { localId: 2, fullName: 'Kebede', role: 'Trainer', status: 'active' },
    ]);
    await ds.getRepository(Service).insert({
      localId: 10,
      name: 'Monthly',
      period: 30,
      price: 1000,
      category: 'gym',
      usageType: 'unlimited',
      status: 'active',
    });
    await ds.getRepository(Member).insert({
      localId: 50,
      fullName: 'Abebe',
      phoneNumber: '0911',
      firstRegisteredAt: new Date(),
      subscriptionStartDate: new Date(),
      subscriptionEndDate: new Date(),
      subscriptionStatus: 'active',
      status: 'active',
      trainerStaffLocalId: 2, // today: Kebede
    });
    // Hana checked in on 3 days in September (one twice), all in Addis time.
    for (const at of [
      '2026-09-01T06:00:00Z',
      '2026-09-01T15:00:00Z',
      '2026-09-02T06:00:00Z',
      '2026-09-30T22:30:00Z',
    ]) {
      await ds.getRepository(StaffAttendance).insert({
        localId: Math.floor(Math.random() * 1e9),
        staffLocalId: 1,
        staffId: staff[0].id,
        scannedAt: new Date(at),
      });
    }
    await ds
      .getRepository(PaymentMethod)
      .insert({ localId: 1, name: 'Cash', isActive: true });
  });

  it('pays shares to whoever was assigned when the member paid, less refunds', async () => {
    // Paid while Hana was the trainer (the gym app recorded it), later moved to Kebede.
    await income({ memberLocalId: 50, serviceLocalId: 10 });
    await record('payment_staff', txId, {
      transaction_id: txId,
      member_trainer_id: 1,
      addon_trainer_id: null,
    });
    const first = txId;
    // A refund of 200 against it.
    await ds.getRepository(Transaction).insert({
      localId: ++txId,
      transactionType: 'negative_return',
      amount: 200,
      transactionDate: new Date('2026-09-12T09:00:00Z'),
      description: 'refund',
      paymentStatus: 'paid',
      referenceTransactionId: first,
    });
    // Synced by an older gym app without payment_staff: today's trainer (Kebede).
    await income({
      memberLocalId: 50,
      serviceLocalId: 10,
      transactionDate: new Date('2026-09-20T09:00:00Z'),
    });
    // Cancelled, and an inventory sale: never counted.
    await income({
      memberLocalId: 50,
      serviceLocalId: 10,
      paymentStatus: 'cancelled',
    });
    await income({
      memberLocalId: 50,
      serviceLocalId: 10,
      stockCountLocalId: 3,
    });

    const share = { scope: 'assigned_members', rateType: 'percent', rate: 10 };
    await svc.save(admin, 1, {
      setup: setup({ baseType: 'daily', baseAmount: 100 }),
      shares: [share],
    });
    await svc.save(admin, 2, { setup: setup(), shares: [share] });

    const { payouts } = await svc.list();
    const sept = (staff: number) =>
      payouts.find(
        (p) => p.staffLocalId === staff && p.periodStart === '2026-09-01',
      )!;
    // Hana: 2 days (30 Sep 22:30 UTC is already 1 Oct in Addis), 10% of 1000 less the 200 refund.
    expect(sept(1).status).toBe('due');
    expect(sept(1).lines.map((l) => [l.kind, l.amount])).toEqual([
      ['base', 200],
      ['commission', 80],
    ]);
    expect(sept(2).calculatedAmount).toBe(100);
    expect(payouts.filter((p) => p.status === 'building')).toHaveLength(2);
  });

  it('marks paid, freezes, sends to the gym app once per change, and can be undone', async () => {
    await svc.save(admin, 1, {
      setup: setup({ baseType: 'monthly', baseAmount: 5000 }),
      shares: [],
    });
    let { payouts } = await svc.list();
    const due = payouts.find((p) => p.status === 'due')!;
    await expect(
      svc.pay(admin, payouts.find((p) => p.status === 'building')!.id, {
        paidAmount: 1,
        paidDate: '2026-10-01',
      }),
    ).rejects.toThrow(/not ended/);

    await svc.pay(admin, due.id, {
      paidAmount: 4800,
      paidDate: '2026-10-02',
      paymentMethod: 'Cash',
      note: 'advance taken',
    });
    // Paid figures stay put even if the setup changes later (same cycle).
    await svc.save(admin, 1, {
      setup: setup({ baseType: 'monthly', baseAmount: 9000 }),
      shares: [],
    });
    ({ payouts } = await svc.list());
    const paid = payouts.find((p) => p.id === due.id)!;
    expect(paid.status).toBe('paid');
    expect(paid.calculatedAmount).toBe(5000);
    expect(paid.payment).toMatchObject({
      paidAmount: 4800,
      paymentMethod: 'Cash',
      collected: false,
    });

    let pending = await svc.uncollected();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      id: due.id,
      paid: true,
      paidAmount: 4800,
      revision: 1,
    });
    expect(await svc.collected([{ id: due.id, revision: 1 }])).toBe(1);
    expect(await svc.uncollected()).toHaveLength(0);

    await svc.unpay(admin, due.id);
    pending = await svc.uncollected();
    expect(pending[0]).toMatchObject({ id: due.id, paid: false, revision: 2 });
    ({ payouts } = await svc.list());
    expect(payouts.find((p) => p.id === due.id)).toMatchObject({
      status: 'due',
      calculatedAmount: 9000,
    });
  });

  it('replaces stale periods when the cycle changes, but never cuts across a paid one', async () => {
    await svc.save(admin, 2, {
      setup: setup({ cycle: 'monthly', cycleStart: '2026-08-24' }),
      shares: [],
    });
    await svc.save(admin, 2, {
      setup: setup({ cycle: 'days', cycleDays: 30, cycleStart: '2026-08-24' }),
      shares: [],
    });
    let { payouts } = await svc.list();
    const mine = payouts
      .filter((p) => p.staffLocalId === 2)
      .map((p) => [p.periodStart, p.periodLast, p.status]);
    expect(mine).toEqual([
      ['2026-09-23', '2026-10-22', 'building'],
      ['2026-08-24', '2026-09-22', 'due'],
    ]);
    const aug = payouts.find((p) => p.periodStart === '2026-08-24')!;
    await svc.pay(admin, aug.id, { paidAmount: 0, paidDate: '2026-09-23' });
    await expect(
      svc.save(admin, 2, {
        setup: setup({ cycle: 'monthly', cycleStart: '2026-09-01' }),
        shares: [],
      }),
    ).rejects.toThrow(/on or after 2026-09-23/);
    await svc.save(admin, 2, {
      setup: setup({ cycle: 'monthly', cycleStart: '2026-09-23' }),
      shares: [],
    });
    ({ payouts } = await svc.list());
    expect(
      payouts
        .filter((p) => p.staffLocalId === 2)
        .map((p) => [p.periodStart, p.periodLast, p.status]),
    ).toEqual([
      ['2026-09-23', '2026-10-22', 'building'],
      ['2026-08-24', '2026-09-22', 'paid'],
    ]);
  });

  it('keeps finished periods owed when someone goes off payroll', async () => {
    await svc.save(admin, 1, {
      setup: setup({ baseType: 'monthly', baseAmount: 100 }),
      shares: [],
    });
    await svc.save(admin, 1, {
      setup: setup({ baseType: 'monthly', baseAmount: 100, active: false }),
      shares: [],
    });
    const { payouts } = await svc.list();
    expect(payouts.map((p) => p.status)).toEqual(['due']);
  });

  it('keeps share ids on save and drops removed ones', async () => {
    const a = { scope: 'assigned_members', rateType: 'percent', rate: 10 };
    const b = {
      scope: 'service',
      targetKind: 'plan',
      targetLocalId: 10,
      rateType: 'fixed',
      rate: 50,
    };
    let saved = await svc.save(admin, 1, { setup: setup(), shares: [a, b] });
    expect(saved.shares.map((s) => s.description)).toEqual([
      '10% of membership payments from members assigned to them',
      '50 ETB per payment of every Monthly payment',
    ]);
    const keepId = saved.shares[1].id;
    saved = await svc.save(admin, 1, {
      setup: setup(),
      shares: [{ ...b, id: keepId, rate: 60 }],
    });
    expect(saved.shares).toEqual([
      expect.objectContaining({ id: keepId, rate: 60 }),
    ]);
    await expect(
      svc.save(admin, 1, { setup: setup(), shares: [{ ...a, rate: 120 }] }),
    ).rejects.toThrow(/0 to 100/);
    expect(audit.record).toHaveBeenCalledWith(
      admin,
      'payroll',
      'setup_changed',
      expect.any(String),
      expect.any(Object),
    );
  });
});
