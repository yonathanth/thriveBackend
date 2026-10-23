import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { Admin } from '../entities/admin.entity';
import { AccountAudit } from '../entities/account-audit.entity';
import { WebAuditService } from '../web-audit/web-audit.service';
import { WebAudit } from '../entities/web-audit.entity';

describe('AuthService sign-in audit', () => {
  async function setup(role: string) {
    const account = {
      id: 7,
      name: 'Sara',
      role,
      phone: '251911000001',
      password: await bcrypt.hash('secret12', 4),
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      tokenVersion: 0,
      mustChangePassword: false,
    } as unknown as Admin;
    const accounts = {
      findOne: jest.fn().mockResolvedValue(account),
      save: jest.fn(async (a: Admin) => a),
    } as unknown as Repository<Admin>;
    const record = jest.fn();
    const webAudit = new WebAuditService({ insert: record } as unknown as Repository<WebAudit>);
    const service = new AuthService(
      accounts,
      { save: jest.fn(), create: jest.fn((x: unknown) => x), insert: jest.fn() } as unknown as Repository<AccountAudit>,
      { sign: () => 'token' } as unknown as JwtService,
      webAudit,
    );
    return { service, record };
  }

  it('records staff sign-ins and wrong passwords', async () => {
    const { service, record } = await setup('manager');
    await service.login({ phone: '0911000001', password: 'secret12' });
    await expect(service.login({ phone: '0911000001', password: 'nope' })).rejects.toThrow();
    expect(record.mock.calls.map((c) => [c[0].action, c[0].summary])).toEqual([
      ['signed_in', 'Sara signed in'],
      ['failed', 'Failed sign-in for Sara: wrong password'],
    ]);
  });

  it('never records members', async () => {
    const { service, record } = await setup('member');
    await service.login({ phone: '0911000001', password: 'secret12' });
    expect(record).not.toHaveBeenCalled();
  });
});
