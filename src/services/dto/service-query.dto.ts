import { IsOptional, IsString, IsIn, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ServiceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by category',
    example: 'gym',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Filter by status (legacy - use isActive instead)',
    enum: ['active', 'inactive'],
    example: 'active',
  })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by usage type',
    enum: ['unlimited', 'limited'],
    example: 'unlimited',
  })
  @IsOptional()
  @IsString()
  usageType?: string;
}









