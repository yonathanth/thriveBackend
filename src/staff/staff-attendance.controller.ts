import {
  Controller,
  Get,
  Query,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { Auth } from '../auth/auth.decorator';
import type { AuthUser } from '../auth/roles.guard';
import { RequirePermission } from '../auth/permissions';
import { redactStaff } from '../auth/redact';
import { StaffAttendance } from '../entities/staff-attendance.entity';

@ApiTags('staff-attendance')
@Controller('api/staff-attendance')
@Auth('admin', 'manager')
@RequirePermission('staff.view')
@ApiBearerAuth('bearer')
export class StaffAttendanceController {
  constructor(private readonly staffService: StaffService) {}

  @Get('by-date')
  @ApiOperation({
    summary: 'Get staff attendance by date',
    description: 'Returns all staff check-ins for a given date (daily log)',
  })
  @ApiQuery({ name: 'date', description: 'Date (YYYY-MM-DD)', example: '2026-02-14' })
  @ApiResponse({ status: 200, description: 'Staff attendance for the date' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getByDate(
    @Query('date') date: string,
    @Request() req: { user: AuthUser },
  ): Promise<StaffAttendance[]> {
    const dateStr = date || new Date().toISOString().slice(0, 10);
    const rows = await this.staffService.findByDate(dateStr);
    return rows.map((r) => (r.staff ? { ...r, staff: redactStaff(req.user, r.staff) } : r));
  }
}
