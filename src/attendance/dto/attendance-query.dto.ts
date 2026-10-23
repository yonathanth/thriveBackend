import { IsOptional, IsInt, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class AttendanceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by member ID',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  memberId?: number;

  @ApiPropertyOptional({
    description: 'Filter by specific date (ISO 8601)',
    example: '2026-01-12',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    description: 'Filter by start date (ISO 8601)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by end date (ISO 8601)',
    example: '2026-01-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}















