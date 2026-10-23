/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- reads decorator metadata from dynamically required controllers */
import * as fs from 'fs';
import * as path from 'path';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { ApiKeyGuard } from './api-key.guard';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles';

/**
 * Every route must be deliberately reachable: desktop API key, @Public, a JWT route
 * with roles, or one of the known unauthenticated endpoints below. A new endpoint
 * that forgets its guard fails this test instead of shipping open.
 */
const KNOWN_UNAUTHENTICATED = new Set([
  'AppController.getHello',
  'AuthController.login',
  'SiteController.getCatalog',
  'PotentialCustomersController.register',
  // AfroMessage delivery callbacks.
  'SmsController.handleStatusCallback',
  'SmsController.handleCreateCallback',
]);

function controllerFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return controllerFiles(full);
    return entry.name.endsWith('.controller.ts') ? [full] : [];
  });
}

interface RouteInfo {
  id: string;
  guards: unknown[];
  roles: string[] | undefined;
  isPublic: boolean;
}

function routes(): RouteInfo[] {
  const found: RouteInfo[] = [];
  for (const file of controllerFiles(path.join(__dirname, '..'))) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file);
    for (const exported of Object.values(mod)) {
      if (
        typeof exported !== 'function' ||
        Reflect.getMetadata(PATH_METADATA, exported) === undefined
      ) {
        continue;
      }
      const ctrl = exported as {
        name: string;
        prototype: Record<string, unknown>;
      };
      for (const key of Object.getOwnPropertyNames(ctrl.prototype)) {
        const handler = ctrl.prototype[key];
        if (key === 'constructor' || typeof handler !== 'function') continue;
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;
        found.push({
          id: `${ctrl.name}.${key}`,
          guards: [
            ...(Reflect.getMetadata(GUARDS_METADATA, ctrl) ?? []),
            ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? []),
          ],
          roles:
            Reflect.getMetadata(ROLES_KEY, handler) ??
            Reflect.getMetadata(ROLES_KEY, ctrl),
          isPublic: !!(
            Reflect.getMetadata(IS_PUBLIC_KEY, handler) ??
            Reflect.getMetadata(IS_PUBLIC_KEY, ctrl)
          ),
        });
      }
    }
  }
  return found;
}

describe('route access', () => {
  const all = routes();

  it('finds the controllers', () => {
    expect(all.length).toBeGreaterThan(50);
  });

  it.each(all.map((r) => [r.id, r] as const))(
    '%s is deliberately reachable',
    (_id, route) => {
      if (route.guards.includes(ApiKeyGuard)) return;
      if (route.guards.includes(JwtAuthGuard)) {
        if (route.isPublic) return;
        expect(route.guards).toContain(RolesGuard);
        expect(route.roles?.length).toBeGreaterThan(0);
        return;
      }
      expect(KNOWN_UNAUTHENTICATED).toContain(route.id);
    },
  );

  it('keeps transactions and the revenue breakdown admin-only', () => {
    const money = all.filter(
      (x) =>
        x.id.startsWith('TransactionsController.') ||
        x.id === 'DashboardController.getRevenue',
    );
    expect(money.length).toBeGreaterThan(0);
    for (const r of money) expect(r.roles).toEqual(['admin']);
  });

  it('keeps inventory money admin-only and stock open to managers', () => {
    const money = ['InventoryController.sales', 'InventoryController.report'];
    for (const id of money) expect(all.find((x) => x.id === id)?.roles).toEqual(['admin']);
    const stock = all.filter((x) => x.id.startsWith('InventoryController.') && !money.includes(x.id));
    expect(stock.length).toBeGreaterThan(0);
    for (const r of stock) expect(r.roles).toEqual(['admin', 'manager']);
  });

  it('keeps the audit log admin-only', () => {
    for (const r of all.filter((x) => x.id.startsWith('AuditLogController.'))) {
      expect(r.roles).toEqual(['admin']);
    }
  });

  it('keeps existing admin-panel endpoints away from trainers and members', () => {
    const portal = /^(TrainerPortal|MemberPortal|Auth)Controller\./;
    for (const r of all.filter((x) => x.roles && !portal.test(x.id))) {
      expect(r.roles).not.toContain('trainer');
      expect(r.roles).not.toContain('member');
    }
  });
});
