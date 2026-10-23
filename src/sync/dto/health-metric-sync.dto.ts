import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
} from 'class-validator';

export class HealthMetricSyncDto {
  @IsNotEmpty()
  @IsInt()
  id: number; // localId from SQLite

  @IsNotEmpty()
  @IsInt()
  memberId: number; // member localId from SQLite

  @IsNotEmpty()
  @IsDateString()
  measuredAt: string;

  @IsOptional()
  weight?: number | null;

  @IsOptional()
  bmi?: number | null;

  @IsOptional()
  bodyFatPercent?: number | null;

  @IsOptional()
  @IsInt()
  heartRate?: number | null;

  @IsOptional()
  muscleMass?: number | null;

  @IsOptional()
  leanBodyMass?: number | null;

  @IsOptional()
  boneMass?: number | null;

  @IsOptional()
  skeletalMuscleMass?: number | null;

  @IsOptional()
  @IsInt()
  visceralFat?: number | null;

  @IsOptional()
  subcutaneousFatPercent?: number | null;

  @IsOptional()
  proteinPercent?: number | null;

  @IsOptional()
  @IsInt()
  bmr?: number | null;

  @IsOptional()
  @IsInt()
  bodyAge?: number | null;

  @IsOptional()
  @IsString()
  bodyType?: string | null;
}




