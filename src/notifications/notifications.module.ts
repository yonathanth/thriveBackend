import { Transaction } from '../entities/transaction.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Notification } from '../entities/notification.entity';
import { NotificationRead } from '../entities/notification-read.entity';
import { PushSubscription } from '../entities/push-subscription.entity';
import { Member } from '../entities/member.entity';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { NotificationsController, PushController } from './notifications.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationRead, PushSubscription, Member, Transaction]),
    AuthModule,
  ],
  controllers: [NotificationsController, PushController],
  providers: [NotificationsService, PushService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
