import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MIN_PASSWORD_LENGTH } from '../../accounts/passwords';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current (or temporary) password',
    example: '0000',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({
    description: 'New password',
    example: 'newpassword123',
    minLength: MIN_PASSWORD_LENGTH,
  })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(128)
  newPassword: string;
}
