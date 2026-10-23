import { SetMetadata } from '@nestjs/common';

/** The only roles the website knows. Desktop roles map onto these or are ignored. */
export const ROLES = ['admin', 'manager', 'trainer', 'member'] as const;
export type Role = (typeof ROLES)[number];

/** Admin-panel roles: the operational dashboard is shared by admins and managers. */
export const STAFF_ROLES: Role[] = ['admin', 'manager'];

export const ROLES_KEY = 'roles';
export const ALLOW_PASSWORD_CHANGE_PENDING_KEY = 'allowPasswordChangePending';

export function isRole(value: unknown): value is Role {
  return (
    typeof value === 'string' && (ROLES as readonly string[]).includes(value)
  );
}

/** Roles allowed on a handler or controller. A JWT route without this is denied. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Lets an account that still has to replace its temporary password call this route
 * (profile, change-password). Every other route refuses it until the change is made.
 */
export const AllowPasswordChangePending = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_PENDING_KEY, true);
