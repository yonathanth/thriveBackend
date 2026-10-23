import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SyncModule } from './sync/sync.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { MembersModule } from './members/members.module';
import { ServicesModule } from './services/services.module';
import { AttendanceModule } from './attendance/attendance.module';
import { TransactionsModule } from './transactions/transactions.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SmsModule } from './sms/sms.module';
import { HealthMetricsModule } from './health-metrics/health-metrics.module';
import { PotentialCustomersModule } from './potential-customers/potential-customers.module';
import { StaffModule } from './staff/staff.module';
import { RecordsModule } from './records/records.module';
import { SiteModule } from './site/site.module';
import { AccountsModule } from './accounts/accounts.module';
import { PortalModule } from './portal/portal.module';
import { getDatabaseConfig } from './config/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: getDatabaseConfig,
      inject: [ConfigService],
    }),
    SyncModule,
    NotificationsModule,
    AuthModule,
    MembersModule,
    ServicesModule,
    AttendanceModule,
    TransactionsModule,
    DashboardModule,
    SmsModule,
    HealthMetricsModule,
    PotentialCustomersModule,
    StaffModule,
    RecordsModule,
    SiteModule,
    AccountsModule,
    PortalModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
