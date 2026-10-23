import { IsOptional, IsInt, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class HealthMetricQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by member ID',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  memberId?: number;

  @ApiPropertyOptional({
    description: 'Filter by start date',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by end date',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}




