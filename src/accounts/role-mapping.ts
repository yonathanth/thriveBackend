import type { Role } from '../auth/roles';

/**
 * Desktop staff roles are free text and customisable. Only these two map onto a
 * website role; every other desktop role (including any named "admin") gets no
 * website access. Website admins are created on the website only.
 */
export function websiteRoleForStaff(
  staffRole: string | null | undefined,
): Role | null {
  switch (staffRole?.trim().toLowerCase()) {
    case 'manager':
      return 'manager';
    case 'trainer':
      return 'trainer';
    default:
      return null;
  }
}

const RANK: Record<Role, number> = {
  member: 1,
  trainer: 2,
  manager: 3,
  admin: 4,
};

/** One phone, one login: a trainer who is also a member signs in as a trainer. */
export function higherRole(a: Role | null, b: Role | null): Role | null {
  if (!a) return b;
  if (!b) return a;
  return RANK[a] >= RANK[b] ? a : b;
}
