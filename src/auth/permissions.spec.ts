import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLE_DEFAULTS,
  canOverride,
  effectivePermissions,
} from './permissions';
import { loadOverrides } from './permission-overrides';

describe('effectivePermissions', () => {
  it('gives admins everything, whatever the overrides say', () => {
    expect(
      effectivePermissions('admin', [
        { permission: 'audit.view', effect: 'deny' },
      ]),
    ).toEqual([...ALL_PERMISSIONS]);
  });

  it('gives members nothing: their portal is fixed', () => {
    expect(
      effectivePermissions('member', [
        { permission: 'members.view', effect: 'grant' },
      ]),
    ).toEqual([]);
  });

  it('starts from the role defaults', () => {
    expect(new Set(effectivePermissions('manager'))).toEqual(
      new Set(ROLE_DEFAULTS.manager),
    );
  });

  it('adds grants and removes denies', () => {
    const result = effectivePermissions('manager', [
      { permission: 'finance.view', effect: 'grant' },
      { permission: 'sms.bulk', effect: 'deny' },
    ]);
    expect(result).toContain('finance.view');
    expect(result).not.toContain('sms.bulk');
  });

  it('never grants an admin-only permission', () => {
    for (const key of [
      'audit.view',
      'payroll.manage',
      'accounts.permissions.manage',
    ]) {
      expect(
        effectivePermissions('manager', [{ permission: key, effect: 'grant' }]),
      ).not.toContain(key);
    }
  });

  it('ignores grants a role cannot carry, and unknown keys', () => {
    const result = effectivePermissions('trainer', [
      { permission: 'finance.view', effect: 'grant' },
      { permission: 'made.up', effect: 'grant' },
    ]);
    expect(result).not.toContain('finance.view');
    expect(result).not.toContain('made.up');
  });

  it('keeps business figures and money away from managers by default', () => {
    for (const key of [
      'dashboard.business',
      'members.stats.view',
      'members.payments.view',
      'catalog.money.view',
      'staff.contact.view',
      'finance.view',
      'online_payments.view',
      'inventory.money.view',
    ]) {
      expect(ROLE_DEFAULTS.manager).not.toContain(key);
    }
  });

  it('only lists real keys in role defaults', () => {
    for (const keys of Object.values(ROLE_DEFAULTS)) {
      for (const k of keys) expect(ALL_PERMISSIONS).toContain(k);
    }
  });

  it('marks admin-only keys as grantable to nobody', () => {
    for (const p of PERMISSIONS.filter((x) => x.adminOnly)) {
      expect(canOverride('manager', p.key)).toBe(false);
      expect(canOverride('trainer', p.key)).toBe(false);
    }
  });
});

describe('loadOverrides', () => {
  it('falls back to role defaults when the table is not there yet', async () => {
    const repo = {
      find: () =>
        Promise.reject(
          Object.assign(new Error('relation does not exist'), {
            code: '42P01',
          }),
        ),
    };
    await expect(loadOverrides(repo as never, 2)).resolves.toEqual([]);
  });

  it('does not hide other database errors', async () => {
    const repo = {
      find: () => Promise.reject(new Error('connection refused')),
    };
    await expect(loadOverrides(repo as never, 2)).rejects.toThrow(
      'connection refused',
    );
  });
});
