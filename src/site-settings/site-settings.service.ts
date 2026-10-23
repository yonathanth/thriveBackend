import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SiteSetting } from '../entities/site-setting.entity';
import { AuditActor, WebAuditService } from '../web-audit/web-audit.service';

export const FINANCE_START_DATE = 'finance_start_date';
export const FINANCE_START_AT = 'finance_start_at';

/** The moment a gym-calendar date begins, in that time zone, as an ISO instant. */
export function startOfDayIn(date: string, timeZone: string): string {
  // Noon UTC on that date is the same calendar day in every time zone the gym could be in;
  // the offset there gives local midnight.
  const noon = new Date(`${date}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(noon);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const localAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  const offsetMs = localAsUtc - noon.getTime();
  return new Date(Date.parse(`${date}T00:00:00Z`) - offsetMs).toISOString();
}

/** Website-only settings. */
@Injectable()
export class SiteSettingsService {
  private readonly timeZone: string;

  constructor(
    @InjectRepository(SiteSetting) private readonly settings: Repository<SiteSetting>,
    private readonly webAudit: WebAuditService,
    config: ConfigService,
  ) {
    this.timeZone = config.get<string>('APP_TIMEZONE') || 'Africa/Addis_Ababa';
  }

  /** The date finances are counted from (YYYY-MM-DD), or null when everything counts. */
  async financeStartDate(): Promise<string | null> {
    const row = await this.settings.findOne({ where: { key: FINANCE_START_DATE } });
    return row?.value ?? null;
  }

  async setFinanceStartDate(actor: AuditActor, date: string | null): Promise<string | null> {
    const value = date?.trim() || null;
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(Date.parse(`${value}T00:00:00Z`)))) {
      throw new BadRequestException('Enter the date as YYYY-MM-DD');
    }
    if (value) {
      await this.settings.save([
        { key: FINANCE_START_DATE, value },
        { key: FINANCE_START_AT, value: startOfDayIn(value, this.timeZone) },
      ]);
    } else {
      await this.settings.delete({ key: In([FINANCE_START_DATE, FINANCE_START_AT]) });
    }
    await this.webAudit.record(
      actor,
      'settings',
      'update',
      value ? `Website finances are now counted from ${value}` : 'Website finances count every record again (start date cleared)',
      { financeStartDate: value },
    );
    return value;
  }
}
