import { ApiProperty } from '@nestjs/swagger';

export class DashboardOverviewDto {
  @ApiProperty({ example: 150, description: 'Total number of members' })
  totalMembers: number;

  @ApiProperty({ example: 100, description: 'Active members' })
  activeMembers: number;

  @ApiProperty({ example: 10, description: 'Total number of services' })
  totalServices: number;

  @ApiProperty({ example: 45, description: 'Attendance today' })
  attendanceToday: number;

  @ApiProperty({ example: 125000.00, description: 'Total revenue (all time); null for managers', nullable: true })
  totalRevenue: number | null;

  @ApiProperty({ example: 45000.00, description: 'Revenue this month; null for managers', nullable: true })
  revenueThisMonth: number | null;

  @ApiProperty({ example: 5, description: 'New members this month' })
  newMembersThisMonth: number;

  @ApiProperty({ example: 38.5, description: 'Average daily attendance (last 30 days)' })
  averageDailyAttendance: number;
}

export class RevenueBreakdownDto {
  @ApiProperty({ example: 45000.00, description: 'Revenue this month' })
  thisMonth: number;

  @ApiProperty({ example: 42000.00, description: 'Revenue last month' })
  lastMonth: number;

  @ApiProperty({ example: 7.14, description: 'Month-over-month growth percentage' })
  monthOverMonthGrowth: number;

  @ApiProperty({ example: 125000.00, description: 'Revenue this year' })
  thisYear: number;

  @ApiProperty({
    example: [
      { month: '2026-01', revenue: 45000 },
      { month: '2025-12', revenue: 42000 },
    ],
    description: 'Monthly revenue breakdown',
  })
  byMonth: { month: string; revenue: number }[];

  @ApiProperty({
    example: [
      { date: '2026-01-12', revenue: 5000 },
      { date: '2026-01-11', revenue: 3500 },
    ],
    description: 'Daily revenue for last 7 days',
  })
  last7Days: { date: string; revenue: number }[];

  @ApiProperty({
    example: [
      { category: 'Exercise', revenue: 45000 },
      { category: 'Wellness', revenue: 12000 },
    ],
    description: 'Revenue breakdown by service category',
  })
  byCategory: { category: string; revenue: number }[];
}

export class AttendanceTrendsDto {
  @ApiProperty({ example: 45, description: 'Attendance today' })
  today: number;

  @ApiProperty({ example: 280, description: 'Attendance this week' })
  thisWeek: number;

  @ApiProperty({ example: 1200, description: 'Attendance this month' })
  thisMonth: number;

  @ApiProperty({ example: 38.5, description: 'Average daily attendance' })
  averageDaily: number;

  @ApiProperty({
    example: [
      { date: '2026-01-12', count: 45 },
      { date: '2026-01-11', count: 52 },
    ],
    description: 'Daily attendance for last 30 days',
  })
  last30Days: { date: string; count: number }[];

  @ApiProperty({
    example: [
      { dayOfWeek: 'Monday', average: 42 },
      { dayOfWeek: 'Tuesday', average: 38 },
    ],
    description: 'Average attendance by day of week',
  })
  byDayOfWeek: { dayOfWeek: string; average: number }[];
}

export class MemberGrowthDto {
  @ApiProperty({ example: 150, description: 'Total members' })
  total: number;

  @ApiProperty({ example: 5, description: 'New members this month' })
  newThisMonth: number;

  @ApiProperty({ example: 8, description: 'New members last month' })
  newLastMonth: number;

  @ApiProperty({ example: -37.5, description: 'Month-over-month growth percentage' })
  monthOverMonthGrowth: number;

  @ApiProperty({
    example: [
      { month: '2026-01', newMembers: 5, totalAtEndOfMonth: 150 },
      { month: '2025-12', newMembers: 8, totalAtEndOfMonth: 145 },
    ],
    description: 'Member growth by month',
  })
  byMonth: { month: string; newMembers: number; totalAtEndOfMonth: number }[];
}









