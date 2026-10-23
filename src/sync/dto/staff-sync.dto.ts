import { IsNotEmpty, IsInt, IsString, IsOptional } from 'class-validator';

export class StaffSyncDto {
  @IsNotEmpty()
  @IsInt()
  id: number; // localId from desktop

  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string | null;

  @IsOptional()
  @IsString()
  role?: string | null;

  @IsOptional()
  @IsString()
  status?: string | null;

  // Kept as a string: the desktop stores it as entered, and a malformed date must
  // not fail the whole sync request.
  @IsOptional()
  @IsString()
  accessValidTo?: string | null;
}
