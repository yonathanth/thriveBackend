import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import {
  PaginatedResponseDto,
  createPaginatedResponse,
} from '../common/dto/pagination.dto';
import {
  AssignmentsQueryDto,
  InventoryRangeQueryDto,
  InventoryReportQueryDto,
} from './dto/inventory-query.dto';

type Row = Record<string, unknown>;

/** Postgres hands back sums and decimals as text. */
const n = (v: unknown): number => (v == null ? 0 : Number(v));
const nOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

/** The desktop account a row names, from the synced app_user records. */
const userName = (alias: string, column: string) =>
  `(SELECT u.data->>'username' FROM sync_record u
     WHERE u.entity = 'app_user' AND u."localId" = ${alias}."${column}" LIMIT 1)`;

export interface InventoryItemView {
  localId: number;
  kind: string;
  name: string;
  sku: string | null;
  unitName: string;
  packName: string | null;
  unitsPerPack: number | null;
  unitPrice: number;
  packPrice: number | null;
  assetLocation: string | null;
  assetCondition: string | null;
  assetSerial: string | null;
  notes: string | null;
  isActive: boolean;
  storeQty: number;
  heldQty: number;
  pendingQty: number;
  soldQty: number;
}

export interface HoldingView {
  itemLocalId: number;
  itemName: string;
  unitName: string;
  packName: string | null;
  unitsPerPack: number | null;
  holderUserLocalId: number;
  holderName: string | null;
  qtyBase: number;
  updatedAt: string | null;
}

export interface AssignmentView {
  localId: number;
  itemLocalId: number;
  itemName: string;
  unitName: string;
  packName: string | null;
  unitsPerPack: number | null;
  kind: string;
  qtyBase: number;
  fromName: string | null;
  toName: string | null;
  createdByName: string | null;
  status: string;
  note: string | null;
  createdAt: string | null;
  respondedAt: string | null;
}

export interface MovementView {
  localId: number;
  itemLocalId: number;
  itemName: string;
  unitName: string;
  packName: string | null;
  unitsPerPack: number | null;
  type: string;
  qtyBase: number;
  fromBucket: string;
  fromName: string | null;
  toBucket: string;
  toName: string | null;
  actorUsername: string | null;
  reason: string | null;
  unitPrice: number | null;
  amount: number | null;
  createdAt: string | null;
}

export interface SaleView {
  localId: number;
  itemLocalId: number;
  itemName: string;
  unitName: string;
  packName: string | null;
  unitsPerPack: number | null;
  holderName: string | null;
  expectedQtyBase: number;
  remainingQtyBase: number;
  soldQtyBase: number;
  unitPrice: number;
  packPrice: number | null;
  amount: number;
  paymentMethod: string | null;
  reportedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface InventoryReport {
  granularity: 'day' | 'month' | 'year';
  totals: {
    revenue: number;
    refunded: number;
    net: number;
    soldQty: number;
    reports: number;
    /** All paid income in the range, inventory included, for comparison. */
    allRevenue: number;
    /** Inventory's share of all paid income, 0 to 100. */
    share: number;
  };
  periods: {
    period: string;
    revenue: number;
    refunded: number;
    net: number;
    soldQty: number;
  }[];
  byItem: {
    itemLocalId: number;
    itemName: string;
    unitName: string;
    packName: string | null;
    unitsPerPack: number | null;
    soldQty: number;
    amount: number;
    reports: number;
  }[];
  byHolder: {
    holderUserLocalId: number;
    holderName: string | null;
    soldQty: number;
    amount: number;
    reports: number;
  }[];
}

@Injectable()
export class InventoryService {
  private readonly timeZone: string;

  constructor(
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.timeZone = config.get<string>('APP_TIMEZONE') || 'Africa/Addis_Ababa';
  }

  private async select(sql: string, params: unknown[] = []): Promise<Row[]> {
    return this.dataSource.query<Row[]>(sql, params);
  }

