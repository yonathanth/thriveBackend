import type { Role } from '../auth/roles';

interface Actor {
  id: number;
  role: Role;
}
interface Target {
  id: number;
  role: string;
}

/**
 * Roles a manager may see and reset. Never admins: a reset sets the shared temporary
 * password, so resetting an admin would let a manager sign in as that admin.
 */
export const MANAGER_MANAGES: Role[] = ['manager', 'trainer', 'member'];

/** Whether the actor may see this account in the accounts list. */
export function canView(actor: Actor, target: Target): boolean {
  if (actor.role === 'admin') return true;
  if (actor.role === 'manager')
    return (MANAGER_MANAGES as string[]).includes(target.role);
  return false;
}

/**
 * Whether the actor may reset the target's password to the temporary default.
 * Nobody resets their own (they change it instead); admins reset anyone else,
 * managers reset managers, trainers and members.
 */
export function canResetPassword(actor: Actor, target: Target): boolean {
  if (actor.id === target.id) return false;
  return canView(actor, target);
}

/** Activating and deactivating accounts is an admin action, never on oneself; managers sign nobody out. */
export function canSetStatus(actor: Actor, target: Target): boolean {
  return actor.role === 'admin' && actor.id !== target.id;
}
