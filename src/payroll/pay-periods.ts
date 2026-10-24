/**
 * Pay periods and payout lines, kept free of the database so they can be tested on
 * their own. Dates are YYYY-MM-DD strings in the gym's time zone; a period runs from
 * its start up to, not including, its end.
 */

export interface PeriodRules {
  /** monthly | days */
  cycle: string;
  cycleDays: number;
  cycleStart: string;
}

export interface PayRules extends PeriodRules {
  /** none | monthly | daily */
  baseType: string;
  baseAmount: number;
  deductAbsence: boolean;
  workDays: number[];
}

export interface PayoutLine {
  /** base | deduction | commission */
  kind: string;
  label: string;
  amount: number;
  detail?: Record<string, unknown>;
}

/** One revenue share's takings in a period, worked out from the payments. */
export interface ShareTakings {
  shareId: number;
  label: string;
  payments: number;
  revenue: number;
  amount: number;
}

export const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function toDays(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

function fromDays(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return fromDays(toDays(iso) + n);
}

export function isDate(iso: string): boolean {
  return DATE.test(iso) && fromDays(toDays(iso)) === iso;
}

/** `iso` plus k months, keeping its day of the month (the 31st becomes the last day of shorter months). */
export function addMonths(iso: string, k: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = m - 1 + k;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d, last)))
    .toISOString()
    .slice(0, 10);
}

/** The pay period containing `day`, or null before the first one. */
export function periodContaining(
  p: PeriodRules,
  day: string,
): { start: string; end: string } | null {
  if (!isDate(p.cycleStart) || day < p.cycleStart) return null;
  if (p.cycle === 'days') {
    const n = Math.max(1, p.cycleDays);
    const k = Math.floor((toDays(day) - toDays(p.cycleStart)) / n);
    const start = addDays(p.cycleStart, k * n);
    return { start, end: addDays(start, n) };
  }
  const [sy, sm] = p.cycleStart.split('-').map(Number);
  const [dy, dm] = day.split('-').map(Number);
  let k = Math.max(0, (dy - sy) * 12 + dm - sm);
  for (;;) {
    const start = addMonths(p.cycleStart, k);
    const end = addMonths(p.cycleStart, k + 1);
    if (day < start && k > 0) k -= 1;
    else if (day >= end) k += 1;
    else return { start, end };
  }
}

/**
 * The periods to keep payouts for on `today`: those that have ended (at most the last
 * `max`) and the running one, oldest first.
 */
export function periodsUpTo(
  p: PeriodRules,
  today: string,
  max = 12,
): { start: string; end: string; ended: boolean }[] {
  const out: { start: string; end: string; ended: boolean }[] = [];
  let day = p.cycleStart;
  for (let guard = 0; guard < 5000; guard++) {
    const period = periodContaining(p, day);
    if (!period || period.start > today) break;
    const ended = period.end <= today;
    out.push({ ...period, ended });
    if (!ended) break;
    day = period.end;
  }
  const closed = out.filter((x) => x.ended);
  const running = out.filter((x) => !x.ended);
  return [...closed.slice(Math.max(0, closed.length - max)), ...running];
}

/** How many of `workDays` (ISO weekdays) fall from `from` up to, not including, `to`. */
export function workDaysBetween(
  workDays: number[],
  from: string,
  to: string,
): number {
  let n = 0;
  for (let d = toDays(from); d < toDays(to); d++) {
    const iso = ((new Date(d * DAY_MS).getUTCDay() + 6) % 7) + 1;
    if (workDays.includes(iso)) n++;
  }
  return n;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * A period's lines and total. `until` is the last day counted for absences (today for
 * a running period); `attended` the distinct days they checked in during the period.
 */
