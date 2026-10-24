import {
  addMonths,
  describeShare,
  payoutLines,
  periodContaining,
  periodsUpTo,
  shareAmount,
  shareProblem,
  workDaysBetween,
  type PayRules,
} from './pay-periods';

const rules = (
  cycle: string,
  cycleDays: number,
  cycleStart: string,
): PayRules => ({
  cycle,
  cycleDays,
  cycleStart,
  baseType: 'monthly',
  baseAmount: 3000,
  deductAbsence: true,
  workDays: [1, 2, 3, 4, 5, 6],
});

describe('pay periods', () => {
  it('keeps the start day each month and handles short months', () => {
    const p = rules('monthly', 30, '2026-10-01');
    expect(periodContaining(p, '2026-10-15')).toEqual({
      start: '2026-10-01',
      end: '2026-11-01',
    });
    expect(periodContaining(p, '2026-11-01')).toEqual({
      start: '2026-11-01',
      end: '2026-12-01',
    });
    expect(periodContaining(p, '2026-09-30')).toBeNull();
    const late = rules('monthly', 30, '2026-01-31');
    expect(periodContaining(late, '2026-02-15')).toEqual({
      start: '2026-01-31',
      end: '2026-02-28',
    });
    expect(periodContaining(late, '2026-03-05')).toEqual({
      start: '2026-02-28',
      end: '2026-03-31',
    });
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('runs every N days', () => {
    const p = rules('days', 30, '2026-10-01');
    expect(periodContaining(p, '2026-10-31')).toEqual({
      start: '2026-10-31',
      end: '2026-11-30',
    });
  });

  it('lists ended periods and the running one, and nothing before the start', () => {
    const p = rules('monthly', 30, '2026-10-01');
    const list = periodsUpTo(p, '2027-01-10');
    expect(list.map((x) => [x.start, x.ended])).toEqual([
      ['2026-10-01', true],
      ['2026-11-01', true],
      ['2026-12-01', true],
      ['2027-01-01', false],
    ]);
    expect(
      periodsUpTo(rules('monthly', 30, '2026-12-01'), '2026-11-20'),
    ).toEqual([]);
    expect(
      periodsUpTo(p, '2030-01-10', 12).filter((x) => x.ended),
    ).toHaveLength(12);
  });

  it('counts expected work days', () => {
    // 2026-10-05 is a Monday: two weeks Mon-Sat is 12 work days.
    expect(
      workDaysBetween([1, 2, 3, 4, 5, 6], '2026-10-05', '2026-10-19'),
    ).toBe(12);
  });
});

describe('payout lines', () => {
  it('deducts absent work days from a monthly base', () => {
    const p = { ...rules('days', 14, '2026-10-05'), baseAmount: 1200 };
    const { total, lines } = payoutLines(
      p,
      { start: '2026-10-05', end: '2026-10-19' },
      '2026-10-18',
      10,
      [],
    );
    expect(lines[1]).toMatchObject({ kind: 'deduction', amount: -200 });
    expect(total).toBe(1000);
  });

  it('only counts days so far in a running period', () => {
    const p = { ...rules('days', 14, '2026-10-05'), baseAmount: 1200 };
    // Through Wednesday the 7th: 3 work days expected, 3 attended.
    const { lines } = payoutLines(
      p,
      { start: '2026-10-05', end: '2026-10-19' },
      '2026-10-07',
      3,
      [],
    );
    expect(lines.map((l) => l.kind)).toEqual(['base']);
  });

  it('pays a daily rate per day checked in, plus shares that had payments', () => {
    const p = {
      ...rules('monthly', 30, '2026-10-01'),
      baseType: 'daily',
      baseAmount: 250,
    };
    const { total, lines } = payoutLines(
      p,
      { start: '2026-10-01', end: '2026-11-01' },
      '2026-10-31',
      4,
      [
        { shareId: 1, label: 'PT', payments: 2, revenue: 4000, amount: 800 },
        { shareId: 2, label: 'Nothing', payments: 0, revenue: 0, amount: 0 },
      ],
    );
    expect(lines.map((l) => [l.label, l.amount])).toEqual([
      ['4 days at 250', 1000],
      ['PT', 800],
    ]);
    expect(total).toBe(1800);
  });

  it('works out share amounts', () => {
    expect(shareAmount('percent', 20, 3, 4500)).toBe(900);
    expect(shareAmount('fixed', 150, 3, 4500)).toBe(450);
  });
});

describe('revenue shares', () => {
  it('describes them in words', () => {
    expect(
      describeShare(
        { scope: 'assigned_members', rateType: 'percent', rate: 20 },
        null,
      ),
    ).toBe('20% of membership payments from members assigned to them');
    expect(
      describeShare(
        { scope: 'service', rateType: 'fixed', rate: 100 },
        'Sauna',
      ),
    ).toBe('100 ETB per payment of every Sauna payment');
  });

  it('refuses shares that do not fit', () => {
    const ok = {
      scope: 'assigned_members',
      targetKind: null,
      targetLocalId: null,
      rateType: 'percent',
      rate: 10,
    };
    expect(shareProblem(ok)).toBeNull();
    expect(shareProblem({ ...ok, rate: 150 })).toMatch(/0 to 100/);
    expect(shareProblem({ ...ok, scope: 'service' })).toMatch(
      /Choose the plan/,
    );
    expect(
      shareProblem({ ...ok, targetKind: 'addon', targetLocalId: 3 }),
    ).toMatch(/does not fit/);
    expect(
      shareProblem({ ...ok, targetKind: 'plan', targetLocalId: 3 }),
    ).toBeNull();
  });
});
