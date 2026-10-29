import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Member } from '../entities/member.entity';
import { OnlinePayment } from '../entities/online-payment.entity';
import { Service } from '../entities/service.entity';
import {
  MemberOnlinePaymentsController,
  OnlinePaymentsController,
} from './online-payments.controller';
import { OnlinePaymentsService } from './online-payments.service';
import { SantimPayClient } from './santimpay.client';

@Module({
  imports: [TypeOrmModule.forFeature([OnlinePayment, Member, Service]), AuthModule],
  controllers: [MemberOnlinePaymentsController, OnlinePaymentsController],
  providers: [OnlinePaymentsService, SantimPayClient],
})
export class OnlinePaymentsModule {}
