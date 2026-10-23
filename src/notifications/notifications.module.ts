import { Transaction } from '../entities/transaction.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Notification } from '../entities/notification.entity';
import { NotificationRead } from '../entities/notification-read.entity';
import { PushSubscription } from '../entities/push-subscription.entity';
import { Member } from '../entities/member.entity';
import { Admin } from '../entities/admin.entity';
import { WebAuditModule } from '../web-audit/web-audit.module';
import { ProgressModule } from '../progress/progress.module';
import { PersonalNotificationsService } from './personal-notifications.service';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { NotificationsController, PushController } from './notifications.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationRead, PushSubscription, Member, Transaction, Admin]),
    AuthModule,
    WebAuditModule,
    ProgressModule,
  ],
  controllers: [NotificationsController, PushController],
  providers: [NotificationsService, PushService, PersonalNotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
