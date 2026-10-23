import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, Between, LessThan } from 'typeorm';
import { Member } from '../entities/member.entity';
import { Service } from '../entities/service.entity';
import { Attendance } from '../entities/attendance.entity';
import { Transaction } from '../entities/transaction.entity';
import { paidIncome, revenueSource } from '../common/finance';
import {
  DashboardOverviewDto,
  RevenueBreakdownDto,
  AttendanceTrendsDto,
  MemberGrowthDto,
} from './dto/dashboard-stats.dto';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Member)
    private memberRepository: Repository<Member>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(Attendance)
    private attendanceRepository: Repository<Attendance>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
  ) {}

  async getOverview(): Promise<DashboardOverviewDto> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalMembers,
      activeMembers,
      totalServices,
      attendanceToday,
      newMembersThisMonth,
      last30DaysAttendance,
    ] = await Promise.all([
      this.memberRepository.count(),
      this.memberRepository.count({ where: { status: 'active' } }),
      this.serviceRepository.count({ where: { status: 'active' } }),
      this.attendanceRepository.count({
        where: { date: Between(today, tomorrow) },
      }),
      this.memberRepository.count({
        where: { firstRegisteredAt: MoreThanOrEqual(startOfMonth) },
      }),
      this.attendanceRepository.count({
        where: { date: MoreThanOrEqual(thirtyDaysAgo) },
      }),
    ]);

    // Get revenue
    const totalRevenueResult = await this.transactionRepository
      .createQueryBuilder('t')
      .select('SUM(t.amount)', 'total')
      .where(paidIncome('t'))
      .getRawOne();

    const revenueThisMonthResult = await this.transactionRepository
      .createQueryBuilder('t')
      .select('SUM(t.amount)', 'total')
      .where(paidIncome('t'))
      .andWhere('t.transactionDate >= :startOfMonth', { startOfMonth })
      .getRawOne();

    return {
      totalMembers,
      activeMembers,
      totalServices,
      attendanceToday,
      totalRevenue: parseFloat(totalRevenueResult?.total || '0'),
      revenueThisMonth: parseFloat(revenueThisMonthResult?.total || '0'),
      newMembersThisMonth,
      averageDailyAttendance: Math.round((last30DaysAttendance / 30) * 10) / 10,
    };
  }

  async getRevenue(): Promise<RevenueBreakdownDto> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // This month revenue
    const thisMonthResult = await this.transactionRepository
      .createQueryBuilder('t')
      .select('SUM(t.amount)', 'total')
      .where(paidIncome('t'))
      .andWhere('t.transactionDate >= :start', { start: startOfMonth })
      .getRawOne();

    // Last month revenue
    const lastMonthResult = await this.transactionRepository
      .createQueryBuilder('t')
      .select('SUM(t.amount)', 'total')
      .where(paidIncome('t'))
      .andWhere('t.transactionDate >= :start', { start: startOfLastMonth })
      .andWhere('t.transactionDate < :end', { end: startOfMonth })
      .getRawOne();

    // This year revenue
    const thisYearResult = await this.transactionRepository
      .createQueryBuilder('t')
      .select('SUM(t.amount)', 'total')
      .where(paidIncome('t'))
      .andWhere('t.transactionDate >= :start', { start: startOfYear })
      .getRawOne();

    const thisMonth = parseFloat(thisMonthResult?.total || '0');
    const lastMonth = parseFloat(lastMonthResult?.total || '0');
    const thisYear = parseFloat(thisYearResult?.total || '0');

    // Calculate growth
    const monthOverMonthGrowth = lastMonth > 0 
      ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100 * 100) / 100 
      : 0;

    // Last 7 days breakdown
    const last7Days: { date: string; revenue: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const result = await this.transactionRepository
        .createQueryBuilder('t')
        .select('SUM(t.amount)', 'total')
        .where(paidIncome('t'))
        .andWhere('t.transactionDate >= :date', { date })
        .andWhere('t.transactionDate < :nextDate', { nextDate })
        .getRawOne();

      last7Days.push({
        date: date.toISOString().split('T')[0],
        revenue: parseFloat(result?.total || '0'),
      });
    }

    // Monthly breakdown (last 6 months)
    const byMonth: { month: string; revenue: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const result = await this.transactionRepository
        .createQueryBuilder('t')
        .select('SUM(t.amount)', 'total')
        .where(paidIncome('t'))
        .andWhere('t.transactionDate >= :start', { start: monthStart })
        .andWhere('t.transactionDate < :end', { end: monthEnd })
        .getRawOne();

      byMonth.push({
        month: monthStart.toISOString().slice(0, 7),
        revenue: parseFloat(result?.total || '0'),
      });
    }

    // Revenue by source (this month): add-ons and drop-ins by what was sold,
    // memberships by their category, as on the desktop dashboard.
    const categoryRevenue = await this.transactionRepository
      .createQueryBuilder('t')
      .leftJoin('t.service', 's')
      .select(revenueSource('t', 's'), 'category')
      .addSelect('SUM(t.amount)', 'revenue')
      .where(paidIncome('t'))
      .andWhere('t.transactionDate >= :start', { start: startOfMonth })
      .groupBy('1')
      .orderBy('revenue', 'DESC')
      .getRawMany();

    const byCategory = categoryRevenue.map((item) => ({
      category: item.category || 'Uncategorized',
      revenue: parseFloat(item.revenue || '0'),
    }));

    return {
      thisMonth,
      lastMonth,
      monthOverMonthGrowth,
      thisYear,
      byMonth,
      last7Days,
      byCategory,
    };
  }

  async getAttendanceTrends(): Promise<AttendanceTrendsDto> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [todayCount, thisWeek, thisMonth, last30DaysTotal] = await Promise.all([
      this.attendanceRepository.count({ where: { date: Between(today, tomorrow) } }),
      this.attendanceRepository.count({ where: { date: MoreThanOrEqual(startOfWeek) } }),
      this.attendanceRepository.count({ where: { date: MoreThanOrEqual(startOfMonth) } }),
      this.attendanceRepository.count({ where: { date: MoreThanOrEqual(thirtyDaysAgo) } }),
    ]);

    // Last 30 days breakdown
    const last30Days: { date: string; count: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const count = await this.attendanceRepository.count({
        where: { date: Between(date, nextDate) },
      });

      // Use local date string (YYYY-MM-DD) so frontend weekday labels match the actual day
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      last30Days.push({
        date: `${y}-${m}-${d}`,
        count,
      });
    }

    // Average by day of week
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const byDayOfWeek: { dayOfWeek: string; average: number }[] = [];
    
    for (let day = 0; day < 7; day++) {
      const daysWithThisDayOfWeek = last30Days.filter((_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        return d.getDay() === day;
      });
      
      const totalForDay = daysWithThisDayOfWeek.reduce((sum, d) => sum + d.count, 0);
      const average = daysWithThisDayOfWeek.length > 0 
        ? Math.round((totalForDay / daysWithThisDayOfWeek.length) * 10) / 10 
        : 0;

      byDayOfWeek.push({
        dayOfWeek: dayNames[day],
        average,
      });
    }

    return {
      today: todayCount,
      thisWeek,
      thisMonth,
      averageDaily: Math.round((last30DaysTotal / 30) * 10) / 10,
      last30Days,
      byDayOfWeek,
    };
  }

  async getMemberGrowth(): Promise<MemberGrowthDto> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [total, newThisMonth, newLastMonth] = await Promise.all([
      this.memberRepository.count(),
      this.memberRepository.count({
        where: { firstRegisteredAt: MoreThanOrEqual(startOfMonth) },
      }),
      this.memberRepository.count({
        where: {
          firstRegisteredAt: Between(startOfLastMonth, startOfMonth),
        },
      }),
    ]);

    const monthOverMonthGrowth = newLastMonth > 0 
      ? Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 100 * 100) / 100 
      : 0;

    // Monthly breakdown (last 6 months)
    const byMonth: { month: string; newMembers: number; totalAtEndOfMonth: number }[] = [];
    let runningTotal = total;

    for (let i = 0; i < 6; i++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const newMembers = await this.memberRepository.count({
        where: {
          firstRegisteredAt: Between(monthStart, monthEnd),
        },
      });

      byMonth.push({
        month: monthStart.toISOString().slice(0, 7),
        newMembers,
        totalAtEndOfMonth: runningTotal,
      });

      runningTotal -= newMembers;
    }

    return {
      total,
      newThisMonth,
      newLastMonth,
      monthOverMonthGrowth,
      byMonth,
    };
  }
}









