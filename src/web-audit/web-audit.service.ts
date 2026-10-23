import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { WebAudit } from '../entities/web-audit.entity';

/** The signed-in account, as the JWT strategy puts it on the request. */
export interface AuditActor {
  id: number;
  name: string;
  role: string;
}

const RECORDED_ROLES = ['admin', 'manager', 'trainer'];

/** Done by the website itself, e.g. a login created when a desktop sync arrives. */
export const SYSTEM_ACTOR: AuditActor = { id: 0, name: 'Website (automatic)', role: 'system' };

@Injectable()
export class WebAuditService {
  private readonly logger = new Logger(WebAuditService.name);

  constructor(@InjectRepository(WebAudit) private readonly entries: Repository<WebAudit>) {}

  /**
   * Records a staff action. Never throws: an audit write failing must not undo or
   * fail what was done. Members' own actions are not recorded.
   */
  async record(
    actor: AuditActor,
    area: string,
    action: string,
    summary: string,
    detail: Record<string, unknown> | null = null,
  ): Promise<void> {
    if (!RECORDED_ROLES.includes(actor.role) && actor !== SYSTEM_ACTOR) return;
    try {
      // jsonb detail is free-form, which TypeORM's deep-partial typing cannot express
      await this.entries.insert({
        actorId: actor === SYSTEM_ACTOR ? null : actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        area,
        action,
        summary,
        detail,
      } as QueryDeepPartialEntity<WebAudit>);
    } catch (error) {
      this.logger.error(`Could not record "${summary}": ${error instanceof Error ? error.message : error}`);
    }
  }
}
