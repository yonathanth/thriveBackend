import { IsNotEmpty, IsInt, IsDateString } from 'class-validator';

export class StaffAttendanceSyncDto {
  @IsNotEmpty()
  @IsInt()
  id: number; // localId from desktop

  @IsNotEmpty()
  @IsInt()
  staffId: number; // localId of staff

  @IsNotEmpty()
  @IsDateString()
  scannedAt: string;
}