  /**
   * Conditions keeping `column` within whole days of the gym's time zone, start and
   * end inclusive, appended to `params`.
   */
  private dayRange(
    column: string,
    params: unknown[],
    startDate?: string,
    endDate?: string,
  ): string[] {
    const where: string[] = [];
    if (startDate) {
      params.push(startDate.slice(0, 10), this.timeZone);
      where.push(
        `${column} >= ($${params.length - 1}::date)::timestamp AT TIME ZONE $${params.length}`,
      );
    }
    if (endDate) {
      params.push(endDate.slice(0, 10), this.timeZone);
      where.push(
        `${column} < ($${params.length - 1}::date + 1)::timestamp AT TIME ZONE $${params.length}`,
      );
    }
    return where;
  }

  async items(kind?: string): Promise<InventoryItemView[]> {
    const params: unknown[] = [];
    const where = ['i."deletedAt" IS NULL'];
    if (kind) {
      params.push(kind);
      where.push(`i.kind = $${params.length}`);
    }
    const rows = await this.select(
      `SELECT i."localId", i.kind, i.name, i.sku, i."unitName", i."packName", i."unitsPerPack",
              i."unitPrice", i."packPrice", i."assetLocation", i."assetCondition", i."assetSerial",
              i.notes, i."isActive",
              (SELECT COALESCE(SUM(b."qtyBase"), 0) FROM stock_balance b
                WHERE b."itemLocalId" = i."localId" AND b."holderUserLocalId" IS NULL AND b."deletedAt" IS NULL) AS "storeQty",
              (SELECT COALESCE(SUM(b."qtyBase"), 0) FROM stock_balance b
                WHERE b."itemLocalId" = i."localId" AND b."holderUserLocalId" IS NOT NULL AND b."deletedAt" IS NULL) AS "heldQty",
              (SELECT COALESCE(SUM(a."qtyBase"), 0) FROM stock_assignment a
                WHERE a."itemLocalId" = i."localId" AND a.status = 'pending' AND a."deletedAt" IS NULL) AS "pendingQty",
              (SELECT COALESCE(SUM(c."soldQtyBase"), 0) FROM stock_count c
                WHERE c."itemLocalId" = i."localId" AND c."voidedAt" IS NULL AND c."deletedAt" IS NULL) AS "soldQty"
         FROM inventory_item i
        WHERE ${where.join(' AND ')}
        ORDER BY i.kind DESC, lower(i.name)`,
      params,
    );
    return rows.map((r: Row) => ({
      localId: n(r.localId),
      kind: r.kind as string,
      name: r.name as string,
      sku: (r.sku as string) ?? null,
      unitName: r.unitName as string,
      packName: (r.packName as string) ?? null,
      unitsPerPack: nOrNull(r.unitsPerPack),
      unitPrice: n(r.unitPrice),
      packPrice: nOrNull(r.packPrice),
      assetLocation: (r.assetLocation as string) ?? null,
      assetCondition: (r.assetCondition as string) ?? null,
      assetSerial: (r.assetSerial as string) ?? null,
      notes: (r.notes as string) ?? null,
      isActive: Boolean(r.isActive),
      storeQty: n(r.storeQty),
      heldQty: n(r.heldQty),
      pendingQty: n(r.pendingQty),
      soldQty: n(r.soldQty),
    }));
  }

  /** Who holds what right now. */
  async holdings(): Promise<HoldingView[]> {
    const rows = await this.select(
      `SELECT b."itemLocalId", i.name AS "itemName", i."unitName", i."packName", i."unitsPerPack",
              b."holderUserLocalId", ${userName('b', 'holderUserLocalId')} AS "holderName",
              b."qtyBase", b."desktopUpdatedAt"
         FROM stock_balance b
         JOIN inventory_item i ON i."localId" = b."itemLocalId"
        WHERE b."holderUserLocalId" IS NOT NULL AND b."qtyBase" > 0 AND b."deletedAt" IS NULL
        ORDER BY "holderName", lower(i.name)`,
    );
    return rows.map((r: Row) => ({
      itemLocalId: n(r.itemLocalId),
      itemName: r.itemName as string,
      unitName: r.unitName as string,
      packName: (r.packName as string) ?? null,
      unitsPerPack: nOrNull(r.unitsPerPack),
      holderUserLocalId: n(r.holderUserLocalId),
      holderName: (r.holderName as string) ?? null,
      qtyBase: n(r.qtyBase),
      updatedAt: r.desktopUpdatedAt
        ? new Date(r.desktopUpdatedAt as string).toISOString()
        : null,
    }));
  }

