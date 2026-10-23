import { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import { RecordSyncDto } from '../sync/dto/record-sync.dto';
import { SyncResultDto } from '../sync/dto/sync-response.dto';
import { InventoryItem } from '../entities/inventory-item.entity';
import { StockBalance } from '../entities/stock-balance.entity';
import { StockAssignment } from '../entities/stock-assignment.entity';
import { StockCount } from '../entities/stock-count.entity';
import { StockMovement } from '../entities/stock-movement.entity';

/**
 * Inventory travels as generic records (protocol 4) but is filed in its own tables,
 * because the reports add it up. Keyed by desktop table name.
 */
export const INVENTORY_ENTITIES: Record<string, EntityTarget<ObjectLiteral>> = {
  inventory_item: InventoryItem,
  stock_balance: StockBalance,
  stock_assignment: StockAssignment,
  stock_count: StockCount,
  stock_movement: StockMovement,
};

type Row = Record<string, unknown>;

const int = (v: unknown): number | null =>
  typeof v === 'number' ? Math.trunc(v) : null;
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const str = (v: unknown): string | null =>
  typeof v === 'string' && v !== '' ? v : null;

/**
 * A desktop timestamp. SQLite's CURRENT_TIMESTAMP is UTC without saying so
 * ("2026-10-22 08:30:00"); read bare, JavaScript would take it as local time.
 */
export function desktopDate(v: unknown): Date | null {
  if (typeof v !== 'string' || v === '') return null;
  const bare = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v);
  const d = new Date(bare ? `${v.replace(' ', 'T')}Z` : v);
  return isNaN(d.getTime()) ? null : d;
}

/** Desktop row (snake_case, as sent) to entity values. Bookkeeping is added by the caller. */
const MAPPERS: Record<string, (d: Row) => Row> = {
  inventory_item: (d) => ({
    kind: str(d.kind) ?? 'sellable',
    name: str(d.name) ?? '',
    sku: str(d.sku),
    unitName: str(d.unit_name) ?? 'unit',
    packName: str(d.pack_name),
    unitsPerPack: int(d.units_per_pack),
    unitPrice: num(d.unit_price) ?? 0,
    packPrice: num(d.pack_price),
    assetLocation: str(d.asset_location),
    assetCondition: str(d.asset_condition),
    assetSerial: str(d.asset_serial),
    notes: str(d.notes),
    isActive: d.is_active !== 0 && d.is_active !== false,
    desktopCreatedAt: desktopDate(d.created_at),
    desktopUpdatedAt: desktopDate(d.updated_at),
  }),
  stock_balance: (d) => ({
    itemLocalId: int(d.item_id),
    holderUserLocalId: int(d.holder_user_id),
    qtyBase: int(d.qty_base) ?? 0,
    desktopUpdatedAt: desktopDate(d.updated_at),
  }),
  stock_assignment: (d) => ({
    itemLocalId: int(d.item_id),
    kind: str(d.kind) ?? 'assign',
    qtyBase: int(d.qty_base) ?? 0,
    enteredPacks: int(d.entered_packs) ?? 0,
    enteredUnits: int(d.entered_units) ?? 0,
    fromUserLocalId: int(d.from_user_id),
    toUserLocalId: int(d.to_user_id),
    createdByLocalId: int(d.created_by),
    status: str(d.status) ?? 'pending',
    note: str(d.note),
    desktopCreatedAt: desktopDate(d.created_at),
    respondedAt: desktopDate(d.responded_at),
    respondedByLocalId: int(d.responded_by),
  }),
  stock_count: (d) => ({
    itemLocalId: int(d.item_id),
    holderUserLocalId: int(d.holder_user_id),
    expectedQtyBase: int(d.expected_qty_base) ?? 0,
    remainingQtyBase: int(d.remaining_qty_base) ?? 0,
    soldQtyBase: int(d.sold_qty_base) ?? 0,
    unitPrice: num(d.unit_price) ?? 0,
    packPrice: num(d.pack_price),
    unitsPerPack: int(d.units_per_pack),
    amount: num(d.amount) ?? 0,
    paymentMethodLocalId: int(d.payment_method_id),
    transactionLocalId: int(d.transaction_id),
    reportedByLocalId: int(d.reported_by),
    desktopCreatedAt: desktopDate(d.created_at),
    voidedAt: desktopDate(d.voided_at),
    voidedByLocalId: int(d.voided_by),
    voidReason: str(d.void_reason),
    voidTransactionLocalId: int(d.void_transaction_id),
  }),
  stock_movement: (d) => ({
    itemLocalId: int(d.item_id),
    type: str(d.type) ?? '',
    qtyBase: int(d.qty_base) ?? 0,
    fromBucket: str(d.from_bucket) ?? '',
    fromUserLocalId: int(d.from_user_id),
    toBucket: str(d.to_bucket) ?? '',
    toUserLocalId: int(d.to_user_id),
    assignmentLocalId: int(d.assignment_id),
    countLocalId: int(d.count_id),
    unitPrice: num(d.unit_price),
    amount: num(d.amount),
    transactionLocalId: int(d.transaction_id),
    actorUserLocalId: int(d.actor_user_id),
    actorUsername: str(d.actor_username),
    reason: str(d.reason),
    desktopCreatedAt: desktopDate(d.created_at),
  }),
};

