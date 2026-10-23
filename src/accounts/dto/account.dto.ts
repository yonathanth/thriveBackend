import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ROLES } from '../../auth/roles';
import { MIN_PASSWORD_LENGTH } from '../passwords';

export class AccountQueryDto {
  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsIn(ROLES)
  role?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @ApiPropertyOptional({ description: 'Name, phone or email' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class CreateAdminDto {
  @ApiProperty({ example: 'Sara Admin' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    example: '0911223344',
    description: 'Ethiopian mobile number; used to sign in',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(30)
  phone: string;

  @ApiPropertyOptional({
    example: 'sara@thrivegym.com',
    description: 'Optional sign-in email',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiProperty({
    description:
      'Initial password; the new admin must change it at first sign-in',
  })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(128)
  password: string;
}

export class SetAccountStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

export class ConflictQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'resolved'], default: 'open' })
  @IsOptional()
  @IsIn(['open', 'resolved'])
  status?: 'open' | 'resolved' = 'open';
}

export class AccountDto {
  @ApiProperty() id: number;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ROLES }) role: string;
  @ApiProperty({ nullable: true }) email: string | null;
  @ApiProperty({ nullable: true }) phone: string | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty({
    nullable: true,
    description: 'Set when sync turned the account off',
  })
  deactivatedReason: string | null;
  @ApiProperty() mustChangePassword: boolean;
  @ApiProperty({ enum: ['web', 'desktop_sync'] }) source: string;
  @ApiProperty({ nullable: true }) staffLocalId: number | null;
  @ApiProperty({ nullable: true }) memberLocalId: number | null;
  @ApiProperty({ nullable: true }) lastLoginAt: Date | null;
  @ApiProperty({ nullable: true }) lockedUntil: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty({
    description: 'Whether the signed-in user may reset this password',
  })
  canResetPassword: boolean;
  @ApiProperty({
    description: 'Whether the signed-in user may (de)activate this account',
  })
  canSetStatus: boolean;
}
