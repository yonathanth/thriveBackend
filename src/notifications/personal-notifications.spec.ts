import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { hiddenNotificationTypes, seesDesk, typesForRole } from './notification-access';
import { memberEventText } from './notification-text';
import { PersonalNotificationsService } from './personal-notifications.service';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { WebAuditService } from '../web-audit/web-audit.service';

const opts = { timeZone: 'Africa/Addis_Ababa', currency: 'ETB' };

describe('who sees what', () => {
  it('gives each role only its own kinds of notification', () => {
    expect(seesDesk('admin')).toBe(true);
    expect(seesDesk('manager')).toBe(true);
    expect(seesDesk('trainer')).toBe(false);
    expect(seesDesk('member')).toBe(false);
    expect(typesForRole('manager')).not.toContain('payment');
    expect(typesForRole('trainer')).toEqual(['message', 'client_digest']);
    expect(typesForRole('member')).toContain('membership_expiring');
    expect(typesForRole('member')).not.toContain('payment');
    expect(hiddenNotificationTypes('member')).toContain('package_changed');
    expect(typesForRole('nobody')).toEqual([]);
  });
});

describe('memberEventText', () => {
  it('words payments and plan changes to the member, without staff names', () => {
    const paid = memberEventText('payment', { amount: 1500, service_name: 'Monthly', actor_username: 'abel' }, opts);
    expect(paid).toEqual({ type: 'payment_received', title: 'Payment received', body: 'Thank you! We received ETB 1,500 for Monthly.' });
    const changed = memberEventText(
      'package_changed',
      { old_service_name: 'Monthly', new_service_name: '3 Months', new_start_date: '2026-10-01', new_end_date: '2026-12-30' },
      opts,
    );
    expect(changed?.type).toBe('plan_changed');
    expect(changed?.body).toBe("You're now on 3 Months. It now runs 1 Oct 2026 to 30 Dec 2026.");
    const renewed = memberEventText(
      'start_date_changed',
      {
        old_start_date: '2026-09-01',
        old_end_date: '2026-10-01',
        new_start_date: '2026-10-01',
        new_end_date: '2026-10-31',
        new_service_name: 'Monthly',
      },
      opts,
    );
    expect(renewed?.title).toBe('Membership renewed');
    expect(renewed?.body).toBe('Your Monthly membership now runs 1 Oct 2026 to 31 Oct 2026.');
  });
});

describe('PersonalNotificationsService.sendMessage', () => {
  function setup(accounts: { id: number; role: string }[]) {
    const inserted: Record<string, unknown>[] = [];
    const qb: Record<string, unknown> = {};
    Object.assign(qb, {
      insert: () => qb,
      into: () => qb,
      values: (v: Record<string, unknown>[]) => {
        inserted.push(...v);
        return qb;
      },
      orIgnore: () => qb,
      returning: () => qb,
      execute: async () => ({ raw: inserted.map((_, i) => ({ id: i + 1 })) }),
    });
    const notifications = {
      createQueryBuilder: () => qb,
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const accountRepo = { find: jest.fn().mockResolvedValue(accounts) } as unknown as Repository<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const record = jest.fn();
    const service = new PersonalNotificationsService(
      { get: () => undefined } as unknown as ConfigService,
      notifications,
      accountRepo,
      {} as DataSource,
      { subscriptionsOf: jest.fn().mockResolvedValue([]), send: jest.fn() } as unknown as PushService,
      {} as NotificationsService,
      { record } as unknown as WebAuditService,
    );
    return { service, inserted, record };
  }

  it('creates one message per recipient, linking into their part of the site, and records who sent it', async () => {
    const { service, inserted, record } = setup([
      { id: 3, role: 'trainer' },
      { id: 4, role: 'manager' },
    ]);
    const actor = { id: 1, name: 'Sara', role: 'manager' };
    const result = await service.sendMessage(actor, { title: ' Closed Monday ', body: 'Holiday', audience: 'all_staff' });

    expect(result).toEqual({ recipients: 2 });
    expect(inserted.map((r) => [r.recipientId, r.type, r.title, (r.data as { url: string }).url])).toEqual([
      [3, 'message', 'Closed Monday', '/trainer/notifications'],
      [4, 'message', 'Closed Monday', '/admin/notifications'],
    ]);
    expect(record).toHaveBeenCalledWith(actor, 'notifications', 'send', expect.stringContaining('to 2 people'), expect.any(Object));
  });

  it('refuses an empty message or audience', async () => {
    const { service } = setup([]);
    const actor = { id: 1, name: 'Sara', role: 'admin' };
    await expect(service.sendMessage(actor, { title: 'x', body: ' ', audience: 'everyone' })).rejects.toThrow('Write a title');
    await expect(service.sendMessage(actor, { title: 'x', body: 'y', audience: 'trainers' })).rejects.toThrow('Nobody');
  });
});
