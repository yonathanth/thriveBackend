import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin } from '../entities/admin.entity';
import { Member } from '../entities/member.entity';
import { Staff } from '../entities/staff.entity';
import { AccountAudit } from '../entities/account-audit.entity';
import { AccountLinkConflict } from '../entities/account-link-conflict.entity';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { AccountProvisioningService } from './account-provisioning.service';
import { WebAuditModule } from '../web-audit/web-audit.module';

@Module({
  imports: [
    WebAuditModule,
    TypeOrmModule.forFeature([
      Admin,
      Member,
      Staff,
      AccountAudit,
      AccountLinkConflict,
    ]),
  ],
  controllers: [AccountsController],
  providers: [AccountsService, AccountProvisioningService],
  exports: [AccountProvisioningService],
})
export class AccountsModule {}
