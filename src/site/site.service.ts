import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from '../entities/service.entity';
import { Staff } from '../entities/staff.entity';
import { SyncRecord } from '../entities/sync-record.entity';
import {
  SiteAddonDto,
  SiteCatalogDto,
  SiteClassDto,
  SitePlanDto,
} from './dto/site-catalog.dto';

type Row = Record<string, unknown>;

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
/**
 * A plan description is either plain text or JSON like {"benefits":["Shower","Locker"]}
 * (or a bare array). Split it into readable text and a benefit list for the website.
 */
export function parsePlanDescription(raw: string | null | undefined): {
  text: string | null;
  benefits: string[];
} {
  const value = raw?.trim();
  if (!value) return { text: null, benefits: [] };
  if (value.startsWith('{') || value.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value);
      const list = (v: unknown) =>
        Array.isArray(v)
          ? v
              .filter(
                (x): x is string => typeof x === 'string' && x.trim() !== '',
              )
              .map((x) => x.trim().replace(/\s+/g, ' '))
          : [];
      if (Array.isArray(parsed)) return { text: null, benefits: list(parsed) };
      if (parsed && typeof parsed === 'object') {
        const o = parsed as Record<string, unknown>;
        const text = [o.description, o.text, o.note].find(
          (v): v is string => typeof v === 'string' && v.trim() !== '',
        );
        return {
          text: text?.trim() ?? null,
          benefits: list(o.benefits ?? o.features ?? o.includes),
        };
      }
    } catch {
      // Not JSON after all; show it as written.
    }
  }
  return { text: value, benefits: [] };
}

/** SQLite booleans arrive as 0/1, sometimes as strings. */
const truthy = (v: unknown): boolean =>
  v === true || v === 1 || v === '1' || v === 'true';

/**
 * What the public website shows, read from what the desktop synced: active plans,
 * active add-ons with their variants, and the main weekly timetable. Only fields fit
 * for a marketing page leave here; no members, phone numbers or internal notes.
 */
@Injectable()
export class SiteService {
  constructor(
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(Staff)
    private staffRepository: Repository<Staff>,
    @InjectRepository(SyncRecord)
    private recordRepository: Repository<SyncRecord>,
  ) {}

  async getCatalog(): Promise<SiteCatalogDto> {
    const [plans, addons, classes] = await Promise.all([
      this.getPlans(),
      this.getAddons(),
      this.getClasses(),
    ]);
    return { plans, addons, classes };
  }

  private async rows(entity: string): Promise<Array<Row & { id: number }>> {
    const records = await this.recordRepository.find({
      where: { entity },
      order: { localId: 'ASC' },
    });
    return records.map((r) => ({ ...r.data, id: r.localId }));
  }

  private async getPlans(): Promise<SitePlanDto[]> {
    const services = await this.serviceRepository.find({
      where: { status: 'active' },
      order: { category: 'ASC', period: 'ASC', price: 'ASC' },
    });
    return services.map((s) => {
      const { text, benefits } = parsePlanDescription(s.description);
      return {
        // The desktop id: what a website sign-up sends back as its chosen plan.
        id: s.localId,
        name: s.name,
        category: s.category,
        description: text,
        benefits,
        price: Number(s.price),
        periodDays: s.period,
        groupSize: s.groupSize ?? null,
        maxUsageCount:
          s.usageType === 'limited' ? (s.maxUsageCount ?? null) : null,
      };
    });
  }

  private async getAddons(): Promise<SiteAddonDto[]> {
    const [services, variants] = await Promise.all([
      this.rows('additional_service'),
      this.rows('additional_service_variant'),
    ]);

    type Variant = SiteAddonDto['variants'][number] & { sortOrder: number };
    const byService = new Map<number, Variant[]>();
    for (const v of variants) {
      if ((str(v.status) ?? 'active') !== 'active') continue;
      const serviceId = num(v.additional_service_id);
      const periodDays = num(v.period_days);
      if (serviceId == null || periodDays == null) continue;
      const list = byService.get(serviceId) ?? [];
      list.push({
        name: str(v.name) ?? `${periodDays} days`,
        periodDays,
        price: num(v.price) ?? 0,
        sortOrder: num(v.sort_order) ?? 0,
      });
      byService.set(serviceId, list);
    }

    return services
      .filter((s) => (str(s.status) ?? 'active') === 'active' && str(s.name))
      .map((s) => {
        const isFree = truthy(s.is_free);
        const list = (byService.get(s.id) ?? []).sort(
          (a, b) => a.sortOrder - b.sortOrder || a.periodDays - b.periodDays,
        );
        return {
          id: s.id,
          name: str(s.name)!,
          category: str(s.category),
          description: str(s.description),
          isFree,
          // Desktops from before variants existed only have the add-on's own price.
          price: isFree ? 0 : (num(s.price) ?? 0),
          variants: list.map(({ name, periodDays, price }) => ({
            name,
            periodDays,
            price: isFree ? 0 : price,
          })),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private async getClasses(): Promise<SiteClassDto[]> {
    const schedules = (await this.rows('schedule')).filter(
      (s) => s.is_active == null || truthy(s.is_active),
    );
    if (schedules.length === 0) return [];
    const main = schedules.find((s) => truthy(s.is_main)) ?? schedules[0];

    const items = (await this.rows('schedule_item')).filter(
      (i) => num(i.schedule_id) === main.id,
    );
    if (items.length === 0) return [];

    // Trainer names come from staff; first names only on a public page.
    const staffIds = [
      ...new Set(
        items.map((i) => num(i.staff_id)).filter((n): n is number => n != null),
      ),
    ];
    const staff = staffIds.length
      ? await this.staffRepository.find({
          where: staffIds.map((localId) => ({ localId })),
        })
      : [];
    const firstName = new Map(
      staff.map((s) => [s.localId, s.fullName.trim().split(/\s+/)[0]]),
    );

    return items
      .map((i) => {
        const dayOfWeek = num(i.day_of_week);
        const title = str(i.title);
        const startTime = str(i.start_time);
        const endTime = str(i.end_time);
        if (
          dayOfWeek == null ||
          dayOfWeek < 1 ||
          dayOfWeek > 7 ||
          !title ||
          !startTime ||
          !endTime
        ) {
          return null;
        }
        const staffId = num(i.staff_id);
        return {
          id: i.id,
          dayOfWeek,
          title,
          startTime,
          endTime,
          trainer:
            str(i.custom_trainer_name) ??
            (staffId != null ? (firstName.get(staffId) ?? null) : null),
          room: str(i.room),
          color: str(i.color),
        };
      })
      .filter((c): c is SiteClassDto => c !== null)
      .sort(
        (a, b) =>
          a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime),
      );
  }
}
