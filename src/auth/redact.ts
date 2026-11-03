import { can } from './permissions';

/**
 * Removing what an account may not see from a response, on the server.
 *
 * Hiding a field in the website only hides it from people who don't open the network
 * tab; these helpers keep it out of the response instead.
 */

type User = { permissions?: readonly string[] } | undefined;

/** Desktop rows store money under names like price, amount_paid, total_amount, fee. Kept narrow so counts such as total_visits survive. */
const MONEY_KEY = /(price|amount|cost|fee|revenue|income|balance)/i;

export function stripMoney<T extends object>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!MONEY_KEY.test(k)) out[k] = v;
  }
  return out as T;
}

const MEMBER_CONTACT = [
  'phone',
  'email',
  'emergencyContact',
  'telegramUsername',
] as const;
const MEMBER_HEALTH = ['bloodType', 'height'] as const;

/** A member as this account may see it: contact and health fields need permissions. */
export function redactMember<T extends object>(user: User, member: T): T {
  const hideContact = !can(user, 'members.contact.view');
  const hideHealth = !can(user, 'members.health.view');
  if (!hideContact && !hideHealth) return member;
  const out = { ...member } as Record<string, unknown>;
  if (hideContact) for (const k of MEMBER_CONTACT) if (k in out) out[k] = null;
  if (hideHealth) for (const k of MEMBER_HEALTH) if (k in out) out[k] = null;
  return out as T;
}

/** A staff record without its phone unless the account may see staff contacts. */
export function redactStaff<T extends object>(user: User, staff: T): T {
  if (can(user, 'staff.contact.view')) return staff;
  const out = { ...staff } as Record<string, unknown>;
  for (const k of ['phoneNumber', 'phone', 'email'])
    if (k in out) out[k] = null;
  return out as T;
}
