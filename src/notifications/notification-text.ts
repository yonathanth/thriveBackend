/**
 * How each desktop event reads as a notification. Kept free of Nest and the database
 * so the wording can be tested and changed on its own.
 */

export const NOTIFICATION_TYPES = ['payment', 'package_changed', 'start_date_changed'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(type: string): type is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type);
}

/**
 * Parses a desktop date. SQLite stores "2026-10-01 00:00:00", in UTC when no offset
 * is given (CURRENT_TIMESTAMP and the app's own UTC dates both are).
 */
export function parseDesktopDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  let s = value.trim();
  if (!s.includes('T')) s = s.replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00';
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s += 'Z';
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export interface TextOptions {
  /** IANA timezone the gym is in; dates are shown as the gym sees them. */
  timeZone: string;
  currency: string;
}

function day(value: unknown, opts: TextOptions): string | null {
  const d = parseDesktopDate(value);
  if (!d) return null;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: opts.timeZone,
  });
}

function money(value: unknown, opts: TextOptions): string | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (value == null || isNaN(n)) return null;
  return `${opts.currency} ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * A new start date that picks up where the previous period ended (give or take a
 * day) is a renewal; anything else is a correction worth calling a change.
 */
function isRenewal(data: Record<string, unknown>): boolean {
  const oldEnd = parseDesktopDate(data['old_end_date']);
  const newStart = parseDesktopDate(data['new_start_date']);
  const oldStart = parseDesktopDate(data['old_start_date']);
  if (!oldEnd || !newStart || !oldStart) return false;
  const dayMs = 86_400_000;
  return newStart.getTime() > oldStart.getTime() && newStart.getTime() >= oldEnd.getTime() - dayMs;
}

/** Who made the change in the desktop app, when the desktop said (older ones do not). */
export function actorOf(data: Record<string, unknown>): string | null {
  const name = text(data['actor_username']);
  if (!name) return null;
  const role = text(data['actor_role']);
  return role ? `${name} (${role})` : name;
}

export function notificationText(
  type: NotificationType,
  data: Record<string, unknown>,
  opts: TextOptions,
): { title: string; body: string } {
  const { title, body } = eventText(type, data, opts);
  const actor = actorOf(data);
  return { title, body: actor ? `${body} By ${actor}.` : body };
}

function eventText(
  type: NotificationType,
  data: Record<string, unknown>,
  opts: TextOptions,
): { title: string; body: string } {
  const member = text(data['member_name']);

  if (type === 'payment') {
    const amount = money(data['amount'], opts);
    const addon = text(data['addon_name']);
    const dropIn = text(data['drop_in_name']);
    const what = addon
      ? `${addon} (add-on)`
      : dropIn
        ? `${dropIn} (drop-in)`
        : text(data['service_name']) ?? text(data['description']);
    const method = text(data['payment_method']);
    const discount = Number(data['discount_amount']) > 0 ? money(data['discount_amount'], opts) : null;
    const code = text(data['discount_code']);

    let body = member
      ? amount
        ? `${member} paid ${amount}`
        : `${member} made a payment`
      : amount
        ? `${amount} received`
        : 'A payment was received';
    if (what) body += ` for ${what}`;
    if (method) body += ` via ${method}`;
    if (discount) body += ` (${discount} off${code ? `, ${code}` : ''})`;
    return { title: 'Payment received', body: `${body}.` };
  }

  const who = member ?? 'A member';
  const oldPlan = text(data['old_service_name']);
  const newPlan = text(data['new_service_name']);
  const newStart = day(data['new_start_date'], opts);
  const newEnd = day(data['new_end_date'], opts);
  const period = newStart && newEnd ? `${newStart} – ${newEnd}` : newStart;

  if (type === 'package_changed') {
    if (!oldPlan) {
      return {
        title: 'Package assigned',
        body: `${who} is now on ${newPlan ?? 'a package'}${period ? `, ${period}` : ''}.`,
      };
    }
    return {
      title: 'Package changed',
      body: `${who}: ${oldPlan} → ${newPlan ?? 'no package'}${period ? `, ${period}` : ''}.`,
    };
  }

  // start_date_changed
  const plan = newPlan ?? oldPlan;
  if (isRenewal(data)) {
    return {
      title: 'Membership renewed',
      body: `${who} renewed${plan ? ` ${plan}` : ''}${period ? `: ${period}` : ''}.`,
    };
  }
  const oldStart = day(data['old_start_date'], opts);
  return {
    title: 'Start date changed',
    body: `${who}${plan ? ` (${plan})` : ''}: start ${oldStart ?? '?'} → ${newStart ?? '?'}.`,
  };
}
