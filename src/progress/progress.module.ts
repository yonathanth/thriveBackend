import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { HealthMetric } from '../entities/health-metric.entity';
import { Member } from '../entities/member.entity';
import { SyncRecord } from '../entities/sync-record.entity';
import { ProgressGoal, ProgressPhoto, ProgressSchedule } from '../entities/progress.entity';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Member, HealthMetric, SyncRecord, ProgressPhoto, ProgressGoal, ProgressSchedule]),
    AuthModule,
  ],
  controllers: [ProgressController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
