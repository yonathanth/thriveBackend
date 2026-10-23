import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { HealthMetric } from '../entities/health-metric.entity';
import { Member } from '../entities/member.entity';
import { SyncRecord } from '../entities/sync-record.entity';
import { ProgressGoal, ProgressPhoto, ProgressSchedule } from '../entities/progress.entity';
import type { AuthUser } from '../auth/roles.guard';

/** Limits on what a member may upload. The browser compresses before sending. */
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_THUMB_BYTES = 400 * 1024;
const MAX_PHOTOS_PER_MEASUREMENT = 5;

/** Measurements a goal can be set for. */
export const GOAL_METRICS = ['weight', 'body_fat_percent', 'muscle_mass', 'bmi'];
/** How often a member can be asked to come for a check. */
export const CHECK_INTERVALS = [7, 14, 28, 30];

const METRIC_FIELDS = [
  'weight',
  'bmi',
  'bodyFatPercent',
  'heartRate',
  'muscleMass',
  'leanBodyMass',
  'boneMass',
  'skeletalMuscleMass',
  'visceralFat',
  'subcutaneousFatPercent',
  'proteinPercent',
  'bmr',
  'bodyAge',
] as const;

/** What the bytes are, from their first bytes rather than what the sender claims. */
function sniffImage(bytes: Buffer): 'image/jpeg' | 'image/webp' | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

function decode(data: string, max: number, what: string): Buffer {
  const base64 = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) throw new BadRequestException(`The ${what} is empty`);
  if (bytes.length > max) throw new BadRequestException(`The ${what} is too large`);
  return bytes;
}

export interface Viewer extends AuthUser {}

/**
 * Progress on the website: measurements (synced from the gym app), photos members
 * attach to them, goals and check reminders. Who sees what:
 * - a member: their own everything;
 * - a trainer: their assigned clients, and only the photos the member shared with them;
 * - admins and managers: everyone, and only the photos shared with staff.
 */
@Injectable()
export class ProgressService {
  private readonly uploadDir: string;

  constructor(
    @InjectRepository(Member) private readonly members: Repository<Member>,
    @InjectRepository(HealthMetric) private readonly metrics: Repository<HealthMetric>,
    @InjectRepository(SyncRecord) private readonly records: Repository<SyncRecord>,
    @InjectRepository(ProgressPhoto) private readonly photos: Repository<ProgressPhoto>,
    @InjectRepository(ProgressGoal) private readonly goals: Repository<ProgressGoal>,
    @InjectRepository(ProgressSchedule) private readonly schedules: Repository<ProgressSchedule>,
    config: ConfigService,
  ) {
    this.uploadDir = path.resolve(config.get<string>('UPLOAD_DIR') || path.join(process.cwd(), 'uploads'));
  }

  /** The member a viewer may see, by website member id ('me' for a member's own). */
  async memberFor(viewer: Viewer, memberId: number | 'me'): Promise<Member> {
    if (memberId === 'me' || viewer.role === 'member') {
      if (viewer.role !== 'member' || viewer.memberLocalId == null) throw new ForbiddenException();
      const own = await this.members.findOne({ where: { localId: viewer.memberLocalId } });
      if (!own || (memberId !== 'me' && own.id !== memberId)) throw new NotFoundException('Member not found');
      return own;
    }
    const member = await this.members.findOne({ where: { id: memberId } });
    if (!member) throw new NotFoundException('Member not found');
    if (viewer.role === 'trainer') {
      // Not 403: a trainer cannot probe which ids exist.
      if (viewer.staffLocalId == null || member.trainerStaffLocalId !== viewer.staffLocalId) {
        throw new NotFoundException('Member not found');
      }
    } else if (viewer.role !== 'admin' && viewer.role !== 'manager') {
      throw new ForbiddenException();
    }
    return member;
  }

  private canSeePhoto(viewer: Viewer, member: Member, photo: ProgressPhoto): boolean {
    if (viewer.role === 'member') return viewer.memberLocalId === photo.memberLocalId;
    if (viewer.role === 'trainer') {
      return photo.visibleToTrainer && viewer.staffLocalId != null && member.trainerStaffLocalId === viewer.staffLocalId;
    }
    return (viewer.role === 'admin' || viewer.role === 'manager') && photo.visibleToStaff;
  }

