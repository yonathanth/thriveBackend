import { IsNotEmpty, IsNumber, IsString, IsOptional, IsInt } from 'class-validator';

export class ServiceSyncDto {
  @IsNotEmpty()
  @IsInt()
  id: number; // localId from SQLite

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsInt()
  period: number;

  @IsNotEmpty()
  @IsNumber()
  price: number;

  @IsNotEmpty()
  @IsString()
  category: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsInt()
  maxUsageCount?: number | null;

  @IsNotEmpty()
  @IsString()
  usageType: string;

  @IsNotEmpty()
  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  color?: string | null;

  @IsOptional()
  @IsInt()
  freezeMaxDays?: number | null;

  @IsOptional()
  @IsInt()
  freezeMinDays?: number | null;

  @IsOptional()
  @IsInt()
  freezeMaxCount?: number | null;

  @IsOptional()
  @IsString()
  freezeRuleMode?: string | null;

  @IsOptional()
  @IsInt()
  groupSize?: number | null;

  @IsOptional()
  @IsString()
  groupPricing?: string | null;
}




