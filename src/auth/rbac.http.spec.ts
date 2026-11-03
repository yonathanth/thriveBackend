/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await -- in-memory repository fakes */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { JwtStrategy } from './jwt.strategy';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Admin } from '../entities/admin.entity';
import { AccountAudit } from '../entities/account-audit.entity';
import { AccountLinkConflict } from '../entities/account-link-conflict.entity';
import { MembersController } from '../members/members.controller';
import { MembersService } from '../members/members.service';
import { AuditLogController } from '../records/audit-log.controller';
import { AuditLogService } from '../records/audit-log.service';
import { TrainerPortalController } from '../portal/trainer-portal.controller';
import { MemberPortalController } from '../portal/member-portal.controller';
import { PortalService } from '../portal/portal.service';
import { AccountsController } from '../accounts/accounts.controller';
import { AccountsService } from '../accounts/accounts.service';
import { AccountProvisioningService } from '../accounts/account-provisioning.service';
import { AccountPermission } from '../entities/account-permission.entity';
import { AccountPermissionsController } from '../accounts/account-permissions.controller';
import { AccountPermissionsService } from '../accounts/account-permissions.service';
import { DashboardController } from '../dashboard/dashboard.controller';
import { DashboardService } from '../dashboard/dashboard.service';
import { OnlinePaymentsController } from '../online-payments/online-payments.controller';
import { OnlinePaymentsService } from '../online-payments/online-payments.service';

const SECRET = 'test-secret';

/**
 * Real controllers, guards and JWT strategy over an in-memory account table: checks
 * what each role can actually reach over HTTP.
 */
