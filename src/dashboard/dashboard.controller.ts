import { Controller, Get, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import {
  DashboardOverviewDto,
  RevenueBreakdownDto,
  AttendanceTrendsDto,
  MemberGrowthDto,
} from './dto/dashboard-stats.dto';
import { Auth } from '../auth/auth.decorator';
import type { AuthUser } from '../auth/roles.guard';

@ApiTags('dashboard')
@Controller('api/dashboard')
@Auth('admin', 'manager')
@ApiBearerAuth('bearer')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Get dashboard overview',
    description: 'Returns key metrics for the dashboard including members, revenue, and attendance',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard overview statistics',
    type: DashboardOverviewDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getOverview(@Request() req: { user: AuthUser }): Promise<DashboardOverviewDto> {
    const overview = await this.dashboardService.getOverview();
    // Money is admin-only: managers get the same overview without the revenue totals.
    if (req.user.role !== 'admin') {
      return { ...overview, totalRevenue: null, revenueThisMonth: null };
    }
    return overview;
  }

  @Get('revenue')
  @Auth('admin')
  @ApiOperation({
    summary: 'Get revenue breakdown',
    description: 'Returns detailed revenue statistics including trends and comparisons',
  })
  @ApiResponse({
    status: 200,
    description: 'Revenue breakdown',
    type: RevenueBreakdownDto,
  })
  async getRevenue(): Promise<RevenueBreakdownDto> {
    return this.dashboardService.getRevenue();
  }

  @Get('attendance-trends')
  @ApiOperation({
    summary: 'Get attendance trends',
    description: 'Returns attendance statistics and trends over time',
  })
  @ApiResponse({
    status: 200,
    description: 'Attendance trends',
    type: AttendanceTrendsDto,
  })
  async getAttendanceTrends(): Promise<AttendanceTrendsDto> {
    return this.dashboardService.getAttendanceTrends();
  }

  @Get('member-growth')
  @ApiOperation({
    summary: 'Get member growth',
    description: 'Returns member registration trends and growth statistics',
  })
  @ApiResponse({
    status: 200,
    description: 'Member growth statistics',
    type: MemberGrowthDto,
  })
  async getMemberGrowth(): Promise<MemberGrowthDto> {
    return this.dashboardService.getMemberGrowth();
  }
}















