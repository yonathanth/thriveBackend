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
import { ServicesService } from './services.service';
import { ServiceQueryDto } from './dto/service-query.dto';
import { ServiceResponseDto, ServiceStatsDto, ServiceWebDto } from './dto/service-response.dto';
import { Auth } from '../auth/auth.decorator';
import { Public } from '../auth/public.decorator';
import { PaginatedResponseDto } from '../common/dto/pagination.dto';
import { Service } from '../entities/service.entity';

@ApiTags('services')
@Controller('api/services')
@Auth('admin', 'manager')
@ApiBearerAuth('bearer')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'List all services',
    description: 'Returns a paginated list of services with optional filtering. Public so membership and register pages can load plans without login.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of services',
  })
  async findAll(@Query() query: ServiceQueryDto): Promise<PaginatedResponseDto<ServiceWebDto>> {
    return this.servicesService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get service statistics',
    description: 'Returns aggregate statistics about services',
  })
  @ApiResponse({
    status: 200,
    description: 'Service statistics',
    type: ServiceStatsDto,
  })
  async getStats(): Promise<ServiceStatsDto> {
    return this.servicesService.getStats();
  }

  @Get(':id')
  @Public()
  @ApiOperation({
    summary: 'Get service by ID',
    description: 'Returns a single service by its database ID. Public so marketing pages can show plan details without login.',
  })
  @ApiParam({
    name: 'id',
    description: 'Service ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Service found',
    type: ServiceWebDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Service not found',
  })
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<ServiceWebDto> {
    const service = await this.servicesService.findOne(id);
    if (!service) {
      throw new NotFoundException(`Service with ID ${id} not found`);
    }
    return this.servicesService.transformToWebFormat(service);
  }
}









