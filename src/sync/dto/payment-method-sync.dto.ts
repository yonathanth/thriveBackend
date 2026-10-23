import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class PaymentMethodSyncDto {
  @ApiProperty({ example: 1, description: 'Local ID from desktop app' })
  @IsInt()
  id: number;

  @ApiProperty({ example: 'Cash', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Cash payments at the front desk' })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;
}
