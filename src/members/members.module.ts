import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { Member } from '../entities/member.entity';
import { AuthModule } from '../auth/auth.module';
import { Staff } from '../entities/staff.entity';
import { SyncRecord } from '../entities/sync-record.entity';
import { RecordsModule } from '../records/records.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Member, Staff, SyncRecord]),
    AuthModule,
    RecordsModule,
  ],
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}















