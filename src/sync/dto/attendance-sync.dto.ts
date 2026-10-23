import { IsNotEmpty, IsInt, IsDateString } from 'class-validator';

export class AttendanceSyncDto {
  @IsNotEmpty()
  @IsInt()
  id: number; // localId from SQLite

  @IsNotEmpty()
  @IsInt()
  memberId: number; // localId of member

  @IsNotEmpty()
  @IsDateString()
  date: string;
}




