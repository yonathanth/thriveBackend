import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: configService.get<string>('DATABASE_URL'),
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  // Off unless explicitly enabled: production schema changes are applied by hand from migrations/.
  synchronize: configService.get<string>('DATABASE_SYNCHRONIZE', 'false') === 'true',
  logging: configService.get<string>('NODE_ENV') === 'development',
  ssl: configService.get<string>('DATABASE_URL')?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : false,
});




