import { IsOptional, IsInt, IsDateString, IsIn, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class TransactionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by transaction type',
    enum: ['income', 'expense', 'positive_return', 'negative_return'],
    example: 'income',
  })
  @IsOptional()
  @IsIn(['income', 'expense', 'positive_return', 'negative_return'])
  transactionType?: string;

  @ApiPropertyOptional({
    description: 'Filter by payment status',
    enum: ['paid', 'pending', 'refunded', 'cancelled'],
    example: 'paid',
  })
  @IsOptional()
  @IsString()
  paymentStatus?: string;

  @ApiPropertyOptional({
    description: 'Filter by member ID',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  memberId?: number;

  @ApiPropertyOptional({
    description: 'Filter by service ID',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  serviceId?: number;

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















