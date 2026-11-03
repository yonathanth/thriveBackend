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
import { can } from '../auth/permissions';
import { stripMoney } from '../auth/redact';
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

/**
 * The permission(s) that open each non-admin table (any one is enough). A table not
 * listed here is admin-only, so a newly readable table fails closed.
 */
const ENTITY_PERMISSIONS: Record<string, string[]> = {
  additional_service: ['services.view'],
  additional_service_variant: ['services.view'],
  usage_service: ['services.view'],
  discount: ['services.view'],
  discount_target: ['services.view'],
  plan_change_policy: ['services.view'],
  member_group: ['services.view', 'members.view'],
  member_group_member: ['services.view', 'members.view'],
  member_additional_subscription: ['services.view', 'members.view'],
  service_usage: ['services.view', 'members.view'],
  member_addon_period: ['services.view', 'members.view'],
  freeze_history: ['members.view'],
  member_plan_history: ['members.view'],
  member_relation: ['members.view'],
  subscription_correction: ['members.view'],
  member_plan_change: ['members.view'],
  member_queued_plan: ['members.view'],
  notification: ['members.view'],
  health_metric_reminders: ['members.health.view'],
  health_metric_standards: ['members.health.view'],
  schedule: ['staff.view'],
  schedule_item: ['staff.view'],
  sms_message: ['sms.history.view'],
  door_event_log: ['attendance.view'],
};

/**
 * Tables whose rows carry what someone paid, and the permissions that may see those
 * amounts. Without one, the rows come back with their money columns removed.
 */
const MONEY_PERMISSIONS: Record<string, string[]> = {
  service_usage: ['catalog.money.view', 'members.payments.view'],
  member_additional_subscription: [
    'catalog.money.view',
    'members.payments.view',
  ],
  member_addon_period: ['catalog.money.view', 'members.payments.view'],
  member_plan_history: ['members.payments.view'],
  member_plan_change: ['members.payments.view'],
  member_queued_plan: ['members.payments.view'],
  subscription_correction: ['members.payments.view'],
};

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
    if (req.user.role !== 'admin') {
      const needed = ADMIN_ONLY.has(entity)
        ? undefined
        : ENTITY_PERMISSIONS[entity];
      if (!needed?.some((key) => can(req.user, key))) {
        throw new ForbiddenException('You do not have access to this resource');
      }
    }
    const result = await this.recordsService.list(entity, {
      memberLocalId: toInt(memberId),
      page: toInt(page),
      limit: toInt(limit),
    });
    const money = MONEY_PERMISSIONS[entity];
    if (money && !money.some((key) => can(req.user, key))) {
      return { ...result, data: result.data.map(stripMoney) };
    }
    // How often each discount was used is business data, like the amounts.
    if (entity === 'discount' && !can(req.user, 'catalog.money.view')) {
      return {
        ...result,
        data: result.data.map((row) => {
          const copy = { ...row };
          delete copy['times_used'];
          return copy;
        }),
      };
    }
    return result;
  }
}
