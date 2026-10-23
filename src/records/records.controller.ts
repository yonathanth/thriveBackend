import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/auth.decorator';
import type { AuthUser } from '../auth/roles.guard';
import { RecordRow, RecordsService } from './records.service';

/**
 * Desktop tables the admin pages read. Biometric templates, device queues and the
 * desktop's secrets are not synced; a table missing here is not readable even if a
 * desktop sent it.
 */
const READABLE = new Set([
  'additional_service',
  'additional_service_variant',
  'member_additional_subscription',
  'usage_service',
  'service_usage',
  'discount',
  'finance_cut',
  'member_group',
  'member_group_member',
  'freeze_history',
  'member_plan_history',
  'member_relation',
  'schedule',
  'schedule_item',
  'audit_log',
  'income_category',
  'expense_category',
  'staff_role',
  'subscription_correction',
  'member_plan_change',
  'member_queued_plan',
  'plan_change_policy',
  'health_metric_reminders',
  'health_metric_standards',
  'sms_message',
  'discount_target',
  'finance_cut_target',
  'member_addon_period',
  'door_event_log',
  'app_user',
  'system_settings',
  'device_terminal',
  'notification',
]);

/** Desktop accounts, settings, devices and money-handling records: admins only. */
const ADMIN_ONLY = new Set([
  'app_user',
  'staff_role',
  'system_settings',
  'device_terminal',
  'audit_log',
  'finance_cut',
  'finance_cut_target',
  'income_category',
  'expense_category',
]);

function toInt(value: string | undefined): number | undefined {
  if (value == null || value === '') return undefined;
  const n = parseInt(value, 10);
  if (isNaN(n)) throw new BadRequestException(`Not a number: ${value}`);
  return n;
}

@ApiTags('records')
@Controller('api/records')
@Auth('admin', 'manager')
@ApiBearerAuth('bearer')
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Get(':entity')
  @ApiOperation({
    summary: 'List synced desktop rows',
    description:
      'Rows of a desktop table without a dedicated endpoint (add-ons, drop-ins, discounts, schedules, ...), each with its desktop columns and desktop id',
  })
  @ApiParam({ name: 'entity', example: 'additional_service' })
  @ApiQuery({ name: 'memberId', required: false, description: 'Desktop member id' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Request() req: { user: AuthUser },
    @Param('entity') entity: string,
    @Query('memberId') memberId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{ data: RecordRow[]; total: number }> {
    if (!READABLE.has(entity)) {
      throw new BadRequestException(`Unknown record type: ${entity}`);
    }
    if (ADMIN_ONLY.has(entity) && req.user.role !== 'admin') {
      throw new ForbiddenException('You do not have access to this resource');
    }
    return this.recordsService.list(entity, {
      memberLocalId: toInt(memberId),
      page: toInt(page),
      limit: toInt(limit),
    });
  }
}
