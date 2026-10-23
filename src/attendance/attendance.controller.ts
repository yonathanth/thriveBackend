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
} from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { AttendanceResponseDto, AttendanceStatsDto, TodayAttendanceDto } from './dto/attendance-response.dto';
import { Auth } from '../auth/auth.decorator';
import { PaginatedResponseDto } from '../common/dto/pagination.dto';
import { Attendance } from '../entities/attendance.entity';

@ApiTags('attendance')
@Controller('api/attendance')
@Auth('admin', 'manager')
@ApiBearerAuth('bearer')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get()
  @ApiOperation({
    summary: 'List all attendance records',
    description: 'Returns a paginated list of attendance records with optional filtering',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of attendance records',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async findAll(@Query() query: AttendanceQueryDto): Promise<PaginatedResponseDto<Attendance>> {
    return this.attendanceService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get attendance statistics',
    description: 'Returns aggregate statistics about attendance',
  })
  @ApiResponse({
    status: 200,
    description: 'Attendance statistics',
    type: AttendanceStatsDto,
  })
  async getStats(): Promise<AttendanceStatsDto> {
    return this.attendanceService.getStats();
  }

  @Get('today')
  @ApiOperation({
    summary: 'Get today\'s attendance',
    description: 'Returns all check-ins for today',
  })
  @ApiResponse({
    status: 200,
    description: 'Today\'s attendance',
    type: TodayAttendanceDto,
  })
  async getToday(): Promise<TodayAttendanceDto> {
    return this.attendanceService.getToday();
  }

  @Get('member/:memberId')
  @ApiOperation({
    summary: 'Get member attendance history',
    description: 'Returns attendance history for a specific member',
  })
  @ApiParam({
    name: 'memberId',
    description: 'Member ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Member attendance history',
  })
  async findByMember(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Query() query: AttendanceQueryDto,
  ): Promise<PaginatedResponseDto<Attendance>> {
    return this.attendanceService.findByMember(memberId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get attendance record by ID',
    description: 'Returns a single attendance record by its database ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Attendance record ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Attendance record found',
    type: AttendanceResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Attendance record not found',
  })
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Attendance> {
    const attendance = await this.attendanceService.findOne(id);
    if (!attendance) {
      throw new NotFoundException(`Attendance record with ID ${id} not found`);
    }
    return attendance;
  }
}















