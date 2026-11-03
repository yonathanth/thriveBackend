import { SetMetadata } from '@nestjs/common';
import type { Role } from './roles';

/**
 * What a website account may see and do, finer than its role.
 *
 * The role still fences each route (a trainer never reaches the admin panel API);
 * permissions then decide, within that fence, which screens, actions and sensitive
 * fields an account gets. Each role has defaults; an admin can grant or deny single
 * permissions per account. Admins always hold every permission, so nobody can lock
 * the gym out of its own panel.
 *
 * Website-only: the desktop app keeps its own permissions and nothing here is synced.
 */

export type PermissionAction =
  'view' | 'create' | 'edit' | 'delete' | 'approve' | 'manage';

export interface PermissionDef {
  key: string;
  label: string;
  area: string;
  action: PermissionAction;
  /** Admin-only and never grantable to anyone else. */
  adminOnly?: boolean;
  /** Roles an admin may grant this to (ignored when adminOnly). */
  grantableTo: Role[];
}

const MANAGER: Role[] = ['manager'];
const STAFF: Role[] = ['manager', 'trainer'];

export const PERMISSIONS: readonly PermissionDef[] = [
  {
    key: 'dashboard.operational',
    area: 'Dashboard',
    action: 'view',
    label: "Operational dashboard (active members, today's check-ins)",
    grantableTo: MANAGER,
  },
  {
    key: 'dashboard.business',
    area: 'Dashboard',
    action: 'view',
    label: 'Business figures (total members, growth, revenue)',
    grantableTo: MANAGER,
  },

  {
    key: 'members.view',
    area: 'Members',
    action: 'view',
    label: 'Member list, details, history and attendance',
    grantableTo: MANAGER,
  },
  {
    key: 'members.stats.view',
    area: 'Members',
    action: 'view',
    label: 'Member count totals',
    grantableTo: MANAGER,
  },
  {
    key: 'members.contact.view',
    area: 'Members',
    action: 'view',
    label: 'Member phone, email and emergency contact',
    grantableTo: MANAGER,
  },
  {
    key: 'members.health.view',
    area: 'Members',
    action: 'view',
    label: 'Member health records',
    grantableTo: MANAGER,
  },
  {
    key: 'members.payments.view',
    area: 'Members',
    action: 'view',
    label: 'Member payment history',
    grantableTo: MANAGER,
  },
  {
    key: 'members.progress.edit',
    area: 'Members',
    action: 'edit',
    label: 'Set member goals and training schedules',
    grantableTo: STAFF,
  },

  {
    key: 'services.view',
    area: 'Services',
    action: 'view',
    label: 'Services and catalog (managed on the desktop app)',
    grantableTo: MANAGER,
  },
  {
    key: 'catalog.money.view',
    area: 'Services',
    action: 'view',
    label: 'Drop-in amounts paid, add-on subscriptions, discount usage',
    grantableTo: MANAGER,
  },

  {
    key: 'attendance.view',
    area: 'Attendance',
    action: 'view',
    label: 'Member attendance',
    grantableTo: MANAGER,
  },

  {
    key: 'staff.view',
    area: 'Staff',
    action: 'view',
    label: 'Staff list, attendance and schedule',
    grantableTo: MANAGER,
  },
  {
    key: 'staff.contact.view',
    area: 'Staff',
    action: 'view',
    label: 'Staff phone numbers',
    grantableTo: MANAGER,
  },

  {
    key: 'prospects.view',
    area: 'Prospects',
    action: 'view',
    label: 'Potential customers',
    grantableTo: MANAGER,
  },

  {
    key: 'finance.view',
    area: 'Finance',
    action: 'view',
    label: 'Transactions and financial totals',
    grantableTo: MANAGER,
  },
  {
    key: 'finance.export',
    area: 'Finance',
    action: 'manage',
    label: 'Export transactions',
    grantableTo: MANAGER,
  },
  {
    key: 'online_payments.view',
    area: 'Finance',
    action: 'view',
    label: 'Online payments and amounts',
    grantableTo: MANAGER,
  },
  {
    key: 'finance.settings',
    area: 'Finance',
    action: 'manage',
    label: 'Finance start date',
    adminOnly: true,
    grantableTo: [],
  },

  {
    key: 'payroll.view',
    area: 'Payroll',
    action: 'view',
    label: 'Staff pay and payouts',
    adminOnly: true,
    grantableTo: [],
  },
  {
    key: 'payroll.manage',
    area: 'Payroll',
    action: 'approve',
    label: 'Set pay, mark payouts paid',
    adminOnly: true,
    grantableTo: [],
  },
  {
    key: 'payslip.own',
    area: 'Payroll',
    action: 'view',
    label: 'Own payslips',
    grantableTo: STAFF,
  },

  {
    key: 'inventory.view',
    area: 'Inventory',
    action: 'view',
    label: 'Stock, holders, handovers and assets',
    grantableTo: MANAGER,
  },
  {
    key: 'inventory.money.view',
    area: 'Inventory',
    action: 'view',
    label: 'Inventory money, sales and reports',
    grantableTo: MANAGER,
  },

  {
    key: 'accounts.view',
    area: 'Accounts',
    action: 'view',
    label: 'Website accounts',
    grantableTo: MANAGER,
  },
  {
    key: 'accounts.reset_password',
    area: 'Accounts',
    action: 'edit',
    label: 'Reset passwords (non-admin accounts)',
    grantableTo: MANAGER,
  },
  {
    key: 'accounts.conflicts.resolve',
    area: 'Accounts',
    action: 'approve',
    label: 'Resolve account conflicts, re-check links',
    grantableTo: MANAGER,
  },
  {
    key: 'accounts.status',
    area: 'Accounts',
    action: 'manage',
    label: 'Activate and deactivate accounts',
    adminOnly: true,
    grantableTo: [],
  },
  {
    key: 'accounts.create_admin',
    area: 'Accounts',
    action: 'create',
    label: 'Create admin accounts',
    adminOnly: true,
    grantableTo: [],
  },
  {
    key: 'accounts.permissions.manage',
    area: 'Accounts',
    action: 'manage',
    label: 'Manage permissions',
    adminOnly: true,
    grantableTo: [],
  },

  {
    key: 'sms.send',
    area: 'Messaging',
    action: 'create',
    label: 'Send SMS to a member',
    grantableTo: MANAGER,
  },
  {
    key: 'sms.bulk',
    area: 'Messaging',
    action: 'create',
    label: 'Bulk SMS and outreach',
    grantableTo: MANAGER,
  },
  {
    key: 'sms.history.view',
    area: 'Messaging',
    action: 'view',
    label: 'SMS history and templates',
    grantableTo: MANAGER,
  },
  {
    key: 'notifications.send',
    area: 'Messaging',
    action: 'create',
    label: 'Send notifications',
    grantableTo: MANAGER,
  },

  {
    key: 'audit.view',
    area: 'Audit',
    action: 'view',
    label: 'Audit log',
    adminOnly: true,
    grantableTo: [],
  },
];