/** Columns a row needs; one without them is reported failed rather than stored. */
const REQUIRED: Record<string, string[]> = {
  inventory_item: ['name'],
  stock_balance: ['itemLocalId'],
  stock_assignment: ['itemLocalId', 'toUserLocalId'],
  stock_count: ['itemLocalId', 'holderUserLocalId'],
  stock_movement: ['itemLocalId', 'type'],
};

export function mapInventoryRow(entity: string, data: Row): Row | null {
  const values = MAPPERS[entity](data);
  const complete = REQUIRED[entity].every(
    (k) => values[k] != null && values[k] !== '',
  );
  return complete ? values : null;
}

/**
 * Upserts one inventory table's rows by desktop id. Rows only refer to each other by
 * desktop id, so the order they arrive in does not matter. Error texts avoid the
 * words that roll the whole sync back.
 */
export async function syncInventoryRecords(
  manager: EntityManager,
  entity: string,
  rows: RecordSyncDto[],
): Promise<{ result: SyncResultDto; error?: string }> {
  const target = INVENTORY_ENTITIES[entity];
  const unique = [...new Map(rows.map((r) => [r.id, r])).values()];
  const failed: number[] = [];
  const values: Row[] = [];
  for (const r of unique) {
    const mapped = mapInventoryRow(entity, r.data);
    if (!mapped) {
      failed.push(r.id);
      continue;
    }
    values.push({
      ...mapped,
      localId: r.id,
      lastSyncedAt: new Date(),
      deletedAt: null,
    });
  }
  if (values.length === 0) {
    return { result: { successful: [], failed } };
  }
  const columns = Object.keys(values[0]).filter((k) => k !== 'localId');
  try {
    await manager
      .createQueryBuilder()
      .insert()
      .into(target)
      .values(values)
      .orUpdate([...columns, 'updatedAt'], ['localId'])
      .execute();
    return {
      result: { successful: values.map((v) => v.localId as number), failed },
      error: failed.length
        ? `${failed.length} ${entity} row(s) were incomplete and skipped`
        : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      result: { successful: [], failed: unique.map((r) => r.id) },
      error: `Failed to store ${entity}: ${message}`,
    };
  }
}

/**
 * Tags each income a stock report booked, and each reversal of one, with that report,
 * so revenue can be split out as inventory. Payments and reports may arrive in
 * different syncs, so this runs after any sync that brought either.
 */
export async function linkInventoryTransactions(
  manager: EntityManager,
): Promise<void> {
  await manager.query(
    `UPDATE "transaction" t SET "stockCountLocalId" = c."localId"
       FROM stock_count c
      WHERE (t."localId" = c."transactionLocalId" OR t."localId" = c."voidTransactionLocalId")
        AND t."stockCountLocalId" IS DISTINCT FROM c."localId"`,
  );
}