export function payoutLines(
  p: PayRules,
  period: { start: string; end: string },
  until: string,
  attended: number,
  shares: ShareTakings[],
): { total: number; lines: PayoutLine[] } {
  const lines: PayoutLine[] = [];
  if (p.baseType === 'monthly') {
    lines.push({
      kind: 'base',
      label: 'Base pay',
      amount: round2(p.baseAmount),
    });
    if (p.deductAbsence) {
      const countedEnd =
        addDays(until, 1) < period.end ? addDays(until, 1) : period.end;
      const inPeriod = workDaysBetween(p.workDays, period.start, period.end);
      const expected = workDaysBetween(p.workDays, period.start, countedEnd);
      const absent = Math.max(0, expected - attended);
      if (absent > 0 && inPeriod > 0) {
        lines.push({
          kind: 'deduction',
          label: `${plural(absent, 'absent work day')}`,
          amount: -round2((p.baseAmount / inPeriod) * absent),
          detail: { expected, attended, workDaysInPeriod: inPeriod },
        });
      }
    }
  } else if (p.baseType === 'daily') {
    lines.push({
      kind: 'base',
      label: `${plural(attended, 'day')} at ${round2(p.baseAmount)}`,
      amount: round2(p.baseAmount * attended),
      detail: { attended },
    });
  }
  for (const s of shares) {
    if (s.payments === 0) continue;
    lines.push({
      kind: 'commission',
      label: s.label,
      amount: s.amount,
      detail: { shareId: s.shareId, payments: s.payments, revenue: s.revenue },
    });
  }
  const total = Math.max(
    0,
    round2(lines.reduce((sum, l) => sum + l.amount, 0)),
  );
  return { total, lines };
}

/** A share's amount from its payments: a percentage of their total, or a fixed amount each. */
export function shareAmount(
  rateType: string,
  rate: number,
  payments: number,
  revenue: number,
): number {
  const amount =
    rateType === 'percent' ? (revenue * rate) / 100 : payments * rate;
  return round2(Math.max(0, amount));
}

export const SCOPES = [
  'assigned_members',
  'addon_trainer',
  'drop_in_instructor',
  'service',
] as const;
export const TARGET_KINDS = ['plan', 'addon', 'drop_in'] as const;

/** The target kind a scope narrows to; '' for 'service', which takes any. */
export const SCOPE_TARGET: Record<string, string> = {
  assigned_members: 'plan',
  addon_trainer: 'addon',
  drop_in_instructor: 'drop_in',
  service: '',
};

/** A revenue share in words, e.g. "20% of membership payments from members assigned to them". */
export function describeShare(
  s: { scope: string; rateType: string; rate: number },
  targetName: string | null,
): string {
  const rate =
    s.rateType === 'percent' ? `${s.rate}%` : `${s.rate} ETB per payment`;
  const what =
    s.scope === 'assigned_members'
      ? targetName
        ? `${targetName} payments from members assigned to them`
        : 'membership payments from members assigned to them'
      : s.scope === 'addon_trainer'
        ? targetName
          ? `${targetName} add-on payments they train`
          : 'add-on payments they train'
        : s.scope === 'drop_in_instructor'
          ? targetName
            ? `${targetName} drop-ins they ran`
            : 'drop-ins they ran'
          : `every ${targetName ?? 'service'} payment`;
  return `${rate} of ${what}`;
}

/** Why a revenue share is not valid, or null. */
export function shareProblem(s: {
  scope: string;
  targetKind: string | null;
  targetLocalId: number | null;
  rateType: string;
  rate: number;
}): string | null {
  if (!(SCOPES as readonly string[]).includes(s.scope))
    return 'Choose what the share is of';
  if (s.rateType !== 'percent' && s.rateType !== 'fixed')
    return 'A share is a percentage or a fixed amount';
  if (
    !Number.isFinite(s.rate) ||
    s.rate < 0 ||
    (s.rateType === 'percent' && s.rate > 100)
  )
    return 'Enter a percentage from 0 to 100, or an amount of 0 or more';
  if (s.scope === 'service') {
    if (
      !s.targetKind ||
      !(TARGET_KINDS as readonly string[]).includes(s.targetKind) ||
      s.targetLocalId == null
    )
      return 'Choose the plan, add-on or drop-in';
    return null;
  }
  if (s.targetKind == null && s.targetLocalId == null) return null;
  if (s.targetKind === SCOPE_TARGET[s.scope] && s.targetLocalId != null)
    return null;
  return 'That choice does not fit this kind of share';
}
