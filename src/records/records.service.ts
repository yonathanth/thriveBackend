import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SyncRecord } from '../entities/sync-record.entity';

/** A synced desktop row as the web app sees it: its columns plus the desktop id. */
export type RecordRow = Record<string, unknown> & { id: number };

@Injectable()
export class RecordsService {
  constructor(
    @InjectRepository(SyncRecord)
    private recordRepository: Repository<SyncRecord>,
  ) {}

  toRow(record: SyncRecord): RecordRow {
    return { ...record.data, id: record.localId };
  }

  /** Rows of one desktop table, newest first, optionally only one member's. */
  async list(
    entity: string,
    opts: { memberLocalId?: number; page?: number; limit?: number } = {},
  ): Promise<{ data: RecordRow[]; total: number }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
    const [records, total] = await this.recordRepository.findAndCount({
      where: {
        entity,
        ...(opts.memberLocalId != null ? { memberLocalId: opts.memberLocalId } : {}),
      },
      order: { localId: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: records.map(r => this.toRow(r)), total };
  }

  /** Every row of one desktop table belonging to a member. */
  async forMember(entity: string, memberLocalId: number): Promise<RecordRow[]> {
    const records = await this.recordRepository.find({
      where: { entity, memberLocalId },
      order: { localId: 'DESC' },
    });
    return records.map(r => this.toRow(r));
  }

  /** Rows of one desktop table by desktop id. */
  async byIds(entity: string, ids: number[]): Promise<Map<number, RecordRow>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const records = await this.recordRepository.find({
      where: { entity, localId: In(unique) },
    });
    return new Map(records.map(r => [r.localId, this.toRow(r)]));
  }
}
