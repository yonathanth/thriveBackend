import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SyncRecord } from '../entities/sync-record.entity';
import { Member } from '../entities/member.entity';
import { Transaction } from '../entities/transaction.entity';

/** One entry of the desktop's audit log: who changed what, and when. */
export interface AuditEntry {
  /** Desktop audit_log id */
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

export interface AuditQuery {
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

/**
 * Reads the audit log synced from the desktop. It lives in sync_record like the other
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
  ) {}

  async list(q: AuditQuery): Promise<{ data: AuditEntry[]; total: number; page: number; limit: number }> {
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
        search: `%${q.search.replace(/[\\%_]/g, c => `\\${c}`)}%`,
      });
    }
    const [rows, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data: await this.toEntries(rows), total, page, limit };
  }

  async get(localId: number): Promise<AuditEntry> {
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
    const [areas, actions, actors] = await Promise.all([
      distinct('area'),
      distinct('action'),
      distinct('actor_username'),
    ]);
    return { areas, actions, actors };
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
