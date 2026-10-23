import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { Member } from '../entities/member.entity';
import { Attendance } from '../entities/attendance.entity';
import { Transaction } from '../entities/transaction.entity';
import { HealthMetric } from '../entities/health-metric.entity';
import { Staff } from '../entities/staff.entity';
import { StaffAttendance } from '../entities/staff-attendance.entity';
import { MembersService } from '../members/members.service';
import { RecordsService } from '../records/records.service';
import type { AuthUser } from '../auth/roles.guard';

const DAY_MS = 86_400_000;

export interface PageQuery {
  page?: number;
  limit?: number;
}

/** What a trainer or the member themself sees about a membership. */
export interface MembershipSummary {
  id: number;
  fullName: string;
  profileImageUrl: string | null;
  plan: string | null;
  planCategory: string | null;
  status: string;
  subscriptionStatus: string;
  startDate: string;
  endDate: string;
  /** Whole days left until endDate (0 once it has passed). */
  daysRemaining: number;
  isFrozen: boolean;
  frozenStartDate: string | null;
  frozenUntilDate: string | null;
  visitsUsed: number;
  visitsAllowed: number | null;
  goals: string | null;
  objective: string | null;
}

function page(query: PageQuery) {
  const p = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  return { page: p, limit, skip: (p - 1) * limit };
}

/**
 * Read-only data for the trainer and member portals. Every query is scoped by the
 * desktop id on the signed-in account (never by a request parameter), so a trainer
 * sees only members assigned to them and a member only themself.
 */
@Injectable()
export class PortalService {
  constructor(
    @InjectRepository(Member) private members: Repository<Member>,
    @InjectRepository(Attendance) private attendance: Repository<Attendance>,
    @InjectRepository(Transaction)
    private transactions: Repository<Transaction>,
    @InjectRepository(HealthMetric)
    private healthMetrics: Repository<HealthMetric>,
    @InjectRepository(Staff) private staff: Repository<Staff>,
    @InjectRepository(StaffAttendance)
    private staffAttendance: Repository<StaffAttendance>,
    private membersService: MembersService,
    private recordsService: RecordsService,
  ) {}

  // ---- Member portal -------------------------------------------------------

  async myMembership(user: AuthUser) {
    const member = await this.ownMember(user);
    const trainer =
      member.trainerStaffLocalId != null
        ? await this.staff.findOne({
            where: { localId: member.trainerStaffLocalId },
          })
        : null;
    return {
      ...this.summary(member),
      phone: member.phoneNumber,
      email: member.email,
      memberSince: member.firstRegisteredAt.toISOString(),
      frozenReason: member.frozenReason,
      trainer: trainer ? { fullName: trainer.fullName } : null,
    };
  }

  async myAttendance(user: AuthUser, query: PageQuery) {
    const member = await this.ownMember(user);
    return this.attendanceFor(member.id, query);
  }

  /** Plan periods, freezes and payments, newest first. */
  async myHistory(user: AuthUser) {
    const member = await this.ownMember(user);
    const [details, payments] = await Promise.all([
      this.membersService.getDetails(member),
      this.transactions.find({
        where: { memberId: member.id },
        relations: ['service'],
        order: { transactionDate: 'DESC' },
        take: 200,
      }),
    ]);
    return {
      planHistory: details.planHistory,
      freezeHistory: details.freezeHistory,
      payments: payments.map((t) => ({
        id: t.id,
        date: t.transactionDate,
        amount: Number(t.amount),
        type: t.transactionType,
        description: t.description,
        plan: t.service?.name ?? null,
        periodStart: t.subscriptionPeriodStart,
        periodEnd: t.subscriptionPeriodEnd,
        paymentStatus: t.paymentStatus,
      })),
    };
  }

  // ---- Trainer portal ------------------------------------------------------

