import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin } from '../entities/admin.entity';
import { Member } from '../entities/member.entity';
import { Staff } from '../entities/staff.entity';
import { AccountAudit } from '../entities/account-audit.entity';
import { AccountLinkConflict } from '../entities/account-link-conflict.entity';
import { AccountPermission } from '../entities/account-permission.entity';
import { AccountsController } from './accounts.controller';
import { AccountPermissionsController } from './account-permissions.controller';
import { AccountPermissionsService } from './account-permissions.service';
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
      AccountPermission,
    ]),
  ],
  controllers: [AccountsController, AccountPermissionsController],
  providers: [
    AccountsService,
    AccountProvisioningService,
    AccountPermissionsService,
  ],
  exports: [AccountProvisioningService],
})
export class AccountsModule {}
