import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HealthMetricResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 5, description: 'Local ID from desktop app' })
  localId: number;

  @ApiProperty({ example: 1 })
  memberId: number;

  @ApiProperty({ example: '2026-01-12T08:30:00.000Z' })
  measuredAt: string;

  @ApiPropertyOptional({ example: 75.5 })
  weight?: number | null;

  @ApiPropertyOptional({ example: 23.5 })
  bmi?: number | null;

  @ApiPropertyOptional({ example: 15.2 })
  bodyFatPercent?: number | null;

  @ApiPropertyOptional({ example: 72 })
  heartRate?: number | null;

  @ApiPropertyOptional({ example: 35.2 })
  muscleMass?: number | null;

  @ApiPropertyOptional({ example: 64.0 })
  leanBodyMass?: number | null;

  @ApiPropertyOptional({ example: 3.2 })
  boneMass?: number | null;

  @ApiPropertyOptional({ example: 30.5 })
  skeletalMuscleMass?: number | null;

  @ApiPropertyOptional({ example: 8 })
  visceralFat?: number | null;

  @ApiPropertyOptional({ example: 14.5 })
  subcutaneousFatPercent?: number | null;

  @ApiPropertyOptional({ example: 18.2 })
  proteinPercent?: number | null;

  @ApiPropertyOptional({ example: 1800 })
  bmr?: number | null;

  @ApiPropertyOptional({ example: 25 })
  bodyAge?: number | null;

  @ApiPropertyOptional({ example: 'Normal' })
  bodyType?: string | null;

  @ApiProperty({ example: '2026-01-12T00:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-01-12T00:00:00.000Z' })
  updatedAt: string;
}




