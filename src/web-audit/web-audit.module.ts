import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebAudit } from '../entities/web-audit.entity';
import { WebAuditService } from './web-audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([WebAudit])],
  providers: [WebAuditService],
  exports: [WebAuditService],
})
export class WebAuditModule {}
