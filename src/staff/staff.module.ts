import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Staff } from '../entities/staff.entity';
import { StaffAttendance } from '../entities/staff-attendance.entity';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import { StaffAttendanceController } from './staff-attendance.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Staff, StaffAttendance]),
  ],
  controllers: [StaffController, StaffAttendanceController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
