import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SiteController } from './site.controller';
import { SiteService } from './site.service';
import { Service } from '../entities/service.entity';
import { Staff } from '../entities/staff.entity';
import { SyncRecord } from '../entities/sync-record.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Service, Staff, SyncRecord])],
  controllers: [SiteController],
  providers: [SiteService],
})
export class SiteModule {}
