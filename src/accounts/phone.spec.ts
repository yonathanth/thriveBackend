import { normalizePhone } from './phone';
import { higherRole, websiteRoleForStaff } from './role-mapping';

describe('normalizePhone', () => {
  it.each([
    ['0911223344', '+251911223344'],
    ['911223344', '+251911223344'],
    ['251911223344', '+251911223344'],
    ['+251911223344', '+251911223344'],
    ['00251911223344', '+251911223344'],
    ['+251 91 122 3344', '+251911223344'],
    ['091-122-3344', '+251911223344'],
    ['0711223344', '+251711223344'],
  ])('normalises %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    '',
    '12345',
    '0111223344',
    '+1 555 123 4567',
    'abc0911223344',
    '09112233445',
  ])('rejects %s', (input) => {
    expect(normalizePhone(input as string | null)).toBeNull();
  });
});

describe('websiteRoleForStaff', () => {
  it('maps manager and trainer in any case', () => {
    expect(websiteRoleForStaff(' Manager ')).toBe('manager');
    expect(websiteRoleForStaff('TRAINER')).toBe('trainer');
  });

  it('ignores custom roles, including admin', () => {
    expect(websiteRoleForStaff('Admin')).toBeNull();
    expect(websiteRoleForStaff('Receptionist')).toBeNull();
    expect(websiteRoleForStaff('Head Trainer')).toBeNull();
    expect(websiteRoleForStaff(null)).toBeNull();
  });

  it('keeps the higher role', () => {
    expect(higherRole('member', 'trainer')).toBe('trainer');
    expect(higherRole('manager', 'trainer')).toBe('manager');
    expect(higherRole(null, 'member')).toBe('member');
  });
});
