/**
 * Who sees which notifications.
 *
 * Desk notifications (no recipient) are about the gym and go to the admin panel:
 * admins and managers. Personal notifications have one recipient account, of any role.
 */

/** About the gym, shown to admins and managers. */
export const DESK_TYPES = [
  'payment',
  'package_changed',
  'start_date_changed',
  /** Daily: memberships ending in the next week */
  'expiring_summary',
] as const;

/** Addressed to one account. */
export const PERSONAL_TYPES = [
  /** Written by an admin or manager */
  'message',
  'membership_expiring',
  'membership_expired',
  'payment_received',
  'plan_changed',
  /** Daily, to a trainer: their clients expiring, expired or not seen lately */
  'client_digest',
] as const;

export const ALL_NOTIFICATION_TYPES: readonly string[] = [...DESK_TYPES, ...PERSONAL_TYPES];

/**
 * Notification types only admins receive. Payment alerts carry amounts, and money
 * (transactions, revenue) is admin-only; managers get the other alerts.
 */
export const ADMIN_ONLY_NOTIFICATION_TYPES: readonly string[] = ['payment'];

const ROLE_TYPES: Record<string, readonly string[]> = {
  admin: [...DESK_TYPES, 'message'],
  manager: [...DESK_TYPES.filter((t) => !ADMIN_ONLY_NOTIFICATION_TYPES.includes(t)), 'message'],
  trainer: ['message', 'client_digest'],
  member: ['message', 'membership_expiring', 'membership_expired', 'payment_received', 'plan_changed'],
};

/** The types an account with this role can receive. */
export function typesForRole(role: string): string[] {
  return [...(ROLE_TYPES[role] ?? [])];
}

/** Whether the role sees desk notifications (those without a recipient). */
export function seesDesk(role: string): boolean {
  return role === 'admin' || role === 'manager';
}

/** Types hidden from an account with this role. */
export function hiddenNotificationTypes(role: string): string[] {
  const allowed = typesForRole(role);
  return ALL_NOTIFICATION_TYPES.filter((t) => !allowed.includes(t));
}