  /** Everything the progress page shows, filtered to what this viewer may see. */
  async progress(viewer: Viewer, memberId: number | 'me') {
    const member = await this.memberFor(viewer, memberId);
    const [rows, photos, goals, schedule, standards] = await Promise.all([
      this.metrics.find({ where: { memberLocalId: member.localId }, order: { measuredAt: 'ASC' }, take: 500 }),
      this.photos.find({ where: { memberLocalId: member.localId }, order: { createdAt: 'ASC' } }),
      this.goals.find({ where: { memberLocalId: member.localId } }),
      this.schedules.findOne({ where: { memberLocalId: member.localId } }),
      this.records.find({ where: { entity: 'health_metric_standards' } }),
    ]);
    const last = rows.at(-1)?.measuredAt ?? null;
    const nextDue =
      schedule && last ? new Date(last.getTime() + schedule.intervalDays * 86_400_000).toISOString() : null;
    return {
      member: { id: member.id, fullName: member.fullName, gender: member.gender ?? null, age: member.age ?? null },
      measurements: rows.map((m) => ({
        id: m.id,
        measuredAt: m.measuredAt.toISOString(),
        bodyType: m.bodyType,
        ...Object.fromEntries(METRIC_FIELDS.map((f) => [f, m[f] == null ? null : Number(m[f])])),
      })),
      photos: photos
        .filter((p) => this.canSeePhoto(viewer, member, p))
        .map((p) => ({
          id: p.id,
          healthMetricId: p.healthMetricId,
          createdAt: p.createdAt.toISOString(),
          // Only the member sees and changes who it is shared with.
          ...(viewer.role === 'member' ? { visibleToTrainer: p.visibleToTrainer, visibleToStaff: p.visibleToStaff } : {}),
        })),
      goals: goals.map((g) => ({ metric: g.metric, target: g.target, setByName: g.setByName })),
      schedule: schedule ? { intervalDays: schedule.intervalDays, setByName: schedule.setByName, nextDue } : null,
      standards: standards.map((r) => r.data),
      canSetSchedule: viewer.role !== 'member',
    };
  }

  async setGoal(viewer: Viewer, memberId: number | 'me', metric: string, target: number | null) {
    if (!GOAL_METRICS.includes(metric)) throw new BadRequestException('Goals can be set for weight, body fat, muscle mass or BMI');
    const member = await this.memberFor(viewer, memberId);
    if (target == null) {
      await this.goals.delete({ memberLocalId: member.localId, metric });
      return { metric, target: null };
    }
    if (!Number.isFinite(target) || target <= 0 || target > 1000) throw new BadRequestException('Enter a sensible target');
    await this.goals.upsert(
      { memberLocalId: member.localId, metric, target, setById: viewer.id, setByName: viewer.name },
      ['memberLocalId', 'metric'],
    );
    return { metric, target };
  }

  async setSchedule(viewer: Viewer, memberId: number, intervalDays: number | null) {
    if (viewer.role === 'member') throw new ForbiddenException('Your trainer or the gym sets this');
    const member = await this.memberFor(viewer, memberId);
    if (intervalDays == null) {
      await this.schedules.delete({ memberLocalId: member.localId });
      return { intervalDays: null };
    }
    if (!CHECK_INTERVALS.includes(intervalDays)) throw new BadRequestException('Choose every 1, 2 or 4 weeks, or monthly');
    await this.schedules.upsert(
      { memberLocalId: member.localId, intervalDays, setById: viewer.id, setByName: viewer.name },
      ['memberLocalId'],
    );
    return { intervalDays };
  }

  // ---- Photos -----------------------------------------------------------------

