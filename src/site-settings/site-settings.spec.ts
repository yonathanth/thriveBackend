import { startOfDayIn } from './site-settings.service';
import { countedFinance, countedFinanceRaw, paidIncome } from '../common/finance';

describe('finance start date', () => {
  it('starts at local midnight in the gym time zone', () => {
    expect(startOfDayIn('2026-10-01', 'Africa/Addis_Ababa')).toBe('2026-09-30T21:00:00.000Z');
    expect(startOfDayIn('2026-10-01', 'UTC')).toBe('2026-10-01T00:00:00.000Z');
  });

  it('is part of every revenue figure and of the raw-SQL reports', () => {
    expect(paidIncome('t')).toContain(countedFinance('t'));
    expect(countedFinance('t')).toContain("ss.\"key\" = 'finance_start_at'");
    expect(countedFinanceRaw('t')).toContain('t."transactionDate" >=');
  });
});
