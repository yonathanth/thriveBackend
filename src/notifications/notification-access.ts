/**
 * Notification types only admins receive. Payment alerts carry amounts, and money
 * (transactions, revenue) is admin-only; managers get the other alerts.
 */
export const ADMIN_ONLY_NOTIFICATION_TYPES: readonly string[] = ['payment'];

/** Types hidden from an account with this role. */
export function hiddenNotificationTypes(role: string): string[] {
  return role === 'admin' ? [] : [...ADMIN_ONLY_NOTIFICATION_TYPES];
}