  /** Hand-overs, pending first, newest first within each. */
  async assignments(
    q: AssignmentsQueryDto,
  ): Promise<PaginatedResponseDto<AssignmentView>> {
    const { page = 1, limit = 20 } = q;
    const params: unknown[] = [];
    const where = ['a."deletedAt" IS NULL'];
    if (q.status) {
      params.push(q.status);
      where.push(`a.status = $${params.length}`);
    }
    const [{ total }] = await this.select(
      `SELECT COUNT(*) AS total FROM stock_assignment a WHERE ${where.join(' AND ')}`,
      params,
    );
    const rows = await this.select(
      `SELECT a."localId", a."itemLocalId", i.name AS "itemName", i."unitName", i."packName", i."unitsPerPack",
              a.kind, a."qtyBase", ${userName('a', 'fromUserLocalId')} AS "fromName",
              ${userName('a', 'toUserLocalId')} AS "toName", ${userName('a', 'createdByLocalId')} AS "createdByName",
              a.status, a.note, a."desktopCreatedAt", a."respondedAt"
         FROM stock_assignment a
         JOIN inventory_item i ON i."localId" = a."itemLocalId"
        WHERE ${where.join(' AND ')}
        ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END, a."desktopCreatedAt" DESC NULLS LAST, a."localId" DESC
        LIMIT ${Number(limit)} OFFSET ${(Number(page) - 1) * Number(limit)}`,
      params,
    );
    const data = rows.map((r: Row) => ({
      localId: n(r.localId),
      itemLocalId: n(r.itemLocalId),
      itemName: r.itemName as string,
      unitName: r.unitName as string,
      packName: (r.packName as string) ?? null,
      unitsPerPack: nOrNull(r.unitsPerPack),
      kind: r.kind as string,
      qtyBase: n(r.qtyBase),
      fromName: (r.fromName as string) ?? null,
      toName: (r.toName as string) ?? null,
      createdByName: (r.createdByName as string) ?? null,
      status: r.status as string,
      note: (r.note as string) ?? null,
      createdAt: r.desktopCreatedAt
        ? new Date(r.desktopCreatedAt as string).toISOString()
        : null,
      respondedAt: r.respondedAt
        ? new Date(r.respondedAt as string).toISOString()
        : null,
    }));
    return createPaginatedResponse(data, n(total), page, limit);
  }

