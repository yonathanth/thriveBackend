import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { StaffQueryDto } from './dto/staff-query.dto';
import { Auth } from '../auth/auth.decorator';
import { PaginatedResponseDto } from '../common/dto/pagination.dto';
import { Staff } from '../entities/staff.entity';
import { StaffAttendance } from '../entities/staff-attendance.entity';

@ApiTags('staff')
@Controller('api/staff')
@Auth('admin', 'manager')
@ApiBearerAuth('bearer')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @ApiOperation({
    summary: 'List all staff',
    description: 'Returns a paginated list of staff with optional search',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of staff' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@Query() query: StaffQueryDto): Promise<PaginatedResponseDto<Staff>> {
    return this.staffService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get staff by ID',
    description: 'Returns a single staff by database ID',
  })
  @ApiParam({ name: 'id', description: 'Staff ID', example: 1 })
  @ApiResponse({ status: 200, description: 'Staff found' })
  @ApiResponse({ status: 404, description: 'Staff not found' })
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Staff> {
    const staff = await this.staffService.findOne(id);
    if (!staff) {
      throw new NotFoundException(`Staff with ID ${id} not found`);
    }
    return staff;
  }

  @Get(':id/attendance')
  @ApiOperation({
    summary: 'Get staff attendance history',
    description: 'Returns attendance records for a staff member in a date range',
  })
  @ApiParam({ name: 'id', description: 'Staff ID', example: 1 })
  @ApiQuery({ name: 'fromDate', description: 'Start date (YYYY-MM-DD)', example: '2026-01-01' })
  @ApiQuery({ name: 'toDate', description: 'End date (YYYY-MM-DD)', example: '2026-01-31' })
  @ApiResponse({ status: 200, description: 'Staff attendance list' })
  @ApiResponse({ status: 404, description: 'Staff not found' })
  async getAttendanceByStaff(
    @Param('id', ParseIntPipe) id: number,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ): Promise<StaffAttendance[]> {
    const staff = await this.staffService.findOne(id);
    if (!staff) {
      throw new NotFoundException(`Staff with ID ${id} not found`);
    }
    const from = fromDate || new Date().toISOString().slice(0, 10);
    const to = toDate || new Date().toISOString().slice(0, 10);
    return this.staffService.findAttendanceByStaff(id, from, to);
  }
}
