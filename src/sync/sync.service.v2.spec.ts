import { DataSource, In, Repository } from 'typeorm';
import { SyncService } from './sync.service';
import { Member } from '../entities/member.entity';
import { Attendance } from '../entities/attendance.entity';
import { HealthMetric } from '../entities/health-metric.entity';
import { SyncRecord } from '../entities/sync-record.entity';
import { PotentialCustomer } from '../entities/potential-customer.entity';
import { NotificationsService } from '../notifications/notifications.service';

function setup() {
  const queryBuilder = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orUpdate: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };
  const manager = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    softDelete: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    find: jest.fn().mockResolvedValue([]),
  };
  const queryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager,
  };
  const dataSource = {
    createQueryRunner: jest.fn().mockReturnValue(queryRunner),
  } as unknown as DataSource;
  const repo = {} as Repository<any>;
  const notifications = {
    createFromEvents: jest.fn(),
    pushCreated: jest.fn().mockResolvedValue(undefined),
  };
  const service = new SyncService(
    repo, repo, repo, repo, repo, repo, repo, repo, dataSource,
    notifications as unknown as NotificationsService,
  );
  return { service, queryBuilder, manager, queryRunner, notifications };
}

const base = {
  timestamp: '2026-10-08T09:03:42.527Z',
  services: [],
  members: [],
  attendance: [],
  transactions: [],
  healthMetrics: [],
};

describe('SyncService (protocol 2)', () => {
  it('stores records per desktop table and reports them by table', async () => {
    const { service, queryBuilder } = setup();

    const result = await service.syncData({
      ...base,
      records: [
        { entity: 'additional_service', id: 1, data: { id: 1, name: 'Sauna' } },
        { entity: 'member_additional_subscription', id: 5, data: { id: 5, member_id: 9 } },
      ],
    });

    expect(queryBuilder.into).toHaveBeenCalledWith(SyncRecord);
    expect(queryBuilder.values).toHaveBeenCalledWith([
      expect.objectContaining({ entity: 'member_additional_subscription', localId: 5, memberLocalId: 9 }),
    ]);
    expect(queryBuilder.orUpdate).toHaveBeenCalledWith(
      ['memberLocalId', 'data', 'updatedAt', 'lastSyncedAt', 'deletedAt'],
      ['entity', 'localId'],
    );
    expect(result).toMatchObject({
      success: true,
      recordsSynced: 2,
      results: {
        records: {
          additional_service: { successful: [1], failed: [] },
          member_additional_subscription: { successful: [5], failed: [] },
        },
      },
    });
  });

  it('refuses a record for a table that has its own field', async () => {
    const { service } = setup();
    const result = await service.syncData({
      ...base,
      records: [{ entity: 'member', id: 1, data: {} }],
    });
    expect(result.success).toBe(false);
  });

  it('soft-deletes a member with the rows that belong to them', async () => {
    const { service, manager } = setup();

    const result = await service.syncData({
      ...base,
      deletions: [
        { queueId: 10, entity: 'member', id: 9 },
        { queueId: 11, entity: 'discount', id: 2 },
      ],
    });

    expect(manager.softDelete).toHaveBeenCalledWith(Member, { localId: In([9]) });
    expect(manager.softDelete).toHaveBeenCalledWith(Attendance, { memberLocalId: In([9]) });
    expect(manager.softDelete).toHaveBeenCalledWith(HealthMetric, { memberLocalId: In([9]) });
    expect(manager.softDelete).toHaveBeenCalledWith(SyncRecord, { memberLocalId: In([9]) });
    expect(manager.softDelete).toHaveBeenCalledWith(SyncRecord, { entity: 'discount', localId: In([2]) });
    expect(result).toMatchObject({
      success: true,
      deletionsApplied: 2,
      results: { deletions: { successful: [10, 11], failed: [] } },
    });
  });

  it('turns a lead deleted on the desktop into an ignored one', async () => {
    const { service, manager } = setup();

    await service.syncData({
      ...base,
      deletions: [{ queueId: 3, entity: 'potential_customer', id: 77 }],
    });

    expect(manager.update).toHaveBeenCalledWith(
      PotentialCustomer,
      { id: In([77]), status: 'pending' },
      { status: 'ignored' },
    );
    expect(manager.softDelete).not.toHaveBeenCalled();
  });

  it('links a converted lead to the member it became', async () => {
    const { service, manager } = setup();
    manager.find.mockResolvedValueOnce([{ id: 501, localId: 9 }]);

    const result = await service.syncData({
      ...base,
      prospectStatuses: [{ cloudId: 7, status: 'converted', convertedToMemberId: 9 }],
    });

    expect(manager.update).toHaveBeenCalledWith(
      PotentialCustomer,
      { id: 7 },
      expect.objectContaining({ status: 'converted', convertedToMemberId: 501 }),
    );
    expect(result.results?.prospectStatuses).toEqual({ successful: [7], failed: [] });
  });

  it('stores events as notifications and pushes them once committed', async () => {
    const { service, notifications, queryRunner } = setup();
    const created = [{ id: 1 }];
    notifications.createFromEvents.mockResolvedValue({ acknowledged: ['a1', 'b2'], failed: [], created });
    const events = [
      { uid: 'a1', type: 'payment', memberId: 9, occurredAt: '2026-10-08T09:00:00Z', data: { amount: 10 } },
      { uid: 'b2', type: 'future_kind', occurredAt: '2026-10-08T09:00:00Z', data: {} },
    ];

    const result = await service.syncData({ ...base, events });

    expect(notifications.createFromEvents).toHaveBeenCalledWith(events, queryRunner.manager);
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(notifications.pushCreated).toHaveBeenCalledWith(created);
    expect(result).toMatchObject({ success: true, results: { events: { successful: ['a1', 'b2'], failed: [] } } });
  });

  it('reports events it could not store, and pushes nothing', async () => {
    const { service, notifications } = setup();
    notifications.createFromEvents.mockRejectedValue(new Error('db down'));

    const result = await service.syncData({
      ...base,
      events: [{ uid: 'a1', type: 'payment', occurredAt: '2026-10-08T09:00:00Z', data: {} }],
    });

    expect(result.success).toBe(false);
    expect(result.results?.events).toEqual({ successful: [], failed: ['a1'] });
    expect(notifications.pushCreated).not.toHaveBeenCalled();
  });

  it('keeps syncing when a notification cannot be stored', async () => {
    const { service, notifications, queryRunner } = setup();
    notifications.createFromEvents.mockResolvedValue({ acknowledged: ['a1'], failed: ['b2'], created: [] });

    const result = await service.syncData({
      ...base,
      events: [
        { uid: 'a1', type: 'payment', occurredAt: '2026-10-08T09:00:00Z', data: {} },
        { uid: 'b2', type: 'payment', occurredAt: '2026-10-08T09:00:00Z', data: {} },
      ],
    });

    expect(result.success).toBe(true);
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(result.results?.events).toEqual({ successful: ['a1'], failed: ['b2'] });
  });
});