  /** The stock ledger. Money columns are left out unless `withMoney`. */
  async movements(
    q: InventoryRangeQueryDto,
    withMoney: boolean,
  ): Promise<PaginatedResponseDto<MovementView>> {
    const { page = 1, limit = 20 } = q;
    const params: unknown[] = [];
    const where = ['m."deletedAt" IS NULL'];
    if (q.itemId) {
      params.push(q.itemId);
      where.push(`m."itemLocalId" = $${params.length}`);
    }
    if (q.type) {
      params.push(q.type);
      where.push(`m.type = $${params.length}`);
    }
    where.push(
      ...this.dayRange('m."desktopCreatedAt"', params, q.startDate, q.endDate),
    );
    const [{ total }] = await this.select(
      `SELECT COUNT(*) AS total FROM stock_movement m WHERE ${where.join(' AND ')}`,
      params,
    );
    const rows = await this.select(
      `SELECT m."localId", m."itemLocalId", i.name AS "itemName", i."unitName", i."packName", i."unitsPerPack",
              m.type, m."qtyBase", m."fromBucket", ${userName('m', 'fromUserLocalId')} AS "fromName",
              m."toBucket", ${userName('m', 'toUserLocalId')} AS "toName", m."actorUsername", m.reason,
              m."unitPrice", m.amount, m."desktopCreatedAt"
         FROM stock_movement m
         JOIN inventory_item i ON i."localId" = m."itemLocalId"
        WHERE ${where.join(' AND ')}
        ORDER BY m."localId" DESC
        LIMIT ${Number(limit)} OFFSET ${(Number(page) - 1) * Number(limit)}`,
      params,
    );
    const data = rows.map((r: Row) => ({
      localId: n(r.localId),
      itemLocalId: n(r.itemLocalId),
      itemName: r.itemName as string,
      unitName: r.unitName as string,
      packName: (r.packName as string) ?? null,
      unitsPerPack: nOrNull(r.unitsPerPack),
      type: r.type as string,
      qtyBase: n(r.qtyBase),
      fromBucket: r.fromBucket as string,
      fromName: (r.fromName as string) ?? null,
      toBucket: r.toBucket as string,
      toName: (r.toName as string) ?? null,
      actorUsername: (r.actorUsername as string) ?? null,
      reason: (r.reason as string) ?? null,
      unitPrice: withMoney ? nOrNull(r.unitPrice) : null,
      amount: withMoney ? nOrNull(r.amount) : null,
      createdAt: r.desktopCreatedAt
        ? new Date(r.desktopCreatedAt as string).toISOString()
        : null,
    }));
    return createPaginatedResponse(data, n(total), page, limit);
  }

  /** Stock reports: each is what one holder sold, with the money it booked. */
  async sales(
    q: InventoryRangeQueryDto,
  ): Promise<PaginatedResponseDto<SaleView>> {
    const { page = 1, limit = 20 } = q;
    const params: unknown[] = [];
    const where = ['c."deletedAt" IS NULL', 'c."soldQtyBase" > 0'];
    if (q.itemId) {
      params.push(q.itemId);
      where.push(`c."itemLocalId" = $${params.length}`);
    }
    where.push(
      ...this.dayRange('c."desktopCreatedAt"', params, q.startDate, q.endDate),
    );
    const [{ total }] = await this.select(
      `SELECT COUNT(*) AS total FROM stock_count c WHERE ${where.join(' AND ')}`,
      params,
    );
    const rows = await this.select(
      `SELECT c."localId", c."itemLocalId", i.name AS "itemName", i."unitName", i."packName",
              c."unitsPerPack", ${userName('c', 'holderUserLocalId')} AS "holderName",
              c."expectedQtyBase", c."remainingQtyBase", c."soldQtyBase", c."unitPrice", c."packPrice",
              c.amount, pm.name AS "paymentMethod", c."desktopCreatedAt", c."voidedAt", c."voidReason"
         FROM stock_count c
         JOIN inventory_item i ON i."localId" = c."itemLocalId"
         LEFT JOIN payment_method pm ON pm."localId" = c."paymentMethodLocalId"
        WHERE ${where.join(' AND ')}
        ORDER BY c."desktopCreatedAt" DESC NULLS LAST, c."localId" DESC
        LIMIT ${Number(limit)} OFFSET ${(Number(page) - 1) * Number(limit)}`,
      params,
    );
    const data = rows.map((r: Row) => ({
      localId: n(r.localId),
      itemLocalId: n(r.itemLocalId),
      itemName: r.itemName as string,
      unitName: r.unitName as string,
      packName: (r.packName as string) ?? null,
      unitsPerPack: nOrNull(r.unitsPerPack),
      holderName: (r.holderName as string) ?? null,
      expectedQtyBase: n(r.expectedQtyBase),
      remainingQtyBase: n(r.remainingQtyBase),
      soldQtyBase: n(r.soldQtyBase),
      unitPrice: n(r.unitPrice),
      packPrice: nOrNull(r.packPrice),
      amount: n(r.amount),
      paymentMethod: (r.paymentMethod as string) ?? null,
      reportedAt: r.desktopCreatedAt
        ? new Date(r.desktopCreatedAt as string).toISOString()
        : null,
      voidedAt: r.voidedAt
        ? new Date(r.voidedAt as string).toISOString()
        : null,
      voidReason: (r.voidReason as string) ?? null,
    }));
    return createPaginatedResponse(data, n(total), page, limit);
  }

