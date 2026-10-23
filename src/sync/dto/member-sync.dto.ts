import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
} from 'class-validator';

export class MemberSyncDto {
  @IsNotEmpty()
  @IsInt()
  id: number; // localId from SQLite

  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsNotEmpty()
  @IsString()
  phoneNumber: string;

  @IsOptional()
  @IsString()
  email?: string | null;

  @IsNotEmpty()
  @IsDateString()
  firstRegisteredAt: string;

  @IsOptional()
  @IsString()
  profileImageUrl?: string | null;

  @IsNotEmpty()
  @IsDateString()
  subscriptionStartDate: string;

  @IsNotEmpty()
  @IsDateString()
  subscriptionEndDate: string;

  @IsNotEmpty()
  @IsInt()
  subscriptionUsedCount: number;

  @IsNotEmpty()
  @IsString()
  subscriptionStatus: string;

  @IsNotEmpty()
  @IsInt()
  frozen: number;

  @IsOptional()
  @IsDateString()
  frozenStartDate?: string | null;

  @IsOptional()
  @IsDateString()
  frozenUntilDate?: string | null;

  @IsOptional()
  @IsString()
  frozenReason?: string | null;

  @IsOptional()
  @IsInt()
  freezeDurationRequested?: number | null;

  @IsNotEmpty()
  @IsString()
  status: string;

  @IsOptional()
  @IsInt()
  serviceId?: number | null;

  @IsOptional()
  @IsString()
  externalMemberId?: string | null;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string | null;

  @IsOptional()
  @IsString()
  gender?: string | null;

  @IsOptional()
  @IsString()
  organizationName?: string | null;

  @IsOptional()
  @IsString()
  cardNo?: string | null;

  @IsOptional()
  @IsString()
  membershipTier?: string | null;

  @IsOptional()
  @IsString()
  goals?: string | null;

  @IsOptional()
  @IsString()
  bloodType?: string | null;

  @IsOptional()
  @IsInt()
  age?: number | null;

  @IsOptional()
  @IsString()
  height?: string | null;

  @IsOptional()
  @IsString()
  telegramUsername?: string | null;

  @IsOptional()
  @IsString()
  remark?: string | null;

  @IsOptional()
  @IsString()
  objective?: string | null;

  @IsOptional()
  @IsInt()
  trainerStaffId?: number | null;
}




