import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: configService.get<string>('DATABASE_URL'),
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  // Disable when running against an existing/shared database without schema changes.
  synchronize: configService.get<string>('DATABASE_SYNCHRONIZE', 'true') === 'true',
  logging: configService.get<string>('NODE_ENV') === 'development',
  ssl: configService.get<string>('DATABASE_URL')?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : false,
});




