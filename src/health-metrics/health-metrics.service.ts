import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { HealthMetric } from '../entities/health-metric.entity';
import { HealthMetricQueryDto } from './dto/health-metric-query.dto';
import { HealthMetricResponseDto } from './dto/health-metric-response.dto';
import { PaginatedResponseDto, createPaginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class HealthMetricsService {
  constructor(
    @InjectRepository(HealthMetric)
    private healthMetricRepository: Repository<HealthMetric>,
  ) {}

  async findAll(query: HealthMetricQueryDto): Promise<PaginatedResponseDto<HealthMetric>> {
    const { page = 1, limit = 20, sortBy = 'measuredAt', sortOrder = 'DESC', memberId, startDate, endDate } = query;

    const queryBuilder = this.healthMetricRepository.createQueryBuilder('healthMetric')
      .leftJoinAndSelect('healthMetric.member', 'member');

    // Member filter
    if (memberId) {
      queryBuilder.andWhere('healthMetric.memberId = :memberId', { memberId });
    }

    // Date range filter - use UTC to match database timestamptz
    if (startDate) {
      const startDateObj = typeof startDate === 'string' ? new Date(startDate) : startDate;
      const utcStart = new Date(Date.UTC(
        startDateObj.getUTCFullYear(),
        startDateObj.getUTCMonth(),
        startDateObj.getUTCDate(),
        0, 0, 0, 0
      ));
      queryBuilder.andWhere('healthMetric.measuredAt >= :startDate', { startDate: utcStart });
    }
    if (endDate) {
      const endDateObj = typeof endDate === 'string' ? new Date(endDate) : endDate;
      const utcEnd = new Date(Date.UTC(
        endDateObj.getUTCFullYear(),
        endDateObj.getUTCMonth(),
        endDateObj.getUTCDate(),
        23, 59, 59, 999
      ));
      queryBuilder.andWhere('healthMetric.measuredAt <= :endDate', { endDate: utcEnd });
    }

    // Sorting
    const validSortFields = ['measuredAt', 'createdAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'measuredAt';
    queryBuilder.orderBy(`healthMetric.${sortField}`, sortOrder);

    // Get total count
    const total = await queryBuilder.getCount();

    // Pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const healthMetrics = await queryBuilder.getMany();

    return createPaginatedResponse(healthMetrics, total, page, limit);
  }

  async findOne(id: number): Promise<HealthMetric | null> {
    return this.healthMetricRepository.findOne({
      where: { id },
      relations: ['member'],
    });
  }

  async findByMember(memberId: number, query: HealthMetricQueryDto): Promise<PaginatedResponseDto<HealthMetric>> {
    return this.findAll({ ...query, memberId });
  }

  async getLatestByMember(memberId: number): Promise<HealthMetric | null> {
    return this.healthMetricRepository.findOne({
      where: { memberId },
      relations: ['member'],
      order: { measuredAt: 'DESC' },
    });
  }
}

