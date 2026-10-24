import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PaymentMethod } from '../entities/payment-method.entity';
import { Service } from '../entities/service.entity';
import { Staff } from '../entities/staff.entity';
import { StaffPaySetup } from '../entities/staff-pay-setup.entity';
import { StaffPayout } from '../entities/staff-payout.entity';
import { StaffRevenueShare } from '../entities/staff-revenue-share.entity';
import { SyncRecord } from '../entities/sync-record.entity';
import { WebAuditModule } from '../web-audit/web-audit.module';
import { PayrollController, PayslipsController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StaffPaySetup,
      StaffRevenueShare,
      StaffPayout,
      Staff,
      Service,
      SyncRecord,
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
