import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SmsResponseDto {
  @ApiProperty({
    description: 'Message ID from SMS Ethiopia (empty when none was returned)',
    example: '01JZX5M8Q3T5V0X8YW9RCB2K7D',
  })
  messageId: string;

  @ApiProperty({
    description: 'Message status',
    example: 'queued',
  })
  status: string;

  @ApiProperty({
    description: 'Original message content',
    example: 'Hello, this is a test message',
  })
  message: string;

  @ApiProperty({
    description: 'Recipient phone number',
    example: '+251912345678',
  })
  to: string;
}

export class SmsHistoryDto {
  @ApiProperty({
    description: 'SMS record ID',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'Recipient phone number (masked for privacy)',
    example: '+251****5678',
  })
  phoneNumber: string;

  @ApiProperty({
    description: 'Message preview (truncated to 50 characters)',
    example: 'Hello, this is a test message...',
  })
  message: string;

  @ApiProperty({
    description: 'Message status',
    example: 'delivered',
  })
  status: string;

  @ApiProperty({
    description: 'When the message was sent',
    example: '2024-01-15T10:30:00Z',
  })
  sentAt: Date | null;

  @ApiPropertyOptional({
    description: 'Associated member ID if applicable',
    example: 1,
  })
  memberId?: number | null;

  @ApiPropertyOptional({
    description: 'Why a failed message failed',
    example: 'Out of SMS: renew your package in the SMS Ethiopia dashboard',
  })
  errorMessage?: string | null;

  @ApiProperty({
    description: 'When the message was created',
    example: '2024-01-15T10:30:00Z',
  })
  createdAt: Date;
}

export class SmsStatusDto {
  @ApiProperty({
    description: 'SMS Ethiopia message ID',
    example: '01JZX5M8Q3T5V0X8YW9RCB2K7D',
  })
  messageId: string;

  @ApiProperty({
    description: 'queued, sent, delivered or failed',
    example: 'delivered',
  })
  status: string;

  @ApiPropertyOptional({
    description: 'SMS segments the message used',
    example: 1,
  })
  segments: number | null;
}

export class SmsBatchResultDto {
  @ApiProperty({ example: 12 })
  sent: number;

  @ApiProperty({ example: 1 })
  failed: number;

  @ApiPropertyOptional({
    description: 'The first failure reason; each one is in the history',
    example: null,
  })
  firstError: string | null;
}
