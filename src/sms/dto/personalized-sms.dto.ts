import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  MinLength,
  IsOptional,
  IsInt,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class RecipientDto {
  @ApiProperty({
    description: 'Recipient phone number',
    example: '0912345678',
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

  @ApiPropertyOptional({
    description: 'Member the message is for',
    example: 12,
  })
  @IsOptional()
  @IsInt()
  memberId?: number;
}

export class PersonalizedSmsDto {
  @ApiProperty({
    description: 'Array of recipients with personalized messages',
    type: [RecipientDto],
    example: [
      {
        phone: '0912345678',
        message: 'Hello John, your subscription expires soon!',
      },
      {
        phone: '0987654321',
        message: 'Hello Jane, your subscription expires soon!',
      },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  recipients: RecipientDto[];
}
