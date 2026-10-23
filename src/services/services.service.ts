import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from '../entities/service.entity';
import { ServiceQueryDto } from './dto/service-query.dto';
import { ServiceStatsDto, ServiceWebDto } from './dto/service-response.dto';
import { PaginatedResponseDto, createPaginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class ServicesService {
  private readonly logger = new Logger(ServicesService.name);

  constructor(
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
  ) {}

  /**
   * Convert period in days to duration and durationUnit
   */
  private convertPeriodToDuration(periodDays: number): { duration: number; durationUnit: 'days' | 'weeks' | 'months' | 'years' } {
    if (periodDays < 7) {
      return { duration: periodDays, durationUnit: 'days' };
    } else if (periodDays < 28) {
      const weeks = Math.round(periodDays / 7);
      return { duration: weeks, durationUnit: 'weeks' };
    } else if (periodDays < 365) {
      const months = Math.round(periodDays / 30);
      return { duration: months, durationUnit: 'months' };
    } else {
      const years = Math.round(periodDays / 365);
      return { duration: years, durationUnit: 'years' };
    }
  }

  /**
   * Transform Service entity to web app format
   */
  transformToWebFormat(service: Service): ServiceWebDto {
    const { duration, durationUnit } = this.convertPeriodToDuration(service.period);
    
    return {
      id: service.id,
      name: service.name,
      category: service.category,
      description: service.description || undefined,
      price: Number(service.price),
      duration,
      durationUnit,
      isActive: service.status === 'active',
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString(),
    };
  }

  async findAll(query: ServiceQueryDto): Promise<PaginatedResponseDto<ServiceWebDto>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'DESC', category, status, isActive, usageType } = query;

    this.logger.log(`findAll called with query: ${JSON.stringify(query)}`);

    // Convert isActive to status if provided
    const effectiveStatus = isActive !== undefined 
      ? (isActive ? 'active' : 'inactive')
      : status;

    const queryBuilder = this.serviceRepository.createQueryBuilder('service');

    // Category filter
    if (category) {
      queryBuilder.andWhere('service.category = :category', { category });
    }

    // Status filter (use effectiveStatus which handles both status and isActive)
    if (effectiveStatus) {
      queryBuilder.andWhere('service.status = :status', { status: effectiveStatus });
    }

    // Usage type filter
    if (usageType) {
      queryBuilder.andWhere('service.usageType = :usageType', { usageType });
    }

    // Sorting
    const validSortFields = ['createdAt', 'name', 'price', 'period'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    queryBuilder.orderBy(`service.${sortField}`, sortOrder);

    // Get total count
    const total = await queryBuilder.getCount();

    // Pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const services = await queryBuilder.getMany();

    this.logger.log(`Found ${total} total services, returning ${services.length} on page ${page}`);

    // Transform services to web format
    const transformedServices = services.map(service => this.transformToWebFormat(service));

    return createPaginatedResponse(transformedServices, total, page, limit);
  }

  async findOne(id: number): Promise<Service | null> {
    return this.serviceRepository.findOne({
      where: { id },
    });
  }

  async findByLocalId(localId: number): Promise<Service | null> {
    return this.serviceRepository.findOne({
      where: { localId },
    });
  }

  async getStats(): Promise<ServiceStatsDto> {
    const [total, active, inactive] = await Promise.all([
      this.serviceRepository.count(),
      this.serviceRepository.count({ where: { status: 'active' } }),
      this.serviceRepository.count({ where: { status: 'inactive' } }),
    ]);

    // Get categories breakdown
    const categoryStats = await this.serviceRepository
      .createQueryBuilder('service')
      .select('service.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('service.category')
      .getRawMany();

    return {
      total,
      active,
      inactive,
      categories: categoryStats.length,
      byCategory: categoryStats.map(c => ({
        category: c.category,
        count: parseInt(c.count, 10),
      })),
    };
  }
}