  async addPhoto(
    viewer: Viewer,
    input: { healthMetricId: number; image: string; thumb: string; visibleToTrainer: boolean; visibleToStaff: boolean },
  ) {
    const member = await this.memberFor(viewer, 'me');
    const metric = await this.metrics.findOne({ where: { id: input.healthMetricId, memberLocalId: member.localId } });
    if (!metric) throw new NotFoundException('Measurement not found');
    const count = await this.photos.count({ where: { healthMetricId: metric.id } });
    if (count >= MAX_PHOTOS_PER_MEASUREMENT) {
      throw new BadRequestException(`Up to ${MAX_PHOTOS_PER_MEASUREMENT} photos per measurement`);
    }
    const image = decode(input.image, MAX_PHOTO_BYTES, 'photo');
    const thumb = decode(input.thumb, MAX_THUMB_BYTES, 'thumbnail');
    const mime = sniffImage(image);
    if (!mime || !sniffImage(thumb)) throw new BadRequestException('Only JPEG or WebP photos are accepted');
    const ext = mime === 'image/webp' ? 'webp' : 'jpg';
    const id = randomUUID();
    const dir = path.join('progress', String(member.localId));
    await fs.mkdir(path.join(this.uploadDir, dir), { recursive: true });
    const filePath = path.join(dir, `${id}.${ext}`);
    const thumbPath = path.join(dir, `${id}.thumb.${ext}`);
    await fs.writeFile(path.join(this.uploadDir, filePath), image);
    await fs.writeFile(path.join(this.uploadDir, thumbPath), thumb);
    const saved = await this.photos.save(
      this.photos.create({
        memberLocalId: member.localId,
        healthMetricId: metric.id,
        filePath,
        thumbPath,
        mimeType: mime,
        sizeBytes: image.length,
        visibleToTrainer: input.visibleToTrainer,
        visibleToStaff: input.visibleToStaff,
      }),
    );
    return { id: saved.id };
  }

  async setPhotoVisibility(viewer: Viewer, id: number, visibleToTrainer: boolean, visibleToStaff: boolean) {
    const photo = await this.ownPhoto(viewer, id);
    photo.visibleToTrainer = visibleToTrainer;
    photo.visibleToStaff = visibleToStaff;
    await this.photos.save(photo);
    return { id, visibleToTrainer, visibleToStaff };
  }

  async deletePhoto(viewer: Viewer, id: number): Promise<void> {
    const photo = await this.ownPhoto(viewer, id);
    await this.photos.delete(photo.id);
    for (const p of [photo.filePath, photo.thumbPath]) {
      await fs.unlink(path.join(this.uploadDir, p)).catch(() => undefined);
    }
  }

  private async ownPhoto(viewer: Viewer, id: number): Promise<ProgressPhoto> {
    const photo = await this.photos.findOne({ where: { id } });
    if (!photo || viewer.role !== 'member' || photo.memberLocalId !== viewer.memberLocalId) {
      throw new NotFoundException('Photo not found');
    }
    return photo;
  }

  /** The file of a photo this viewer may see. */
  async photoFile(viewer: Viewer, id: number, size: 'full' | 'thumb'): Promise<{ path: string; mimeType: string }> {
    const photo = await this.photos.findOne({ where: { id } });
    if (!photo) throw new NotFoundException('Photo not found');
    const member = await this.members.findOne({ where: { localId: photo.memberLocalId } });
    if (!member || !this.canSeePhoto(viewer, member, photo)) throw new NotFoundException('Photo not found');
    const full = path.resolve(this.uploadDir, size === 'thumb' ? photo.thumbPath : photo.filePath);
    // Paths are ours, but never serve anything outside the upload folder.
    if (!full.startsWith(this.uploadDir + path.sep)) throw new NotFoundException('Photo not found');
    return { path: full, mimeType: photo.mimeType };
  }

  // ---- Reminders ----------------------------------------------------------------

  /**
   * Members whose next progress check falls on or before `today` (a gym-calendar date),
   * with their trainer: for the daily reminders.
   */
  async dueChecks(timeZone: string): Promise<
    { memberLocalId: number; fullName: string; trainerStaffLocalId: number | null; dueDate: string }[]
  > {
    const rows: { memberLocalId: number; fullName: string; trainerStaffLocalId: number | null; dueDate: string }[] =
      await this.schedules.query(
        `SELECT s."memberLocalId", m."fullName", m."trainerStaffLocalId",
                to_char(((last.at AT TIME ZONE $1)::date + s."intervalDays"), 'YYYY-MM-DD') AS "dueDate"
           FROM progress_schedule s
           JOIN member m ON m."localId" = s."memberLocalId" AND m."deletedAt" IS NULL AND m.status = 'active'
           JOIN LATERAL (SELECT MAX(h."measuredAt") AS at FROM health_metric h
                          WHERE h."memberLocalId" = s."memberLocalId" AND h."deletedAt" IS NULL) last ON last.at IS NOT NULL
          WHERE (last.at AT TIME ZONE $1)::date + s."intervalDays" <= (now() AT TIME ZONE $1)::date`,
        [timeZone],
      );
    return rows;
  }

}
