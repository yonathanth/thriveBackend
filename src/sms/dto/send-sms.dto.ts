import { IsString, IsNotEmpty, IsOptional, IsInt, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendSmsDto {
  @ApiProperty({
    description: 'Recipient phone number',
    example: '+251912345678',
  })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({
    description: 'SMS message content',
    example: 'Hello, this is a test message',
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  message: string;

  @ApiPropertyOptional({
    description: 'Optional member ID to associate with this message',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  memberId?: number;
}







