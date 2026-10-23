import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PaymentMethod } from '../entities/payment-method.entity';
import { PayoutApproval } from '../entities/payout-approval.entity';
import { Staff } from '../entities/staff.entity';
import { SyncRecord } from '../entities/sync-record.entity';
import { WebAuditModule } from '../web-audit/web-audit.module';
import { PayrollController, PayslipsController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SyncRecord,
      PayoutApproval,
      Staff,
      PaymentMethod,
    ]),
    AuthModule,
    WebAuditModule,
  ],
  controllers: [PayrollController, PayslipsController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
