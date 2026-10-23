import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { Notification } from '../entities/notification.entity';
import { PushSubscription } from '../entities/push-subscription.entity';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

function notification(id: number, type: string, minutesAgo: number, memberLocalId: number | null = 5): Notification {
  return {
    id,
    eventUid: `uid-${id}`,
    type,
    title: `Title ${id}`,
    body: `Body ${id}`,
    memberLocalId,
    transactionLocalId: null,
    data: {},
    occurredAt: new Date(Date.now() - minutesAgo * 60_000),
    createdAt: new Date(),
  };
}

function setup(subTypes: string[][], ownerRoles: string[] = []) {
  const subs = subTypes.map((types, i) => ({ id: i + 1, adminId: i + 1, types }) as PushSubscription);
  const notifications = {
    manager: {
      find: jest.fn().mockResolvedValue(subs.map((s, i) => ({ id: s.adminId, role: ownerRoles[i] ?? 'admin' }))),
    },
  } as unknown as Repository<any>;
  const push = {
    subscriptionsFor: jest.fn().mockResolvedValue(subs),
    send: jest.fn().mockResolvedValue({ sent: 1, failed: 0 }),
  } as unknown as PushService;
  const members = {
    find: jest.fn().mockResolvedValue([{ id: 501, localId: 5 }]),
  } as unknown as Repository<any>;
  const transactions = {
    find: jest.fn().mockResolvedValue([{ id: 900, localId: 12 }]),
  } as unknown as Repository<any>;
  const service = new NotificationsService(
    config({}),
    notifications,
    {} as Repository<any>,
    members,
    transactions,
    push,
  );
  return { service, push: push as unknown as { send: jest.Mock; subscriptionsFor: jest.Mock } };
}

describe('NotificationsService.pushCreated', () => {
  it('never pushes payments to a manager, even if the device asked for them', async () => {
    const { service, push } = setup([['payment', 'package_changed']], ['manager']);
    await service.pushCreated([notification(1, 'payment', 2), notification(2, 'package_changed', 1, null)]);

    expect(push.send).toHaveBeenCalledTimes(1);
    expect(push.send.mock.calls[0][1]).toMatchObject({ title: 'Title 2', type: 'package_changed' });
  });

  it('pushes each fresh notification oldest first, linking to the member', async () => {
    const { service, push } = setup([['payment', 'package_changed', 'start_date_changed']]);
    // Oldest first, so the newest ends up on top of the device's list.
    await service.pushCreated([notification(2, 'package_changed', 1, null), notification(1, 'payment', 2)]);

    expect(push.send).toHaveBeenCalledTimes(2);
    expect(push.send.mock.calls[0][1]).toMatchObject({ title: 'Title 1', url: '/admin/members/501', tag: 'notification-1' });
    expect(push.send.mock.calls[1][1]).toMatchObject({ title: 'Title 2', url: '/admin/notifications' });
  });

  it('opens the payment record, or the audit entry naming who changed a plan', async () => {
    const { service, push } = setup([['payment', 'package_changed', 'start_date_changed']]);
    const paid = { ...notification(1, 'payment', 2), transactionLocalId: 12 };
    const changed = { ...notification(2, 'start_date_changed', 1), data: { audit_id: 77 } };
    // A payment whose record is not on the website yet still opens the member.
    const unsynced = { ...notification(3, 'payment', 1), transactionLocalId: 13 };
    await service.pushCreated([paid, changed, unsynced]);

    const urls = push.send.mock.calls.map(c => c[1].url);
    expect(urls).toEqual(['/admin/transactions/900', '/admin/audit-log/77', '/admin/members/501']);
  });

  it('sends one summary instead of a burst', async () => {
    const { service, push } = setup([['payment', 'package_changed', 'start_date_changed']]);
    await service.pushCreated([
      notification(1, 'payment', 1),
      notification(2, 'payment', 1),
      notification(3, 'payment', 1),
      notification(4, 'package_changed', 1),
    ]);
    expect(push.send).toHaveBeenCalledTimes(1);
    expect(push.send.mock.calls[0][1]).toMatchObject({
      title: '4 new notifications',
      body: '3 payments, 1 package change',
      url: '/admin/notifications',
    });
  });

  it('does not push old news, and respects what each device wants', async () => {
    const { service, push } = setup([['package_changed']]);
    await service.pushCreated([notification(1, 'payment', 1), notification(2, 'package_changed', 60 * 24)]);
    expect(push.send).not.toHaveBeenCalled();
  });

  it('never throws, so a push failure cannot fail a sync', async () => {
    const { service, push } = setup([['payment']]);
    push.send.mockRejectedValue(new Error('boom'));
    await expect(service.pushCreated([notification(1, 'payment', 1)])).resolves.toBeUndefined();
  });
});

