import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Attendance } from '../entities/attendance.entity';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { AttendanceStatsDto, TodayAttendanceDto } from './dto/attendance-response.dto';
import { PaginatedResponseDto, createPaginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance)
    private attendanceRepository: Repository<Attendance>,
  ) {}

  async findAll(query: AttendanceQueryDto): Promise<PaginatedResponseDto<Attendance>> {
    const { page = 1, limit = 20, sortBy = 'date', sortOrder = 'DESC', memberId, date, startDate, endDate } = query;

    const queryBuilder = this.attendanceRepository.createQueryBuilder('attendance')
      .leftJoinAndSelect('attendance.member', 'member');

    // Member filter
    if (memberId) {
      queryBuilder.andWhere('attendance.memberId = :memberId', { memberId });
    }

    // Date filter (specific date) - use UTC to match database timestamptz
    if (date) {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      const dateStart = new Date(Date.UTC(
        dateObj.getUTCFullYear(),
        dateObj.getUTCMonth(),
        dateObj.getUTCDate(),
        0, 0, 0, 0
      ));
      const dateEnd = new Date(Date.UTC(
        dateObj.getUTCFullYear(),
        dateObj.getUTCMonth(),
        dateObj.getUTCDate(),
        23, 59, 59, 999
      ));
      queryBuilder.andWhere('attendance.date BETWEEN :dateStart AND :dateEnd', { dateStart, dateEnd });
    }

    // Date range filter - use UTC to match database timestamptz
    if (startDate && !date) {
      const startDateObj = typeof startDate === 'string' ? new Date(startDate) : startDate;
      const utcStart = new Date(Date.UTC(
        startDateObj.getUTCFullYear(),
        startDateObj.getUTCMonth(),
        startDateObj.getUTCDate(),
        0, 0, 0, 0
      ));
      queryBuilder.andWhere('attendance.date >= :startDate', { startDate: utcStart });
    }
    if (endDate && !date) {
      const endDateObj = typeof endDate === 'string' ? new Date(endDate) : endDate;
      const utcEnd = new Date(Date.UTC(
        endDateObj.getUTCFullYear(),
        endDateObj.getUTCMonth(),
        endDateObj.getUTCDate(),
        23, 59, 59, 999
      ));
      queryBuilder.andWhere('attendance.date <= :endDate', { endDate: utcEnd });
    }

    // Sorting
    const validSortFields = ['date', 'createdAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'date';
    queryBuilder.orderBy(`attendance.${sortField}`, sortOrder);

    // Get total count
    const total = await queryBuilder.getCount();

    // Pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const attendance = await queryBuilder.getMany();

    return createPaginatedResponse(attendance, total, page, limit);
  }

  async findOne(id: number): Promise<Attendance | null> {
    return this.attendanceRepository.findOne({
      where: { id },
      relations: ['member'],
    });
  }

  async findByMember(memberId: number, query: AttendanceQueryDto): Promise<PaginatedResponseDto<Attendance>> {
    return this.findAll({ ...query, memberId });
  }

  async getToday(): Promise<TodayAttendanceDto> {
    const now = new Date();
    // Get today's date in UTC
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const attendanceRecords = await this.attendanceRepository
      .createQueryBuilder('attendance')
      .leftJoinAndSelect('attendance.member', 'member')
      .where('attendance.date >= :today', { today })
      .andWhere('attendance.date < :tomorrow', { tomorrow })
      .orderBy('attendance.date', 'DESC')
      .getMany();

    return {
      count: attendanceRecords.length,
      checkIns: attendanceRecords.map(a => ({
        id: a.id,
        memberId: a.memberId,
        memberName: a.member?.fullName || 'Unknown',
        checkInTime: a.date.toISOString(),
      })),
    };
  }

  async getStats(): Promise<AttendanceStatsDto> {
    const now = new Date();
    // Use UTC dates to match database timestamptz storage
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    
    // Start of week (Sunday = 0)
    const startOfWeek = new Date(today);
    const dayOfWeek = now.getUTCDay();
    startOfWeek.setUTCDate(startOfWeek.getUTCDate() - dayOfWeek);
    
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [total, todayCount, thisWeekCount, thisMonthCount] = await Promise.all([
      this.attendanceRepository.count(),
      this.attendanceRepository.count({
        where: {
          date: Between(today, tomorrow),
        },
      }),
      this.attendanceRepository.count({
        where: {
          date: MoreThanOrEqual(startOfWeek),
        },
      }),
      this.attendanceRepository.count({
        where: {
          date: MoreThanOrEqual(startOfMonth),
        },
      }),
    ]);

    // Get last 7 days breakdown
    const last7Days: { date: string; count: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - i);
      const nextDate = new Date(date);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);

      const count = await this.attendanceRepository.count({
        where: {
          date: Between(date, nextDate),
        },
      });

      last7Days.push({
        date: date.toISOString().split('T')[0],
        count,
      });
    }

    // Calculate average daily (last 30 days)
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const last30DaysCount = await this.attendanceRepository.count({
      where: {
        date: MoreThanOrEqual(thirtyDaysAgo),
      },
    });
    const averageDaily = Math.round((last30DaysCount / 30) * 10) / 10;

    return {
      total,
      today: todayCount,
      thisWeek: thisWeekCount,
      thisMonth: thisMonthCount,
      averageDaily,
      last7Days,
    };
  }
}










