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
import { HealthMetricsService } from './health-metrics.service';
import { HealthMetricQueryDto } from './dto/health-metric-query.dto';
import { HealthMetricResponseDto } from './dto/health-metric-response.dto';
import { Auth } from '../auth/auth.decorator';
import { PaginatedResponseDto } from '../common/dto/pagination.dto';
import { HealthMetric } from '../entities/health-metric.entity';

@ApiTags('health-metrics')
@Controller('api/health-metrics')
@Auth('admin', 'manager')
@ApiBearerAuth('bearer')
export class HealthMetricsController {
  constructor(private readonly healthMetricsService: HealthMetricsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all health metric records',
    description: 'Returns a paginated list of health metric records with optional filtering',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of health metric records',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async findAll(@Query() query: HealthMetricQueryDto): Promise<PaginatedResponseDto<HealthMetric>> {
    return this.healthMetricsService.findAll(query);
  }

  @Get('member/:memberId/latest')
  @ApiOperation({
    summary: 'Get latest health metric for member',
    description: 'Returns the most recent health metric record for a specific member',
  })
  @ApiParam({
    name: 'memberId',
    description: 'Member ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Latest health metric found',
    type: HealthMetricResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'No health metrics found for this member',
  })
  async getLatestByMember(
    @Param('memberId', ParseIntPipe) memberId: number,
  ): Promise<HealthMetric | null> {
    const healthMetric = await this.healthMetricsService.getLatestByMember(memberId);
    if (!healthMetric) {
      return null;
    }
    return healthMetric;
  }

  @Get('member/:memberId')
  @ApiOperation({
    summary: 'Get member health metrics history',
    description: 'Returns health metrics history for a specific member',
  })
  @ApiParam({
    name: 'memberId',
    description: 'Member ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Member health metrics history',
  })
  async findByMember(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Query() query: HealthMetricQueryDto,
  ): Promise<PaginatedResponseDto<HealthMetric>> {
    return this.healthMetricsService.findByMember(memberId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get health metric record by ID',
    description: 'Returns a single health metric record by its database ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Health metric record ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Health metric record found',
    type: HealthMetricResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Health metric record not found',
  })
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<HealthMetric> {
    const healthMetric = await this.healthMetricsService.findOne(id);
    if (!healthMetric) {
      throw new NotFoundException(`Health metric record with ID ${id} not found`);
    }
    return healthMetric;
  }
}

