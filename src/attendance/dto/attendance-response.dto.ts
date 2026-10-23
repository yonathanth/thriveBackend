import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AttendanceResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 5, description: 'Local ID from desktop app' })
  localId: number;

  @ApiProperty({ example: 1 })
  memberId: number;

  @ApiPropertyOptional({ description: 'Member details if loaded' })
  member?: {
    id: number;
    fullName: string;
    phoneNumber: string;
  };

  @ApiProperty({ example: '2026-01-12T08:30:00.000Z' })
  date: string;

  @ApiProperty({ example: '2026-01-12T00:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-01-12T00:00:00.000Z' })
  updatedAt: string;
}

export class AttendanceStatsDto {
  @ApiProperty({ example: 1500, description: 'Total attendance records' })
  total: number;

  @ApiProperty({ example: 45, description: 'Check-ins today' })
  today: number;

  @ApiProperty({ example: 280, description: 'Check-ins this week' })
  thisWeek: number;

  @ApiProperty({ example: 1200, description: 'Check-ins this month' })
  thisMonth: number;

  @ApiProperty({ example: 38.5, description: 'Average daily attendance' })
  averageDaily: number;

  @ApiProperty({
    example: [
      { date: '2026-01-12', count: 45 },
      { date: '2026-01-11', count: 52 },
    ],
    description: 'Attendance for the last 7 days',
  })
  last7Days: { date: string; count: number }[];
}

export class TodayAttendanceDto {
  @ApiProperty({ example: 45, description: 'Total check-ins today' })
  count: number;

  @ApiProperty({
    description: 'List of members who checked in today',
  })
  checkIns: {
    id: number;
    memberId: number;
    memberName: string;
    checkInTime: string;
  }[];
}















