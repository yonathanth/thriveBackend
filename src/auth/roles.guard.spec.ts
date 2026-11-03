import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard, AuthUser } from './roles.guard';
import { ALLOW_PASSWORD_CHANGE_PENDING_KEY, ROLES_KEY } from './roles';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PERMISSIONS_KEY } from './permissions';

function context(
  user: Partial<AuthUser> | undefined,
  meta: Record<string, unknown>,
): ExecutionContext {
  const handler = () => undefined;
  for (const [key, value] of Object.entries(meta))
    Reflect.defineMetadata(key, value, handler);
  class Ctrl {}
  return {
    getHandler: () => handler,
    getClass: () => Ctrl,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const user = (
  role: AuthUser['role'],
  extra: Partial<AuthUser> = {},
): Partial<AuthUser> => ({
  id: 1,
  role,
  mustChangePassword: false,
  ...extra,
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('allows a listed role', () => {
    expect(
      guard.canActivate(
        context(user('manager'), { [ROLES_KEY]: ['admin', 'manager'] }),
      ),
    ).toBe(true);
  });

  it('refuses a role that is not listed', () => {
    expect(() =>
      guard.canActivate(
        context(user('member'), { [ROLES_KEY]: ['admin', 'manager'] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('refuses a route with no roles (fails closed)', () => {
    expect(() => guard.canActivate(context(user('admin'), {}))).toThrow(
      ForbiddenException,
    );
  });

  it('refuses without a user', () => {
    expect(() =>
      guard.canActivate(context(undefined, { [ROLES_KEY]: ['admin'] })),
    ).toThrow(ForbiddenException);
  });

  it('lets public routes through', () => {
    expect(
      guard.canActivate(context(undefined, { [IS_PUBLIC_KEY]: true })),
    ).toBe(true);
  });

  it('blocks a pending password change except where allowed', () => {
    const pending = user('member', { mustChangePassword: true });
    expect(() =>
      guard.canActivate(context(pending, { [ROLES_KEY]: ['member'] })),
    ).toThrow('Password change required');
    expect(
      guard.canActivate(
        context(pending, {
          [ROLES_KEY]: ['member'],
          [ALLOW_PASSWORD_CHANGE_PENDING_KEY]: true,
        }),
      ),
    ).toBe(true);
  });
  it('requires one of the listed permissions on top of the role', () => {
    const meta = { [ROLES_KEY]: ['admin', 'manager'], [PERMISSIONS_KEY]: ['finance.view', 'dashboard.business'] };
    expect(() =>
      guard.canActivate(context(user('manager', { permissions: ['members.view'] }), meta)),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(context(user('manager', { permissions: ['dashboard.business'] }), meta)),
    ).toBe(true);
  });

  it('still checks the role before permissions', () => {
    expect(() =>
      guard.canActivate(
        context(user('trainer', { permissions: ['finance.view'] }), {
          [ROLES_KEY]: ['admin', 'manager'],
          [PERMISSIONS_KEY]: ['finance.view'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('refuses a permission route when the user carries no permissions', () => {
    expect(() =>
      guard.canActivate(
        context(user('manager'), { [ROLES_KEY]: ['manager'], [PERMISSIONS_KEY]: ['staff.view'] }),
      ),
    ).toThrow(ForbiddenException);
  });
});
