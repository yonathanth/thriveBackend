/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await -- loose repository fakes */
import { Repository } from 'typeorm';
import { PayrollService } from './payroll.service';
import { WebAuditService } from '../web-audit/web-audit.service';

const payout = (
  localId: number,
  status: string,
  extra: Record<string, unknown> = {},
) => ({
  entity: 'payroll_payout',
  localId,
  data: {
    staff_id: 7,
    period_start: '2026-09-01',
    period_end: '2026-10-01',
    status,
    calculated_amount: 5000,
    lines: JSON.stringify([{ kind: 'base', label: 'Base pay', amount: 5000 }]),
    ...extra,
  },
});

const admin = { id: 1, name: 'Admin', role: 'admin' };

function setup(rows: any[]) {
  const approvals: any[] = [];
  const records = {
    findOne: jest.fn(
      async ({ where }: any) =>
        rows.find((r) => r.localId === where.localId) ?? null,
    ),
    createQueryBuilder: jest.fn(() => {
      const q: any = {
        where: () => q,
        andWhere: () => q,
        orderBy: () => q,
        addOrderBy: () => q,
        take: () => q,
        getMany: async () => rows,
      };
      return q;
    }),
  } as unknown as Repository<any>;
  const approvalRepo = {
    find: jest.fn(async () => approvals),
    findOne: jest.fn(
      async ({ where }: any) =>
        approvals.find((a) => a.payoutLocalId === where.payoutLocalId) ?? null,
    ),
    insert: jest.fn(async (v: any) =>
      approvals.push({ id: approvals.length + 1, recordedAt: null, ...v }),
    ),
    update: jest.fn(async (where: any, v: any) => {
      const id = typeof where === 'number' ? where : where.id;
      const a = approvals.find(
        (x) =>
          x.id === id && (typeof where === 'number' || x.recordedAt === null),
      );
      if (a) Object.assign(a, v);
      return { affected: a ? 1 : 0 };
    }),
  } as unknown as Repository<any>;
  const staff = {
    find: jest.fn(async () => [{ localId: 7, fullName: 'Sara' }]),
  } as unknown as Repository<any>;
  const methods = {
    find: jest.fn(async () => [{ name: 'Cash' }]),
  } as unknown as Repository<any>;
  const audit = { record: jest.fn(async () => undefined) };
  const service = new PayrollService(
    records,
    approvalRepo,
    staff,
    methods,
    audit as unknown as WebAuditService,
  );
  return { service, approvals, audit };
}

describe('PayrollService', () => {
  it('lists payouts with staff names, last days and their lines', async () => {
    const { service } = setup([payout(3, 'due'), payout(4, 'building')]);
    const { payouts, paymentMethods } = await service.list();
    expect(paymentMethods).toEqual(['Cash']);
    expect(payouts[0]).toMatchObject({
      payoutLocalId: 3,
      staffName: 'Sara',
      periodLast: '2026-09-30',
      status: 'due',
      calculatedAmount: 5000,
      lines: [{ kind: 'base', label: 'Base pay', amount: 5000 }],
    });
    expect(payouts[1].status).toBe('building');
  });

  it('approves a finished period with the amount actually paid, audited, and hands it to the gym app once', async () => {
    const { service, approvals, audit } = setup([payout(3, 'due')]);
    const view = await service.approve(admin, 3, {
      paidAmount: 4800,
      paidDate: '2026-10-02',
      paymentMethod: 'Cash',
      note: ' Advance taken ',
    });
    expect(view.status).toBe('approved');
    expect(approvals[0]).toMatchObject({
      paidAmount: 4800,
      calculatedAmount: 5000,
      note: 'Advance taken',
      approvedByName: 'Admin',
    });
    expect(audit.record).toHaveBeenCalledWith(
      admin,
      'payroll',
      'approved',
      expect.stringContaining('calculated 5000'),
      expect.anything(),
    );

    expect(await service.pending()).toEqual([
      expect.objectContaining({ id: 1, payoutLocalId: 3, paidAmount: 4800 }),
    ]);
    expect(await service.acknowledge([{ id: 1, transactionLocalId: 55 }])).toBe(
      1,
    );
    expect(await service.acknowledge([{ id: 1, transactionLocalId: 55 }])).toBe(
      0,
    );
    await expect(
      service.approve(admin, 3, { paidAmount: 1, paidDate: '2026-10-02' }),
    ).rejects.toThrow('already recorded');
  });

  it('refuses running periods, recorded payouts and bad input', async () => {
    const { service } = setup([
      payout(3, 'building'),
      payout(4, 'recorded'),
      payout(5, 'due'),
    ]);
    await expect(
      service.approve(admin, 3, { paidAmount: 1, paidDate: '2026-10-02' }),
    ).rejects.toThrow('not ended');
    await expect(
      service.approve(admin, 4, { paidAmount: 1, paidDate: '2026-10-02' }),
    ).rejects.toThrow('already paid');
    await expect(
      service.approve(admin, 5, { paidAmount: 1, paidDate: '2 Oct' }),
    ).rejects.toThrow('date');
    await expect(
      service.approve(admin, 9, { paidAmount: 1, paidDate: '2026-10-02' }),
    ).rejects.toThrow('not found');
  });

  it('shows staff only their own payslips', async () => {
    const { service } = setup([payout(3, 'due')]);
    expect(await service.mine(null)).toEqual([]);
    expect((await service.mine(7)).map((p) => p.payoutLocalId)).toEqual([3]);
  });
});