export type PermissionKey = string;

const BY_KEY = new Map(PERMISSIONS.map((p) => [p.key, p]));
export const ALL_PERMISSIONS: readonly string[] = PERMISSIONS.map((p) => p.key);

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === 'string' && BY_KEY.has(value);
}

export function permissionDef(key: string): PermissionDef | undefined {
  return BY_KEY.get(key);
}

/** Defaults per role. Admin holds everything; members use their own fixed portal. */
export const ROLE_DEFAULTS: Record<Role, readonly string[]> = {
  admin: ALL_PERMISSIONS,
  manager: [
    'dashboard.operational',
    'members.view',
    'members.contact.view',
    'members.health.view',
    'members.progress.edit',
    'services.view',
    'attendance.view',
    'staff.view',
    'prospects.view',
    'payslip.own',
    'inventory.view',
    'accounts.view',
    'accounts.reset_password',
    'accounts.conflicts.resolve',
    'sms.send',
    'sms.bulk',
    'sms.history.view',
    'notifications.send',
  ],
  trainer: ['members.progress.edit', 'payslip.own'],
  member: [],
};

export type PermissionEffect = 'grant' | 'deny';
export interface PermissionOverride {
  permission: string;
  effect: string;
}

/** Whether an admin may set an override for this key on an account with this role. */
export function canOverride(role: Role, key: string): boolean {
  const def = BY_KEY.get(key);
  return !!def && !def.adminOnly && def.grantableTo.includes(role);
}

/**
 * Role defaults, plus grants, minus denies. Overrides the role can't carry (unknown,
 * admin-only, or not grantable to that role) are ignored, so a stale row can never
 * widen access.
 */
export function effectivePermissions(
  role: Role,
  overrides: readonly PermissionOverride[] = [],
): string[] {
  if (role === 'admin') return [...ALL_PERMISSIONS];
  if (role === 'member') return [];
  const result = new Set(ROLE_DEFAULTS[role]);
  for (const o of overrides) {
    if (!canOverride(role, o.permission)) continue;
    if (o.effect === 'grant') result.add(o.permission);
    else if (o.effect === 'deny') result.delete(o.permission);
  }
  return ALL_PERMISSIONS.filter((k) => result.has(k));
}

export const PERMISSIONS_KEY = 'permissions';

/**
 * Requires at least one of these permissions, on top of the route's roles. Checked
 * by RolesGuard, so it only works on routes that already use @Auth.
 */
export const RequirePermission = (...keys: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, keys);

/** True when the signed-in account holds the permission. */
export function can(
  user: { permissions?: readonly string[] } | undefined,
  key: PermissionKey,
): boolean {
  return !!user?.permissions?.includes(key);
}
