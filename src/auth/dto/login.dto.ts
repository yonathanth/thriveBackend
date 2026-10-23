import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

/** Sign in with an email (admins) or a phone number (any account). Send exactly one. */
export class LoginDto {
  @ApiPropertyOptional({
    description: 'Email address (admins)',
    example: 'admin@gym.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Phone number (any account)',
    example: '0911223344',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({
    description: 'Password (the temporary password on first sign-in)',
    example: 'password123',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  password: string;
}
