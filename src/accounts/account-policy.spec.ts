import { canResetPassword, canSetStatus, canView } from './account-policy';

const admin = { id: 1, role: 'admin' as const };
const manager = { id: 2, role: 'manager' as const };
const trainer = { id: 3, role: 'trainer' as const };
const member = { id: 4, role: 'member' as const };
const otherAdmin = { id: 5, role: 'admin' as const };
const otherManager = { id: 6, role: 'manager' as const };

describe('account policy', () => {
  it('lets admins reset anyone but themselves', () => {
    for (const t of [otherAdmin, manager, trainer, member])
      expect(canResetPassword(admin, t)).toBe(true);
    expect(canResetPassword(admin, admin)).toBe(false);
  });

  it('lets managers reset managers, trainers and members, never admins or themselves', () => {
    expect(canResetPassword(manager, trainer)).toBe(true);
    expect(canResetPassword(manager, member)).toBe(true);
    expect(canResetPassword(manager, otherManager)).toBe(true);
    expect(canResetPassword(manager, admin)).toBe(false);
    expect(canResetPassword(manager, manager)).toBe(false);
  });

  it('gives trainers and members no account powers', () => {
    for (const actor of [trainer, member]) {
      expect(canView(actor, member)).toBe(false);
      expect(canResetPassword(actor, member)).toBe(false);
      expect(canSetStatus(actor, member)).toBe(false);
    }
  });

  it('keeps status changes with admins, never on themselves', () => {
    expect(canSetStatus(admin, member)).toBe(true);
    expect(canSetStatus(admin, otherAdmin)).toBe(true);
    expect(canSetStatus(admin, admin)).toBe(false);
    expect(canSetStatus(manager, member)).toBe(false);
  });

  it('hides only admins from managers', () => {
    expect(canView(manager, admin)).toBe(false);
    expect(canView(manager, otherManager)).toBe(true);
    expect(canView(manager, member)).toBe(true);
  });

  it('never lets a manager activate or deactivate anyone', () => {
    for (const t of [otherManager, trainer, member, admin]) expect(canSetStatus(manager, t)).toBe(false);
  });
});
