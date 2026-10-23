import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';
import { SyncRecord } from '../entities/sync-record.entity';
import { Member } from '../entities/member.entity';
import { Transaction } from '../entities/transaction.entity';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([SyncRecord, Member, Transaction]), AuthModule],
  controllers: [RecordsController, AuditLogController],
  providers: [RecordsService, AuditLogService],
  exports: [RecordsService],
})
export class RecordsModule {}
