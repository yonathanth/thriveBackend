import { DataSource, In, Repository } from 'typeorm';
import { SyncService } from '../sync/sync.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SyncRecord } from '../entities/sync-record.entity';
import { StockCount } from '../entities/stock-count.entity';
import { StockMovement } from '../entities/stock-movement.entity';
import { InventoryItem } from '../entities/inventory-item.entity';
import { desktopDate, mapInventoryRow } from './inventory-sync';

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
    query: jest.fn().mockResolvedValue([]),
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
    repo,
    repo,
    repo,
    repo,
    repo,
    repo,
    repo,
    repo,
    dataSource,
    notifications as unknown as NotificationsService,
  );
  return { service, queryBuilder, manager };
}

const base = {
  timestamp: '2026-10-22T09:00:00.000Z',
  services: [],
  members: [],
  attendance: [],
  transactions: [],
  healthMetrics: [],
};

const count = {
  id: 7,
  item_id: 1,
  holder_user_id: 3,
  expected_qty_base: 8,
  remaining_qty_base: 5,
  sold_qty_base: 3,
  unit_price: 25,
  pack_price: 90,
  units_per_pack: 4,
  amount: 75,
  payment_method_id: 1,
  transaction_id: 40,
  reported_by: 3,
  created_at: '2026-10-22 08:30:00',
  voided_at: null,
};

describe('inventory sync', () => {
  it('reads SQLite timestamps as UTC', () => {
    expect(desktopDate('2026-10-22 08:30:00')?.toISOString()).toBe(
      '2026-10-22T08:30:00.000Z',
    );
    expect(desktopDate('2026-10-22T08:30:00+03:00')?.toISOString()).toBe(
      '2026-10-22T05:30:00.000Z',
    );
    expect(desktopDate(null)).toBeNull();
    expect(desktopDate('nonsense')).toBeNull();
  });

  it('maps a stock report and refuses one without its holder', () => {
    expect(mapInventoryRow('stock_count', count)).toMatchObject({
      itemLocalId: 1,
      holderUserLocalId: 3,
      soldQtyBase: 3,
      amount: 75,
      transactionLocalId: 40,
      voidedAt: null,
    });
    expect(
      mapInventoryRow('stock_count', { ...count, holder_user_id: null }),
    ).toBeNull();
  });

  it('files inventory in its own tables, keyed by desktop id, and links the income', async () => {
    const { service, queryBuilder, manager } = setup();
    const result = await service.syncData({
      ...base,
      records: [
        {
          entity: 'inventory_item',
          id: 1,
          data: {
            id: 1,
            kind: 'sellable',
            name: 'Water',
            unit_name: 'bottle',
            is_active: 1,
          },
        },
        { entity: 'stock_count', id: 7, data: count },
        {
          entity: 'stock_movement',
          id: 30,
          data: {
            id: 30,
            item_id: 1,
            type: 'sale',
            qty_base: 3,
            from_bucket: 'holder',
            to_bucket: 'sold',
          },
        },
        // Sent twice in one batch: stored once.
        { entity: 'stock_count', id: 7, data: count },
      ],
    });

    expect(queryBuilder.into).toHaveBeenCalledWith(InventoryItem);
    expect(queryBuilder.into).toHaveBeenCalledWith(StockCount);
    expect(queryBuilder.into).toHaveBeenCalledWith(StockMovement);
    expect(queryBuilder.into).not.toHaveBeenCalledWith(SyncRecord);
    expect(queryBuilder.values).toHaveBeenCalledWith([
      expect.objectContaining({ localId: 7, soldQtyBase: 3, deletedAt: null }),
    ]);
    expect(queryBuilder.orUpdate).toHaveBeenCalledWith(
      expect.arrayContaining(['soldQtyBase', 'voidedAt']),
      ['localId'],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('"stockCountLocalId"'),
    );
    expect(result).toMatchObject({
      success: true,
      results: {
        records: {
          inventory_item: { successful: [1], failed: [] },
          stock_count: { successful: [7], failed: [] },
          stock_movement: { successful: [30], failed: [] },
        },
      },
    });
  });

  it('reports an incomplete row failed without rolling the batch back', async () => {
    const { service } = setup();
    const result = await service.syncData({
      ...base,
      records: [
        {
          entity: 'stock_count',
          id: 8,
          data: { ...count, id: 8, item_id: null },
        },
        { entity: 'additional_service', id: 1, data: { id: 1, name: 'Sauna' } },
      ],
    });
    expect(result.results?.records).toMatchObject({
      stock_count: { successful: [], failed: [8] },
      additional_service: { successful: [1], failed: [] },
    });
    expect(result.recordsSynced).toBe(1);
  });

  it('soft-deletes inventory rows in their own table', async () => {
    const { service, manager } = setup();
    await service.syncData({
      ...base,
      deletions: [{ queueId: 4, entity: 'inventory_item', id: 2 }],
    });
    expect(manager.softDelete).toHaveBeenCalledWith(InventoryItem, {
      localId: In([2]),
    });
  });
});
