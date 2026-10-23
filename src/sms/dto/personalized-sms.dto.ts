import { IsString, IsNotEmpty, IsArray, ArrayMinSize, MinLength, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class RecipientDto {
  @ApiProperty({
    description: 'Recipient phone number',
    example: '+251912345678',
  })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({
    description: 'Personalized message for this recipient',
    example: 'Hello John, your subscription expires soon!',
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  message: string;
}

export class PersonalizedSmsDto {
  @ApiProperty({
    description: 'Array of recipients with personalized messages',
    type: [RecipientDto],
    example: [
      { phone: '+251912345678', message: 'Hello John, your subscription expires soon!' },
      { phone: '+251987654321', message: 'Hello Jane, your subscription expires soon!' },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  recipients: RecipientDto[];

  @ApiPropertyOptional({
    description: 'Optional campaign name for tracking',
    example: 'Personalized Renewal Reminders',
  })
  @IsOptional()
  @IsString()
  campaign?: string;
}







