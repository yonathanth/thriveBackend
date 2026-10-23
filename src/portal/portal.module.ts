import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Member } from '../entities/member.entity';
import { Attendance } from '../entities/attendance.entity';
import { Transaction } from '../entities/transaction.entity';
import { HealthMetric } from '../entities/health-metric.entity';
import { Staff } from '../entities/staff.entity';
import { StaffAttendance } from '../entities/staff-attendance.entity';
import { MembersModule } from '../members/members.module';
import { RecordsModule } from '../records/records.module';
import { PortalService } from './portal.service';
import { TrainerPortalController } from './trainer-portal.controller';
import { MemberPortalController } from './member-portal.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Member,
      Attendance,
      Transaction,
      HealthMetric,
      Staff,
      StaffAttendance,
    ]),
    MembersModule,
    RecordsModule,
  ],
  controllers: [TrainerPortalController, MemberPortalController],
  providers: [PortalService],
})
export class PortalModule {}