describe('PushService', () => {
  function pushService(env: Record<string, string>) {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x: object) => ({ ...x })),
      save: jest.fn(async (x: object) => x),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      increment: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PushService(config(env), repo as unknown as Repository<PushSubscription>);
    service.onModuleInit();
    return { service, repo };
  }
  const keys = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:a@b.c' };

  it('is off without keys', () => {
    expect(pushService({}).service.getConfig()).toEqual({ enabled: false, publicKey: null });
    expect(pushService(keys).service.getConfig()).toEqual({ enabled: true, publicKey: 'pub' });
  });

  it('only accepts endpoints of known push services', async () => {
    const { service } = pushService(keys);
    await expect(
      service.subscribe(1, { endpoint: 'https://evil.example.com/x', p256dh: 'k', auth: 'a' }, null),
    ).rejects.toThrow('not a known push service');
    await expect(
      service.subscribe(1, { endpoint: 'http://fcm.googleapis.com/fcm/send/x', p256dh: 'k', auth: 'a' }, null),
    ).rejects.toThrow();
    await expect(
      service.subscribe(1, { endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'k', auth: 'a', types: ['payment', 'bogus'] }, 'UA'),
    ).resolves.toMatchObject({ adminId: 1, types: ['payment'] });
    await expect(
      service.subscribe(1, { endpoint: 'https://web.push.apple.com/abc', p256dh: 'k', auth: 'a' }, null),
    ).resolves.toMatchObject({ types: ['payment', 'package_changed', 'start_date_changed'] });
  });

  it('drops a subscription the push service says is gone', async () => {
    const { service, repo } = pushService(keys);
    (webpush.sendNotification as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }));
    const result = await service.send(
      [{ id: 7, endpoint: 'https://fcm.googleapis.com/x', p256dh: 'k', auth: 'a', failureCount: 0 } as PushSubscription],
      { title: 't', body: 'b', url: '/', tag: 't', type: 'test', timestamp: 0 },
    );
    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(repo.delete).toHaveBeenCalledWith(7);
  });
});

describe('NotificationsService.createFromEvents', () => {
  function manager(failUids: string[], failWholeBatch: boolean) {
    const queries: string[] = [];
    const insertBuilder = (rows: { eventUid: string }[]) => ({
      orIgnore: () => ({
        returning: () => ({
          execute: async () => {
            if ((failWholeBatch && rows.length > 1) || rows.some(r => failUids.includes(r.eventUid))) {
              throw new Error('invalid byte sequence');
            }
            return { raw: rows.map((_, i) => ({ id: i + 1 })) };
          },
        }),
      }),
    });
    return {
      queries,
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
      }),
      createQueryBuilder: () => ({
        insert: () => ({ into: () => ({ values: (rows: { eventUid: string }[]) => insertBuilder(rows) }) }),
      }),
      find: jest.fn().mockResolvedValue([]),
    };
  }
  const service = new NotificationsService(
    config({}),
    {} as Repository<any>,
    {} as Repository<any>,
    {} as Repository<any>,
    {} as Repository<any>,
    {} as PushService,
  );
  const event = (uid: string, type = 'payment') => ({ uid, type, occurredAt: '2026-10-08T09:00:00Z', data: {} });

  it('stores a batch in one insert under a savepoint', async () => {
    const m = manager([], false);
    const result = await service.createFromEvents([event('a'), event('b'), event('z', 'future')], m as never);
    expect(result).toMatchObject({ acknowledged: ['a', 'b', 'z'], failed: [] });
    expect(m.queries).toEqual(['SAVEPOINT notification_events', 'RELEASE SAVEPOINT notification_events']);
  });

  it('isolates a row that cannot be stored instead of failing the transaction', async () => {
    const m = manager(['b'], true);
    const result = await service.createFromEvents([event('a'), event('b'), event('c')], m as never);
    expect(result.acknowledged).toEqual(['a', 'c']);
    expect(result.failed).toEqual(['b']);
    expect(m.queries).toContain('ROLLBACK TO SAVEPOINT notification_events');
    expect(m.queries.filter(q => q === 'ROLLBACK TO SAVEPOINT notification_event')).toHaveLength(1);
  });
});
