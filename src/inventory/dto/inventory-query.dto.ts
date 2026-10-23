import { IsOptional, IsInt, IsIn, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class InventoryItemsQueryDto {
  @ApiPropertyOptional({ enum: ['sellable', 'asset'] })
  @IsOptional()
  @IsIn(['sellable', 'asset'])
  kind?: string;
}

export class AssignmentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['pending', 'accepted', 'rejected', 'cancelled'],
  })
  @IsOptional()
  @IsIn(['pending', 'accepted', 'rejected', 'cancelled'])
  status?: string;
}

export class InventoryRangeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Desktop item id', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  itemId?: number;

  @ApiPropertyOptional({ description: 'Movement type, e.g. sale or stock_in' })
  @IsOptional()
  @IsIn([
    'stock_in',
    'adjust_in',
    'adjust_out',
    'assign_out',
    'transfer_out',
    'accept',
    'reject_back',
    'cancel_back',
    'return_to_store',
    'sale',
    'sale_void',
    'asset_add',
    'asset_dispose',
  ])
  type?: string;

  @ApiPropertyOptional({
    description: "First day, in the gym's time zone",
    example: '2026-10-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Last day, inclusive',
    example: '2026-10-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class InventoryReportQueryDto {
  @ApiPropertyOptional({ enum: ['day', 'month', 'year'], default: 'day' })
  @IsOptional()
  @IsIn(['day', 'month', 'year'])
  granularity?: 'day' | 'month' | 'year';

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
