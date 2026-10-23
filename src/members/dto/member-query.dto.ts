import { IsOptional, IsString, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class MemberQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search by name, phone, or email',
    example: 'john',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by member status',
    enum: ['active', 'inactive', 'frozen', 'pending', 'expired'],
    example: 'active',
  })
  @IsOptional()
  @IsIn(['active', 'inactive', 'frozen', 'pending', 'expired'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by subscription status',
    enum: ['active', 'pending', 'inactive'],
    example: 'active',
  })
  @IsOptional()
  @IsIn(['active', 'pending', 'inactive'])
  subscriptionStatus?: string;

  @ApiPropertyOptional({
    description: 'Filter by service ID',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  serviceId?: number;
}










