import { Body, Controller, Get, Put, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { Auth } from '../auth/auth.decorator';
import { Roles } from '../auth/roles';
import { AuditActor } from '../web-audit/web-audit.service';
import { SiteSettingsService } from './site-settings.service';

export class FinanceStartDto {
  /** YYYY-MM-DD, or null/empty to count every record */
  @IsOptional()
  @Matches(/^(\d{4}-\d{2}-\d{2})?$/, { message: 'Enter the date as YYYY-MM-DD' })
  date?: string | null;
}

@ApiTags('settings')
@Controller('api/site-settings')
@Auth('admin', 'manager')
@ApiBearerAuth('bearer')
export class SiteSettingsController {
  constructor(private readonly settings: SiteSettingsService) {}

  @Get('finance-start')
  @ApiOperation({ summary: 'The date website finances are counted from, for the "showing from" tags' })
  async financeStart(): Promise<{ date: string | null }> {
    return { date: await this.settings.financeStartDate() };
  }

  @Put('finance-start')
  @Roles('admin')
  @ApiOperation({ summary: 'Set or clear the date website finances are counted from (admins)' })
  async setFinanceStart(
    @Request() req: { user: AuditActor },
    @Body() body: FinanceStartDto,
  ): Promise<{ date: string | null }> {
    return { date: await this.settings.setFinanceStartDate(req.user, body.date ?? null) };
  }
}
