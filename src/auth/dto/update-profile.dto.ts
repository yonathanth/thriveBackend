import { IsEmail, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'New email address',
    example: 'newemail@gym.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'New password (minimum 6 characters)',
    example: 'newpassword123',
    minLength: 6,
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional({
    description: 'Current password (required when changing password or email)',
    example: 'currentpassword',
  })
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ApiPropertyOptional({
    description: 'Contact email kept on the website only (not sent to the desktop); empty string clears it',
    example: 'me@example.com',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== '')
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional({
    description: 'Telegram username kept on the website only; empty string clears it',
    example: 'abebe',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  telegramUsername?: string;
}







