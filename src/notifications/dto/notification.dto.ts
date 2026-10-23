import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { NOTIFICATION_TYPES } from '../notification-text';

export class NotificationQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Only notifications this admin has not read' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  unread?: boolean;

  @ApiPropertyOptional({ enum: NOTIFICATION_TYPES })
  @IsOptional()
  @IsIn(NOTIFICATION_TYPES as unknown as string[])
  type?: string;
}

export class MarkReadDto {
  @ApiProperty({ example: [1, 2, 3] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  ids: number[];
}

class PushKeysDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  p256dh: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  auth: string;
}

/** A browser's PushSubscription.toJSON(), plus the types it wants. */
export class PushSubscribeDto {
  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/...' })
  // Which hosts are allowed is PushService's call (known push services only)
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: false })
  @MaxLength(2048)
  endpoint: string;

  @ApiProperty({ type: PushKeysDto })
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;

  @ApiPropertyOptional({ enum: NOTIFICATION_TYPES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(NOTIFICATION_TYPES as unknown as string[], { each: true })
  types?: string[];

  /** Some browsers include this in toJSON(); accepted and ignored. */
  @ApiPropertyOptional()
  @IsOptional()
  expirationTime?: number | null;
}

export class PushEndpointDto {
  @ApiProperty()
  @IsString()
  @MaxLength(2048)
  endpoint: string;
}

export class PushTypesDto extends PushEndpointDto {
  @ApiProperty({ enum: NOTIFICATION_TYPES, isArray: true })
  @IsArray()
  @IsIn(NOTIFICATION_TYPES as unknown as string[], { each: true })
  types: string[];
}