  async assignedMembers(
    user: AuthUser,
    query: PageQuery & { search?: string },
  ) {
    const staffLocalId = this.requireStaff(user);
    const { page: p, limit, skip } = page(query);
    const qb = this.members
      .createQueryBuilder('member')
      .leftJoinAndSelect('member.service', 'service')
      .where('member.trainerStaffLocalId = :staffLocalId', { staffLocalId });
    if (query.search) {
      qb.andWhere('member.fullName ILIKE :search', {
        search: `%${query.search}%`,
      });
    }
    const [rows, total] = await qb
      .orderBy('member.fullName', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();
    return {
      data: rows.map((m) => this.summary(m)),
      total,
      page: p,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async assignedStats(user: AuthUser) {
    const staffLocalId = this.requireStaff(user);
    const members = await this.members.find({
      where: { trainerStaffLocalId: staffLocalId },
    });
    const summaries = members.map((m) => this.summary(m));
    const todayStart = startOfUtcDay(new Date());
    const checkedInToday = members.length
      ? await this.attendance
          .createQueryBuilder('a')
          .innerJoin('a.member', 'member')
          .where('member.trainerStaffLocalId = :staffLocalId', { staffLocalId })
          .andWhere('a.date >= :todayStart', { todayStart })
          .getCount()
      : 0;
    return {
      assigned: members.length,
      active: summaries.filter((s) => s.daysRemaining > 0 && !s.isFrozen)
        .length,
      frozen: summaries.filter((s) => s.isFrozen).length,
      expiringIn7Days: summaries.filter(
        (s) => s.daysRemaining > 0 && s.daysRemaining <= 7,
      ).length,
      expired: summaries.filter((s) => s.daysRemaining === 0).length,
      checkedInToday,
    };
  }

  /** Limited profile: no phone, email, card, payments or desk remarks. */
  async assignedMember(user: AuthUser, memberId: number) {
    const member = await this.assigned(user, memberId);
    const [details, metrics] = await Promise.all([
      this.membersService.getDetails(member),
      this.healthMetrics.find({
        where: { memberId: member.id },
        order: { measuredAt: 'DESC' },
        take: 20,
      }),
    ]);
    return {
      ...this.summary(member),
      gender: member.gender,
      age: member.age,
      height: member.height,
      freezeHistory: details.freezeHistory,
      planHistory: details.planHistory,
      healthMetrics: metrics.map((h) => ({
        id: h.id,
        measuredAt: h.measuredAt,
        weight: h.weight,
        bmi: h.bmi,
        bodyFatPercent: h.bodyFatPercent,
        muscleMass: h.muscleMass,
        heartRate: h.heartRate,
        visceralFat: h.visceralFat,
      })),
    };
  }

  async assignedMemberAttendance(
    user: AuthUser,
    memberId: number,
    query: PageQuery,
  ) {
    const member = await this.assigned(user, memberId);
    return this.attendanceFor(member.id, query);
  }

  async todayCheckIns(user: AuthUser) {
    const staffLocalId = this.requireStaff(user);
    const rows = await this.attendance
      .createQueryBuilder('a')
      .innerJoinAndSelect('a.member', 'member')
      .where('member.trainerStaffLocalId = :staffLocalId', { staffLocalId })
      .andWhere('a.date >= :todayStart', {
        todayStart: startOfUtcDay(new Date()),
      })
      .orderBy('a.date', 'DESC')
      .getMany();
    return rows.map((a) => ({
      memberId: a.memberId,
      memberName: a.member.fullName,
      checkInTime: a.date,
    }));
  }

  /** The gym's active weekly timetables, with this trainer's own sessions marked. */
  async schedule(user: AuthUser) {
    const staffLocalId = this.requireStaff(user);
    const [schedules, items] = await Promise.all([
      this.recordsService.list('schedule', { limit: 100 }),
      this.recordsService.list('schedule_item', { limit: 500 }),
    ]);
    const active = schedules.data.filter(
      (s) => s['is_active'] == null || truthy(s['is_active']),
    );
    const activeIds = new Set(active.map((s) => s.id));
    return {
      schedules: active.map((s) => ({
        id: s.id,
        name: str(s['name']),
        isMain: truthy(s['is_main']),
      })),
      sessions: items.data
        .filter((i) => activeIds.has(num(i['schedule_id']) ?? -1))
        .map((i) => ({
          id: i.id,
          scheduleId: num(i['schedule_id']),
          dayOfWeek: num(i['day_of_week']),
          title: str(i['title']),
          startTime: str(i['start_time']),
          endTime: str(i['end_time']),
          room: str(i['room']),
          color: str(i['color']),
          isMine: num(i['staff_id']) === staffLocalId,
        }))
        .sort(
          (a, b) =>
            (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0) ||
            (str(a.startTime) ?? '').localeCompare(str(b.startTime) ?? ''),
        ),
    };
  }

  /** The trainer's own check-ins, last 60 days. */
  async myStaffAttendance(user: AuthUser) {
    const staffLocalId = this.requireStaff(user);
    const since = new Date(Date.now() - 60 * DAY_MS);
    const rows = await this.staffAttendance.find({
      where: { staffLocalId, scannedAt: MoreThanOrEqual(since) },
      order: { scannedAt: 'DESC' },
    });
    return rows.map((r) => ({ id: r.id, scannedAt: r.scannedAt }));
  }

  // ---- helpers -------------------------------------------------------------

  private summary(m: Member): MembershipSummary {
    const end = m.subscriptionEndDate;
    return {
      id: m.id,
      fullName: m.fullName,
      profileImageUrl: m.profileImageUrl,
      plan: m.service?.name ?? null,
      planCategory: m.service?.category ?? null,
      status: m.status,
      subscriptionStatus: m.subscriptionStatus,
      startDate: m.subscriptionStartDate.toISOString(),
      endDate: end.toISOString(),
      daysRemaining: Math.max(
        0,
        Math.ceil((end.getTime() - Date.now()) / DAY_MS),
      ),
      isFrozen: m.frozen > 0 || m.status === 'frozen',
      frozenStartDate: m.frozenStartDate?.toISOString() ?? null,
      frozenUntilDate: m.frozenUntilDate?.toISOString() ?? null,
      visitsUsed: m.subscriptionUsedCount,
      visitsAllowed: m.service?.maxUsageCount ?? null,
      goals: m.goals,
      objective: m.objective,
    };
  }

  private async attendanceFor(memberId: number, query: PageQuery) {
    const { page: p, limit, skip } = page(query);
    const [rows, total] = await this.attendance.findAndCount({
      where: { memberId },
      order: { date: 'DESC' },
      skip,
      take: limit,
    });
    return {
      data: rows.map((a) => ({ id: a.id, date: a.date })),
      total,
      page: p,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async ownMember(user: AuthUser): Promise<Member> {
    const member =
      user.memberLocalId != null
        ? await this.members.findOne({
            where: { localId: user.memberLocalId },
            relations: ['service'],
          })
        : null;
    if (!member)
      throw new NotFoundException('No membership is linked to this account');
    return member;
  }

  /** A member assigned to the signed-in trainer, or 404 (not 403, so ids are not probed). */
  private async assigned(user: AuthUser, memberId: number): Promise<Member> {
    const staffLocalId = this.requireStaff(user);
    const member = await this.members.findOne({
      where: { id: memberId, trainerStaffLocalId: staffLocalId },
      relations: ['service'],
    });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  private requireStaff(user: AuthUser): number {
    if (user.staffLocalId == null)
      throw new NotFoundException('No staff record is linked to this account');
    return user.staffLocalId;
  }
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true';
}
