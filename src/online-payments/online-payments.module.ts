import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Member } from '../entities/member.entity';
import { OnlinePayment } from '../entities/online-payment.entity';
import { PotentialCustomer } from '../entities/potential-customer.entity';
import { Service } from '../entities/service.entity';
import {
  MemberOnlinePaymentsController,
  OnlinePaymentsController,
  PublicJoinController,
} from './online-payments.controller';
import { OnlinePaymentsService } from './online-payments.service';
import { SantimPayClient } from './santimpay.client';

@Module({
  imports: [TypeOrmModule.forFeature([OnlinePayment, Member, Service, PotentialCustomer]), AuthModule],
  controllers: [MemberOnlinePaymentsController, OnlinePaymentsController, PublicJoinController],
  providers: [OnlinePaymentsService, SantimPayClient],
})
export class OnlinePaymentsModule {}
