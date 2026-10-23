import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkSmsDto {
  @ApiProperty({
    description: 'Array of recipient phone numbers',
    example: ['0912345678', '251987654321'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  phones: string[];

  @ApiProperty({
    description: 'SMS message content to send to all recipients',
    example: 'Hello, this is a bulk message',
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  message: string;
}
