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
import { ALL_NOTIFICATION_TYPES } from '../notification-access';

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

  @ApiPropertyOptional({ description: 'Only notifications the signed-in account has not read' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  unread?: boolean;

  @ApiPropertyOptional({ enum: ALL_NOTIFICATION_TYPES })
  @IsOptional()
  @IsIn(ALL_NOTIFICATION_TYPES as string[])
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

  @ApiPropertyOptional({ enum: ALL_NOTIFICATION_TYPES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(ALL_NOTIFICATION_TYPES as string[], { each: true })
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
  @ApiProperty({ enum: ALL_NOTIFICATION_TYPES, isArray: true })
  @IsArray()
  @IsIn(ALL_NOTIFICATION_TYPES as string[], { each: true })
  types: string[];
}

/** Who a message from staff goes to. */
export const MESSAGE_AUDIENCES = [
  'all_members',
  'active_members',
  'expiring_members',
  'inactive_members',
  'trainers',
  'managers',
  'all_staff',
  'everyone',
  'accounts',
] as const;
export type MessageAudience = (typeof MESSAGE_AUDIENCES)[number];

export class SendNotificationDto {
  @ApiProperty({ example: 'Closed on Monday' })
  @IsString()
  @MaxLength(120)
  title: string;

  @ApiProperty({ example: 'The gym is closed on Monday for the holiday. See you Tuesday!' })
  @IsString()
  @MaxLength(1000)
  body: string;

  @ApiProperty({ enum: MESSAGE_AUDIENCES })
  @IsIn(MESSAGE_AUDIENCES as unknown as string[])
  audience: MessageAudience;

  @ApiPropertyOptional({ description: 'With audience "accounts": the website account ids', example: [12, 40] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsInt({ each: true })
  accountIds?: number[];
}

export class AudienceQueryDto {
  @ApiProperty({ enum: MESSAGE_AUDIENCES })
  @IsIn(MESSAGE_AUDIENCES as unknown as string[])
  audience: MessageAudience;
}