describe('RBAC over HTTP', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const accounts: Partial<Admin>[] = [];
  let overrides: Partial<AccountPermission>[] = [];
  let nextOverrideId = 1;

  const overrideRepo = {
    find: async ({ where }: { where: { accountId: number } }) =>
      overrides.filter((o) => o.accountId === where.accountId),
    insert: async (o: Partial<AccountPermission>) => {
      overrides.push({ ...o, id: nextOverrideId++ });
      return {};
    },
    update: async ({ id }: { id: number }, patch: Partial<AccountPermission>) => {
      overrides = overrides.map((o) => (o.id === id ? { ...o, ...patch } : o));
      return {};
    },
    delete: async ({ id }: { id: number }) => {
      overrides = overrides.filter((o) => o.id !== id);
      return {};
    },
  };

  const base = {
    email: null,
    isActive: true,
    mustChangePassword: false,
    tokenVersion: 0,
    failedLoginAttempts: 0,
    lockedUntil: null,
    staffLocalId: null,
    memberLocalId: null,
    phone: null,
  };

  const accountRepo = {
    findOne: async ({ where }: { where: Record<string, unknown> }) =>
      accounts.find((a) =>
        Object.entries(where).every(([k, v]) => (a as any)[k] === v),
      ) ?? null,
    save: async (a: Partial<Admin>) => a,
    count: async () =>
      accounts.filter((a) => a.role === 'admin' && a.isActive).length,
  };

  const token = (id: number, tv = 0) =>
    `Bearer ${jwt.sign({ sub: id, role: 'x', tv })}`;

  beforeAll(async () => {
    const password = await bcrypt.hash('0000', 4);
    accounts.push(
      {
        ...base,
        id: 1,
        role: 'admin',
        name: 'Admin',
        email: 'admin@gym.com',
        password,
      },
      {
        ...base,
        id: 2,
        role: 'manager',
        name: 'Manager',
        staffLocalId: 20,
        password,
      },
      {
        ...base,
        id: 3,
        role: 'trainer',
        name: 'Trainer',
        staffLocalId: 30,
        password,
      },
      {
        ...base,
        id: 4,
        role: 'member',
        name: 'Member',
        memberLocalId: 40,
        phone: '+251911000004',
        password,
      },
      {
        ...base,
        id: 5,
        role: 'member',
        name: 'New member',
        memberLocalId: 50,
        phone: '+251911000005',
        mustChangePassword: true,
        password,
      },
      {
        ...base,
        id: 6,
        role: 'member',
        name: 'Reset member',
        memberLocalId: 60,
        tokenVersion: 2,
        password,
      },
    );

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: SECRET })],
      controllers: [
        AuthController,
        MembersController,
        AuditLogController,
        TrainerPortalController,
        MemberPortalController,
        AccountsController,
        AccountPermissionsController,
        DashboardController,
        OnlinePaymentsController,
      ],
      providers: [
        JwtStrategy,
        AuthService,
        AccountsService,
        AccountPermissionsService,
        { provide: getRepositoryToken(AccountPermission), useValue: overrideRepo },
        {
          provide: DashboardService,
          useValue: {
            getOverview: async () => ({
              totalMembers: 120,
              activeMembers: 80,
              totalServices: 5,
              attendanceToday: 30,
              totalRevenue: 99000,
              revenueThisMonth: 9000,
              newMembersThisMonth: 7,
              averageDailyAttendance: 25,
            }),
            getRevenue: async () => ({ thisMonth: 9000 }),
          },
        },
        {
          provide: OnlinePaymentsService,
          useValue: { list: async () => ({ data: [] }) },
        },
        { provide: ConfigService, useValue: { get: () => SECRET } },
        { provide: getRepositoryToken(Admin), useValue: accountRepo },
        {
          provide: getRepositoryToken(AccountAudit),
          useValue: {
            insert: async () => ({}),
            save: async (x: unknown) => x,
            create: (x: unknown) => x,
          },
        },
        { provide: getRepositoryToken(AccountLinkConflict), useValue: {} },
        { provide: AccountProvisioningService, useValue: {} },
        {
          provide: MembersService,
          useValue: { findAll: async () => ({ data: [] }) },
        },
        {
          provide: AuditLogService,
          useValue: { list: async () => ({ data: [] }) },
        },
        {
          provide: PortalService,
          useValue: {
            assignedMembers: async () => ({ data: [] }),
            myMembership: async () => ({ ok: true }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string, id?: number) => {
    const req = request(app.getHttpServer()).get(path);
    return id ? req.set('Authorization', token(id)) : req;
  };

  it('requires a login for admin endpoints', async () => {
    await get('/api/members').expect(401);
  });

  it('lets admins and managers use the admin panel API', async () => {
    await get('/api/members', 1).expect(200);
    await get('/api/members', 2).expect(200);
  });

  it('keeps trainers and members out of the admin panel API', async () => {
    await get('/api/members', 3).expect(403);
    await get('/api/members', 4).expect(403);
  });

  it('keeps the audit log for admins only', async () => {
    await get('/api/audit-log', 1).expect(200);
    await get('/api/audit-log', 2).expect(403);
  });

  it.each([
    ['admin', 1, 200, 403, 403],
    ['manager', 2, 200, 403, 403],
    ['trainer', 3, 403, 200, 403],
    ['member', 4, 403, 403, 200],
  ] as const)(
    'enforces portal boundaries for %s',
    async (_role, id, panelStatus, trainerStatus, memberStatus) => {
      await get('/api/members', id).expect(panelStatus);
      await get('/api/trainer/members', id).expect(trainerStatus);
      await get('/api/me/membership', id).expect(memberStatus);
    },
  );

  it('requires sign-in for member and trainer data', async () => {
    await get('/api/me/membership').expect(401);
    await get('/api/trainer/members').expect(401);
  });

  it('allows only profile and change-password until a temporary password is replaced', async () => {
    await get('/api/me/membership', 5).expect(403);
    const profile = await get('/api/auth/profile', 5).expect(200);
    expect(profile.body.mustChangePassword).toBe(true);
  });

  it('rejects tokens issued before a password reset', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/profile')
      .set('Authorization', token(6, 0))
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/auth/profile')
      .set('Authorization', token(6, 2))
      .expect(200);
  });

  it('signs in by phone in any format, with the temporary password', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ phone: '0911 000 005', password: '0000' })
      .expect(200);
    expect(res.body.user.mustChangePassword).toBe(true);
    expect(res.body.user.role).toBe('member');
  });

  it('still signs admins in by email', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ADMIN@gym.com', password: '0000' })
      .expect(200);
  });

  it('hides admin and manager accounts from managers, and forbids them creating admins', async () => {
    await get('/api/accounts/1', 2).expect(404);
    await request(app.getHttpServer())
      .post('/api/accounts/1/reset-password')
      .set('Authorization', token(2))
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/accounts/admins')
      .set('Authorization', token(2))
      .send({ name: 'X', phone: '0911000099', password: 'secret12' })
      .expect(403);
  });

  it('lets a manager reset a member, and nobody reset their own password', async () => {
    await request(app.getHttpServer())
      .post('/api/accounts/4/reset-password')
      .set('Authorization', token(2))
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/accounts/1/reset-password')
      .set('Authorization', token(1))
      .expect(403);
  });
  describe('permissions', () => {
    const put = (path: string, id: number, body: object) =>
      request(app.getHttpServer())
        .put(path)
        .set('Authorization', token(id))
        .send(body);

    afterEach(() => {
      overrides = [];
    });

    it('returns the effective permissions with the profile', async () => {
      const admin = await get('/api/auth/profile', 1).expect(200);
      expect(admin.body.permissions).toContain('finance.view');
      const manager = await get('/api/auth/profile', 2).expect(200);
      expect(manager.body.permissions).toContain('members.view');
      expect(manager.body.permissions).not.toContain('finance.view');
      // Account 5: account 4's password was reset by an earlier test.
      const member = await get('/api/auth/profile', 5).expect(200);
      expect(member.body.permissions).toEqual([]);
    });

    it('keeps business figures out of the dashboard for managers', async () => {
      const admin = await get('/api/dashboard/stats', 1).expect(200);
      expect(admin.body.totalRevenue).toBe(99000);
      expect(admin.body.totalMembers).toBe(120);
      const manager = await get('/api/dashboard/stats', 2).expect(200);
      expect(manager.body.activeMembers).toBeNull();
      expect(admin.body.activeMembers).toBe(80);
      expect(manager.body.attendanceToday).toBeDefined();
      expect(manager.body.totalRevenue).toBeNull();
      expect(manager.body.revenueThisMonth).toBeNull();
      expect(manager.body.totalMembers).toBeNull();
      expect(manager.body.newMembersThisMonth).toBeNull();
      await get('/api/dashboard/revenue', 2).expect(403);
    });

    it('keeps online payment amounts from managers unless granted', async () => {
      await get('/api/online-payments', 1).expect(200);
      await get('/api/online-payments', 2).expect(403);
      await put('/api/accounts/2/permissions', 1, {
        overrides: { 'online_payments.view': 'grant' },
      }).expect(200);
      // Read per request: no new sign-in needed.
      await get('/api/online-payments', 2).expect(200);
    });

    it('applies a deny on the very next request', async () => {
      await get('/api/members', 2).expect(200);
      await put('/api/accounts/2/permissions', 1, {
        overrides: { 'members.view': 'deny' },
      }).expect(200);
      await get('/api/members', 2).expect(403);
      await put('/api/accounts/2/permissions', 1, {
        overrides: { 'members.view': null },
      }).expect(200);
      await get('/api/members', 2).expect(200);
    });

    it('lets only admins manage permissions', async () => {
      await get('/api/accounts/3/permissions', 2).expect(403);
      await put('/api/accounts/3/permissions', 2, { overrides: {} }).expect(403);
      await get('/api/permissions/catalog', 2).expect(403);
      await get('/api/permissions/catalog', 1).expect(200);
    });

    it('refuses admin-only keys, admin and member targets, and unknown keys', async () => {
      await put('/api/accounts/2/permissions', 1, {
        overrides: { 'audit.view': 'grant' },
      }).expect(400);
      await put('/api/accounts/2/permissions', 1, {
        overrides: { 'nope.view': 'grant' },
      }).expect(400);
      await put('/api/accounts/3/permissions', 1, {
        overrides: { 'finance.view': 'grant' },
      }).expect(400);
      await get('/api/accounts/1/permissions', 1).expect(400);
      await get('/api/accounts/4/permissions', 1).expect(400);
      expect(overrides).toHaveLength(0);
    });

    it('shows role default, override and effective per key', async () => {
      await put('/api/accounts/2/permissions', 1, {
        overrides: { 'sms.bulk': 'deny' },
      }).expect(200);
      const res = await get('/api/accounts/2/permissions', 1).expect(200);
      const row = res.body.permissions.find((p: any) => p.key === 'sms.bulk');
      expect(row).toMatchObject({ roleDefault: true, override: 'deny', effective: false, grantable: true });
      const audit = res.body.permissions.find((p: any) => p.key === 'audit.view');
      expect(audit).toMatchObject({ adminOnly: true, grantable: false, effective: false });
    });
  });
});
