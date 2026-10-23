import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PotentialCustomersController } from './potential-customers.controller';
import { PotentialCustomersService } from './potential-customers.service';
import { PotentialCustomer } from '../entities/potential-customer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PotentialCustomer])],
  controllers: [PotentialCustomersController],
  providers: [PotentialCustomersService],
  exports: [PotentialCustomersService],
})
export class PotentialCustomersModule {}


