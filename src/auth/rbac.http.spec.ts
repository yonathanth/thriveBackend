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

const SECRET = 'test-secret';

/**
 * Real controllers, guards and JWT strategy over an in-memory account table: checks
 * what each role can actually reach over HTTP.
 */
describe('RBAC over HTTP', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const accounts: Partial<Admin>[] = [];

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
      ],
      providers: [
        JwtStrategy,
        AuthService,
        AccountsService,
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

  it('gives each portal only to its own role', async () => {
    await get('/api/trainer/members', 3).expect(200);
    await get('/api/trainer/members', 4).expect(403);
    await get('/api/trainer/members', 1).expect(403);
    await get('/api/me/membership', 4).expect(200);
    await get('/api/me/membership', 3).expect(403);
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
});
