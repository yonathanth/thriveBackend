import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SyncRecord } from '../entities/sync-record.entity';
import { Member } from '../entities/member.entity';
import { Transaction } from '../entities/transaction.entity';
import { WebAudit } from '../entities/web-audit.entity';

/** One audit entry, from the desktop app or the website: who did what, and when. */
export interface AuditEntry {
  /** Where it was done; ids are per source */
  source: AuditSource;
  /** Desktop audit_log id, or web_audit id */
  id: number;
  actorUsername: string | null;
  actorRole: string | null;
  area: string;
  action: string;
  entityType: string | null;
  entityId: number | null;
  summary: string;
  /** Before/after values of what changed, when the desktop recorded them */
  detail: unknown;
  /** When it happened, as an ISO date */
  createdAt: string | null;
  /** The website page of what it is about, when that is on the website */
  link: string | null;
}

export type AuditSource = 'app' | 'web';

export interface AuditQuery {
  /** Only entries from the desktop app, or only from the website; both when omitted. */
  source?: AuditSource;
  page?: number;
  limit?: number;
  area?: string;
  action?: string;
  actor?: string;
  search?: string;
  entityType?: string;
  entityId?: number;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);

/** SQLite's "2026-10-01 09:00:00" is UTC. */
function isoDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** The desktop stores detail as JSON text. */
function parsed(v: unknown): unknown {
  if (typeof v !== 'string') return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

/** A desktop created_at as a timestamp: SQLite's "2026-10-01 09:00:00" is UTC. */
const APP_AT = `(CASE
  WHEN r.data->>'created_at' ~ '(Z|[+-][0-9]{2}:?[0-9]{2})$' THEN (r.data->>'created_at')::timestamptz
  WHEN r.data->>'created_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN (r.data->>'created_at')::timestamp AT TIME ZONE 'UTC'
END)`;

/** Escapes LIKE wildcards in what someone typed. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Reads the audit log synced from the desktop, together with the website's own. It lives in sync_record like the other
 * generic desktop tables; this only gives it a shape and links to the website's pages.
 */
@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(SyncRecord)
    private readonly records: Repository<SyncRecord>,
    @InjectRepository(Member)
    private readonly members: Repository<Member>,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    @InjectRepository(WebAudit)
    private readonly web: Repository<WebAudit>,
  ) {}

  async list(q: AuditQuery): Promise<{ data: AuditEntry[]; total: number; page: number; limit: number }> {
    // Website entries are about no desktop record, so a record filter leaves only the app's.
    const source = q.entityType || q.entityId != null ? 'app' : q.source;
    if (source === 'app') return this.listApp(q);
    if (source === 'web') return this.listWeb(q);
    return this.listBoth(q);
  }

  /** WHERE clauses and parameters for both sources, numbered from $1. */
  private conditions(q: AuditQuery): { app: string; web: string; params: unknown[] } {
    const params: unknown[] = [];
    const app: string[] = [`r.entity = 'audit_log'`];
    const web: string[] = ['TRUE'];
    const add = (value: unknown, appSql: string, webSql: string) => {
      params.push(value);
      const n = `$${params.length}`;
      app.push(appSql.split('?').join(n));
      web.push(webSql.split('?').join(n));
    };
    if (q.area) add(q.area, `r.data->>'area' = ?`, 'w.area = ?');
    if (q.action) add(q.action, `r.data->>'action' = ?`, 'w.action = ?');
    if (q.actor) add(q.actor, `r.data->>'actor_username' = ?`, 'w."actorName" = ?');
    if (q.search) {
      add(
        likePattern(q.search),
        `(r.data->>'summary' ILIKE ? OR r.data->>'actor_username' ILIKE ?)`,
        `(w.summary ILIKE ? OR w."actorName" ILIKE ?)`,
      );
    }
    return { app: app.join(' AND '), web: web.join(' AND '), params };
  }

  private async listBoth(q: AuditQuery): Promise<{ data: AuditEntry[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 50));
    const { app, web, params } = this.conditions(q);
    const union = `SELECT 'app' AS source, r."localId" AS id, ${APP_AT} AS at FROM sync_record r WHERE ${app}
      UNION ALL SELECT 'web', w.id, w."createdAt" FROM web_audit w WHERE ${web}`;
    const n = params.length;
    const [ids, counted]: [{ source: AuditSource; id: number }[], { total: string }[]] = await Promise.all([
      this.records.query(
        `SELECT source, id FROM (${union}) x ORDER BY at DESC NULLS LAST, id DESC LIMIT $${n + 1} OFFSET $${n + 2}`,
        [...params, limit, (page - 1) * limit],
      ),
      this.records.query(`SELECT COUNT(*) AS total FROM (${union}) x`, params),
    ]);
    const appIds = ids.filter((r) => r.source === 'app').map((r) => Number(r.id));
    const webIds = ids.filter((r) => r.source === 'web').map((r) => Number(r.id));
    const [appRows, webRows] = await Promise.all([
      appIds.length ? this.records.find({ where: { entity: 'audit_log', localId: In(appIds) } }) : Promise.resolve([]),
      webIds.length ? this.web.find({ where: { id: In(webIds) } }) : Promise.resolve([]),
    ]);
    const entries = new Map<string, AuditEntry>([
      ...(await this.toEntries(appRows)).map((e) => [`app:${e.id}`, e] as const),
      ...webRows.map((w) => [`web:${w.id}`, this.webEntry(w)] as const),
    ]);
    return {
      data: ids.map((r) => entries.get(`${r.source}:${Number(r.id)}`)).filter((e): e is AuditEntry => !!e),
      total: Number(counted[0]?.total ?? 0),
      page,
      limit,
    };
  }

  private async listWeb(q: AuditQuery): Promise<{ data: AuditEntry[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 50));
    const qb = this.web.createQueryBuilder('w').orderBy('w.createdAt', 'DESC').addOrderBy('w.id', 'DESC');
    if (q.area) qb.andWhere('w.area = :area', { area: q.area });
    if (q.action) qb.andWhere('w.action = :action', { action: q.action });
    if (q.actor) qb.andWhere('w.actorName = :actor', { actor: q.actor });
    if (q.search) {
      qb.andWhere('(w.summary ILIKE :search OR w.actorName ILIKE :search)', { search: likePattern(q.search) });
    }
    const [rows, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data: rows.map((w) => this.webEntry(w)), total, page, limit };
  }

  private webEntry(w: WebAudit): AuditEntry {
    return {
      source: 'web',
      id: w.id,
      actorUsername: w.actorName,
      actorRole: w.actorRole,
      area: w.area,
      action: w.action,
      entityType: null,
      entityId: null,
      summary: w.summary,
      detail: w.detail,
      createdAt: w.createdAt.toISOString(),
      link: null,
    };
  }

  private async listApp(q: AuditQuery): Promise<{ data: AuditEntry[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 50));
    const qb = this.records
      .createQueryBuilder('r')
      .where('r.entity = :entity', { entity: 'audit_log' })
      .orderBy('r.localId', 'DESC');
    if (q.area) qb.andWhere(`r.data->>'area' = :area`, { area: q.area });
    if (q.action) qb.andWhere(`r.data->>'action' = :action`, { action: q.action });
    if (q.actor) qb.andWhere(`r.data->>'actor_username' = :actor`, { actor: q.actor });
    if (q.entityType) qb.andWhere(`r.data->>'entity_type' = :entityType`, { entityType: q.entityType });
    if (q.entityId != null) qb.andWhere(`r.data->>'entity_id' = :entityId`, { entityId: String(q.entityId) });
    if (q.search) {
      qb.andWhere(`(r.data->>'summary' ILIKE :search OR r.data->>'actor_username' ILIKE :search)`, {
        search: likePattern(q.search),
      });
    }
    const [rows, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data: await this.toEntries(rows), total, page, limit };
  }

  async get(localId: number, source: AuditSource = 'app'): Promise<AuditEntry> {
    if (source === 'web') {
      const row = await this.web.findOne({ where: { id: localId } });
      if (!row) throw new NotFoundException(`Website audit entry ${localId} not found`);
      return this.webEntry(row);
    }
    const row = await this.records.findOne({ where: { entity: 'audit_log', localId } });
    if (!row) throw new NotFoundException(`Audit entry ${localId} is not on the website yet`);
    const [entry] = await this.toEntries([row]);
    return entry;
  }

  /** The areas, actions and people present, for the page's filters. */
  async filters(): Promise<{ areas: string[]; actions: string[]; actors: string[] }> {
    const distinct = async (key: string): Promise<string[]> => {
      const rows: { v: string }[] = await this.records
        .createQueryBuilder('r')
        .select(`DISTINCT r.data->>'${key}'`, 'v')
        .where('r.entity = :entity', { entity: 'audit_log' })
        .andWhere(`r.data->>'${key}' IS NOT NULL`)
        .getRawMany();
      return rows.map(r => r.v).sort();
    };
    const webDistinct = async (column: 'area' | 'action' | 'actorName'): Promise<string[]> =>
      ((await this.web.createQueryBuilder('w').select(`DISTINCT w.${column}`, 'v').getRawMany()) as { v: string }[]).map(
        (r) => r.v,
      );
    const [areas, actions, actors, webAreas, webActions, webActors] = await Promise.all([
      distinct('area'),
      distinct('action'),
      distinct('actor_username'),
      webDistinct('area'),
      webDistinct('action'),
      webDistinct('actorName'),
    ]);
    const merge = (a: string[], b: string[]) => [...new Set([...a, ...b])].sort();
    return { areas: merge(areas, webAreas), actions: merge(actions, webActions), actors: merge(actors, webActors) };
  }

  private async toEntries(rows: SyncRecord[]): Promise<AuditEntry[]> {
    const ids = (type: string) =>
      [
        ...new Set(
          rows
            .filter(r => r.data['entity_type'] === type)
            .map(r => int(r.data['entity_id']))
            .filter((id): id is number => id != null),
        ),
      ];
    const memberIds = ids('member');
    const transactionIds = ids('transaction');
    const [members, transactions] = await Promise.all([
      memberIds.length
        ? this.members.find({ where: { localId: In(memberIds) }, select: ['id', 'localId'] })
        : Promise.resolve<Member[]>([]),
      transactionIds.length
        ? this.transactions.find({ where: { localId: In(transactionIds) }, select: ['id', 'localId'] })
        : Promise.resolve<Transaction[]>([]),
    ]);
    const memberUrl = new Map<number, string>(members.map(m => [m.localId, `/admin/members/${m.id}`]));
    const transactionUrl = new Map<number, string>(
      transactions.map(t => [t.localId, `/admin/transactions/${t.id}`]),
    );

    return rows.map(r => {
      const d = r.data;
      const entityType = str(d['entity_type']);
      const entityId = int(d['entity_id']);
      const link =
        entityId == null
          ? null
          : entityType === 'member'
            ? memberUrl.get(entityId) ?? null
            : entityType === 'transaction'
              ? transactionUrl.get(entityId) ?? null
              : null;
      return {
        source: 'app' as const,
        id: r.localId,
        actorUsername: str(d['actor_username']),
        actorRole: str(d['actor_role']),
        area: str(d['area']) ?? '',
        action: str(d['action']) ?? '',
        entityType,
        entityId,
        summary: str(d['summary']) ?? '',
        detail: parsed(d['detail']),
        createdAt: isoDate(d['created_at']),
        link,
      };
    });
  }
}
