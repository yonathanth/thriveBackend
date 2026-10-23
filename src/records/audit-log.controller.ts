import { BadRequestException, Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/auth.decorator';
import { AuditEntry, AuditLogService } from './audit-log.service';

function toInt(value: string | undefined): number | undefined {
  if (value == null || value === '') return undefined;
  const n = parseInt(value, 10);
  if (isNaN(n)) throw new BadRequestException(`Not a number: ${value}`);
  return n;
}

@ApiTags('audit-log')
@Controller('api/audit-log')
@Auth('admin')
@ApiBearerAuth('bearer')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: 'Who changed what in the desktop app, newest first' })
  @ApiQuery({ name: 'area', required: false, example: 'member' })
  @ApiQuery({ name: 'action', required: false, example: 'plan_change' })
  @ApiQuery({ name: 'actor', required: false, description: 'Desktop username' })
  @ApiQuery({ name: 'search', required: false, description: 'Text in the summary or username' })
  @ApiQuery({ name: 'entityType', required: false, example: 'member' })
  @ApiQuery({ name: 'entityId', required: false, description: 'Desktop id of what it is about' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  list(
    @Query('area') area?: string,
    @Query('action') action?: string,
    @Query('actor') actor?: string,
    @Query('search') search?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{ data: AuditEntry[]; total: number; page: number; limit: number }> {
    return this.auditLog.list({
      area: area || undefined,
      action: action || undefined,
      actor: actor || undefined,
      search: search?.trim() || undefined,
      entityType: entityType || undefined,
      entityId: toInt(entityId),
      page: toInt(page),
      limit: toInt(limit),
    });
  }

  @Get('filters')
  @ApiOperation({ summary: 'The areas, actions and people in the audit log' })
  filters(): Promise<{ areas: string[]; actions: string[]; actors: string[] }> {
    return this.auditLog.filters();
  }

  @Get(':id')
  @ApiOperation({ summary: 'One audit entry, by its desktop id' })
  get(@Param('id', ParseIntPipe) id: number): Promise<AuditEntry> {
    return this.auditLog.get(id);
  }
}
