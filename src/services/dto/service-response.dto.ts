import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ServiceResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 5, description: 'Local ID from desktop app' })
  localId: number;

  @ApiProperty({ example: 'Monthly Membership' })
  name: string;

  @ApiProperty({ example: 30, description: 'Period in days' })
  period: number;

  @ApiProperty({ example: 1500.00 })
  price: number;

  @ApiProperty({ example: 'gym' })
  category: string;

  @ApiPropertyOptional({ example: 'Full access to gym facilities' })
  description: string | null;

  @ApiPropertyOptional({ example: null })
  maxUsageCount: number | null;

  @ApiProperty({ example: 'unlimited' })
  usageType: string;

  @ApiProperty({ example: 'active' })
  status: string;

  @ApiProperty({ example: '2026-01-12T00:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-01-12T00:00:00.000Z' })
  updatedAt: string;
}

export class ServiceWebDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Monthly Membership' })
  name: string;

  @ApiProperty({ example: 'gym', description: 'Category for filtering (e.g. gym, group fitness, bmi fit)' })
  category: string;

  @ApiPropertyOptional({ example: 'Full access to gym facilities' })
  description?: string;

  @ApiProperty({ example: 1500.00 })
  price: number;

  @ApiProperty({ example: 1, description: 'Duration value' })
  duration: number;

  @ApiProperty({ 
    example: 'months',
    enum: ['days', 'weeks', 'months', 'years'],
    description: 'Duration unit'
  })
  durationUnit: 'days' | 'weeks' | 'months' | 'years';

  @ApiProperty({ example: true, description: 'Whether the service is active' })
  isActive: boolean;

  @ApiProperty({ example: '2026-01-12T00:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-01-12T00:00:00.000Z' })
  updatedAt: string;
}

export class ServiceStatsDto {
  @ApiProperty({ example: 10, description: 'Total number of services' })
  total: number;

  @ApiProperty({ example: 8, description: 'Number of active services' })
  active: number;

  @ApiProperty({ example: 2, description: 'Number of inactive services' })
  inactive: number;

  @ApiProperty({ example: 3, description: 'Number of unique categories' })
  categories: number;

  @ApiProperty({
    example: [{ category: 'gym', count: 5 }, { category: 'pool', count: 3 }],
    description: 'Services count by category',
  })
  byCategory: { category: string; count: number }[];
}