  /**
   * Inventory revenue by day, month or year, in the gym's time zone, beside all
   * revenue for the same range. Money comes from the transactions the stock reports
   * booked, so these figures are the ones the financial reports already include.
   */
  async report(q: InventoryReportQueryDto): Promise<InventoryReport> {
    const granularity = q.granularity ?? 'day';

    const tParams: unknown[] = [];
    const tRange = this.dayRange(
      't."transactionDate"',
      tParams,
      q.startDate,
      q.endDate,
    );
    tParams.push(this.timeZone, granularity);
    const tzParam = `$${tParams.length - 1}`;
    const gParam = `$${tParams.length}`;
    const paid = `(t."transactionType" = 'income' AND COALESCE(t."paymentStatus", 'paid') NOT IN ('cancelled', 'refunded', 'pending'))`;
    const refund = `t."transactionType" = 'negative_return'`;
    const tWhere = ['t."deletedAt" IS NULL', ...tRange].join(' AND ');

    const money = await this.select(
      `SELECT to_char(date_trunc(${gParam}, t."transactionDate" AT TIME ZONE ${tzParam}), 'YYYY-MM-DD') AS period,
              COALESCE(SUM(CASE WHEN ${paid} THEN t.amount END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN ${refund} THEN t.amount END), 0) AS refunded
         FROM "transaction" t
        WHERE t."stockCountLocalId" IS NOT NULL AND ${tWhere}
        GROUP BY 1 ORDER BY 1`,
      tParams,
    );
    const [all] = await this.select(
      `SELECT COALESCE(SUM(t.amount), 0) AS total FROM "transaction" t WHERE ${paid} AND ${tWhere}`,
      tParams.slice(0, tParams.length - 2),
    );

    const cParams: unknown[] = [];
    const cRange = this.dayRange(
      'c."desktopCreatedAt"',
      cParams,
      q.startDate,
      q.endDate,
    );
    cParams.push(this.timeZone, granularity);
    const cWhere = [
      'c."deletedAt" IS NULL',
      'c."voidedAt" IS NULL',
      'c."soldQtyBase" > 0',
      ...cRange,
    ].join(' AND ');
    const quantities = await this.select(
      `SELECT to_char(date_trunc($${cParams.length}, c."desktopCreatedAt" AT TIME ZONE $${cParams.length - 1}), 'YYYY-MM-DD') AS period,
              COALESCE(SUM(c."soldQtyBase"), 0) AS sold, COUNT(*) AS reports
         FROM stock_count c WHERE ${cWhere} GROUP BY 1 ORDER BY 1`,
      cParams,
    );
    const plainParams = cParams.slice(0, cParams.length - 2);
    const byItem = await this.select(
      `SELECT c."itemLocalId", i.name AS "itemName", i."unitName", i."packName", i."unitsPerPack",
              SUM(c."soldQtyBase") AS sold, SUM(c.amount) AS amount, COUNT(*) AS reports
         FROM stock_count c JOIN inventory_item i ON i."localId" = c."itemLocalId"
        WHERE ${cWhere}
        GROUP BY c."itemLocalId", i.name, i."unitName", i."packName", i."unitsPerPack"
        ORDER BY amount DESC`,
      plainParams,
    );
    const byHolder = await this.select(
      `SELECT c."holderUserLocalId", ${userName('c', 'holderUserLocalId')} AS "holderName",
              SUM(c."soldQtyBase") AS sold, SUM(c.amount) AS amount, COUNT(*) AS reports
         FROM stock_count c WHERE ${cWhere}
        GROUP BY c."holderUserLocalId" ORDER BY amount DESC`,
      plainParams,
    );

    // Periods come back as the gym's local calendar day, already as text: a
    // timestamp would be shifted again by the server's own time zone.
    const key = (d: unknown) =>
      String(d).slice(
        0,
        granularity === 'year' ? 4 : granularity === 'month' ? 7 : 10,
      );
    const periods = new Map<
      string,
      {
        period: string;
        revenue: number;
        refunded: number;
        net: number;
        soldQty: number;
      }
    >();
    const at = (p: string) => {
      if (!periods.has(p))
        periods.set(p, {
          period: p,
          revenue: 0,
          refunded: 0,
          net: 0,
          soldQty: 0,
        });
      return periods.get(p)!;
    };
    for (const r of money) {
      const p = at(key(r.period));
      p.revenue = n(r.revenue);
      p.refunded = n(r.refunded);
      p.net = p.revenue - p.refunded;
    }
    for (const r of quantities) at(key(r.period)).soldQty = n(r.sold);

    const revenue = money.reduce((s: number, r: Row) => s + n(r.revenue), 0);
    const refunded = money.reduce((s: number, r: Row) => s + n(r.refunded), 0);
    const allRevenue = n(all?.total);
    return {
      granularity,
      totals: {
        revenue,
        refunded,
        net: revenue - refunded,
        soldQty: quantities.reduce((s: number, r: Row) => s + n(r.sold), 0),
        reports: quantities.reduce((s: number, r: Row) => s + n(r.reports), 0),
        allRevenue,
        share:
          allRevenue > 0 ? Math.round((revenue / allRevenue) * 1000) / 10 : 0,
      },
      periods: [...periods.values()].sort((a, b) =>
        a.period.localeCompare(b.period),
      ),
      byItem: byItem.map((r: Row) => ({
        itemLocalId: n(r.itemLocalId),
        itemName: r.itemName as string,
        unitName: r.unitName as string,
        packName: (r.packName as string) ?? null,
        unitsPerPack: nOrNull(r.unitsPerPack),
        soldQty: n(r.sold),
        amount: n(r.amount),
        reports: n(r.reports),
      })),
      byHolder: byHolder.map((r: Row) => ({
        holderUserLocalId: n(r.holderUserLocalId),
        holderName: (r.holderName as string) ?? null,
        soldQty: n(r.sold),
        amount: n(r.amount),
        reports: n(r.reports),
      })),
    };
  }

