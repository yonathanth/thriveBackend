import { IsString, IsNotEmpty, IsArray, ArrayMinSize, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkSmsDto {
  @ApiProperty({
    description: 'Array of recipient phone numbers',
    example: ['+251912345678', '+251987654321'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
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

  @ApiPropertyOptional({
    description: 'Optional campaign name for tracking',
    example: 'Monthly Newsletter',
  })
  @IsOptional()
  @IsString()
  campaign?: string;
}







