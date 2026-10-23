import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SmsResponseDto {
  @ApiProperty({
    description: 'Message ID from AfroMessage API',
    example: '9ab2867c-96ce-4405-b890-8d35d52c8e01',
  })
  messageId: string;

  @ApiProperty({
    description: 'Message status',
    example: 'Send in progress...',
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

export class SmsBalanceDto {
  @ApiProperty({
    description: 'Current account balance',
    example: '205.65',
  })
  balance: string;

  @ApiProperty({
    description: 'Estimated number of messages that can be sent',
    example: 3577,
  })
  estimatedMessages: number;
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
}

export class SmsStatusDto {
  @ApiProperty({
    description: 'Message ID',
    example: 'aa54b477-7eb7-4a7e-929f-7323803f6fbd',
  })
  messageId: string;

  @ApiProperty({
    description: 'Message cost',
    example: '0.15',
  })
  cost: string;

  @ApiProperty({
    description: 'Number of message parts',
    example: 1,
  })
  parts: number;

  @ApiProperty({
    description: 'Current status',
    example: 'DELIVERED',
  })
  status: string;

  @ApiProperty({
    description: 'Status description',
    example: 'Message delivered successfully',
  })
  description: string;
}