  /**
   * Items whose synced balances do not match a replay of the synced ledger. Expected
   * briefly while a sync is under way; lasting differences mean rows are missing.
   */
  async integrity(): Promise<
    {
      itemLocalId: number;
      itemName: string;
      ledger: number;
      balances: number;
    }[]
  > {
    const rows = await this.select(
      `SELECT i."localId" AS "itemLocalId", i.name AS "itemName",
              COALESCE((SELECT SUM(CASE WHEN m."fromBucket" IN ('outside', 'sold') THEN m."qtyBase" ELSE 0 END)
                             - SUM(CASE WHEN m."toBucket" IN ('outside', 'sold') THEN m."qtyBase" ELSE 0 END)
                          FROM stock_movement m WHERE m."itemLocalId" = i."localId" AND m."deletedAt" IS NULL), 0) AS ledger,
              COALESCE((SELECT SUM(b."qtyBase") FROM stock_balance b
                         WHERE b."itemLocalId" = i."localId" AND b."deletedAt" IS NULL), 0)
            + COALESCE((SELECT SUM(a."qtyBase") FROM stock_assignment a
                         WHERE a."itemLocalId" = i."localId" AND a.status = 'pending' AND a."deletedAt" IS NULL), 0) AS balances
         FROM inventory_item i WHERE i."deletedAt" IS NULL`,
    );
    return rows
      .map((r: Row) => ({
        itemLocalId: n(r.itemLocalId),
        itemName: r.itemName as string,
        ledger: n(r.ledger),
        balances: n(r.balances),
      }))
      .filter(
        (r: { ledger: number; balances: number }) => r.ledger !== r.balances,
      );
  }
}
