import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Auth } from '../auth/auth.decorator';
import { Logger } from '@nestjs/common';
import { SmsService } from './sms.service';
import { SmsTemplateService } from './sms-template.service';
import { SendSmsDto } from './dto/send-sms.dto';
import { BulkSmsDto } from './dto/bulk-sms.dto';
import { PersonalizedSmsDto } from './dto/personalized-sms.dto';
import {
  SmsResponseDto,
  SmsBalanceDto,
  SmsHistoryDto,
  SmsStatusDto,
} from './dto/sms-response.dto';
import { PaginatedResponseDto, createPaginatedResponse } from '../common/dto/pagination.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { SmsMessage } from '../entities/sms-message.entity';

@ApiTags('sms')
@Controller('api/sms')
export class SmsController {
  private readonly logger = new Logger(SmsController.name);

  constructor(
    private readonly smsService: SmsService,
    private readonly templateService: SmsTemplateService,
    @InjectRepository(SmsMessage)
    private smsMessageRepository: Repository<SmsMessage>,
  ) {}

  @Post('send')
  @Auth('admin', 'manager')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Send single SMS',
    description: 'Send an SMS message to a single recipient',
  })
  @ApiResponse({
    status: 201,
    description: 'SMS sent successfully',
    type: SmsResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or SMS API error (e.g., unverified contact, invalid phone number, insufficient balance)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async sendSms(@Body() dto: SendSmsDto): Promise<SmsResponseDto> {
    const smsMessage = await this.smsService.sendSingle(
      dto.phone,
      dto.message,
      { memberId: dto.memberId },
    );

    return {
      messageId: smsMessage.messageId || '',
      status: smsMessage.status,
      message: smsMessage.message,
      to: smsMessage.phoneNumber,
    };
  }

  @Post('bulk')
  @Auth('admin', 'manager')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Send bulk SMS',
    description: 'Send the same SMS message to multiple recipients',
  })
  @ApiResponse({
    status: 201,
    description: 'Bulk SMS sent successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or SMS API error (e.g., unverified contacts, invalid phone numbers, insufficient balance)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async sendBulkSms(@Body() dto: BulkSmsDto): Promise<{
    campaignId: string | null;
    count: number;
  }> {
    return this.smsService.sendBulk(dto.phones, dto.message, dto.campaign);
  }

  @Post('personalized')
  @Auth('admin', 'manager')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Send personalized bulk SMS',
    description: 'Send personalized SMS messages to multiple recipients',
  })
  @ApiResponse({
    status: 201,
    description: 'Personalized bulk SMS sent successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async sendPersonalizedSms(
    @Body() dto: PersonalizedSmsDto,
  ): Promise<{ campaignId: string | null; count: number }> {
    const recipients = dto.recipients.map((r) => ({
      phone: r.phone,
      message: r.message,
    }));

    return this.smsService.sendPersonalizedBulk(recipients, dto.campaign);
  }

  @Get('balance')
  @Auth('admin', 'manager')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get account balance',
    description: 'Get current AfroMessage account balance and estimated messages',
  })
  @ApiResponse({
    status: 200,
    description: 'Balance retrieved successfully',
    type: SmsBalanceDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getBalance(): Promise<SmsBalanceDto> {
    return this.smsService.getBalance();
  }

  @Get('status/:messageId')
  @Auth('admin', 'manager')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get message status',
    description: 'Get the status of a sent SMS message by message ID',
  })
  @ApiParam({
    name: 'messageId',
    description: 'Message ID from AfroMessage',
    example: '9ab2867c-96ce-4405-b890-8d35d52c8e01',
  })
  @ApiResponse({
    status: 200,
    description: 'Message status retrieved successfully',
    type: SmsStatusDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getMessageStatus(
    @Param('messageId') messageId: string,
  ): Promise<SmsStatusDto> {
    return this.smsService.getMessageStatus(messageId);
  }

  @Get('history')
  @Auth('admin', 'manager')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get SMS history',
    description: 'Get paginated SMS message history (lightweight, last 30 days by default)',
  })
  @ApiQuery({
    name: 'days',
    description: 'Number of days to look back (1-90, default: 30)',
    required: false,
    type: Number,
    example: 30,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Maximum number of records (1-100, default: 100)',
    required: false,
    type: Number,
    example: 100,
  })
  @ApiQuery({
    name: 'page',
    description: 'Page number (default: 1)',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'SMS history retrieved successfully',
    type: PaginatedResponseDto<SmsHistoryDto>,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getHistory(
    @Query('days') days?: number,
    @Query('limit') limit?: number,
    @Query('page') page?: number,
  ): Promise<PaginatedResponseDto<SmsHistoryDto>> {
    const daysToLookBack = Math.min(Math.max(days || 30, 1), 90);
    const limitValue = Math.min(Math.max(limit || 100, 1), 100);
    const pageValue = Math.max(page || 1, 1);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToLookBack);

    const queryBuilder = this.smsMessageRepository
      .createQueryBuilder('sms')
      .where('sms.createdAt >= :cutoffDate', { cutoffDate })
      .orderBy('sms.createdAt', 'DESC');

    const total = await queryBuilder.getCount();
    const skip = (pageValue - 1) * limitValue;

    const messages = await queryBuilder.skip(skip).take(limitValue).getMany();

    const history: SmsHistoryDto[] = messages.map((msg) => {
      // Mask phone number for privacy
      const phone = msg.phoneNumber;
      const maskedPhone =
        phone.length > 4
          ? phone.slice(0, 3) + '****' + phone.slice(-4)
          : '****';

      // Truncate message to 50 characters
      const messagePreview =
        msg.message.length > 50
          ? msg.message.substring(0, 50) + '...'
          : msg.message;

      return {
        id: msg.id,
        phoneNumber: maskedPhone,
        message: messagePreview,
        status: msg.status,
        sentAt: msg.sentAt,
        memberId: msg.memberId,
      };
    });

    return createPaginatedResponse(history, total, pageValue, limitValue);
  }

  @Get('templates')
  @Auth('admin', 'manager')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get SMS templates',
    description: 'Get all available SMS templates',
  })
  @ApiResponse({
    status: 200,
    description: 'Templates retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getTemplates() {
    const templates = await this.templateService.getAllTemplates();
    return templates.map((template) => ({
      id: template.id,
      name: template.name,
      type: template.type,
      content: template.content,
      variables: this.templateService.getAvailableVariables(template.type),
      isActive: template.isActive,
    }));
  }

  // Callback endpoints (public - no auth required for AfroMessage webhooks)
  
  @Get('callback/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'SMS Status Callback (Webhook)',
    description: 'Webhook endpoint for AfroMessage to send SMS status updates. Called via GET with message_id and status query parameters appended to the callback URL.',
  })
  @ApiQuery({
    name: 'message_id',
    description: 'Message ID from AfroMessage',
    required: false,
  })
  @ApiQuery({
    name: 'status',
    description: 'Status update (queued, sent, delivered, failed, etc.)',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Callback received successfully',
  })
  async handleStatusCallback(
    @Query('message_id') messageId?: string,
    @Query('status') status?: string,
  ): Promise<{ success: boolean }> {
    if (!messageId || !status) {
      this.logger.warn('Status callback received without message_id or status', {
        messageId,
        status,
      });
      return { success: false };
    }

    try {
      const updated = await this.smsService.updateMessageStatus(messageId, status);
      if (updated) {
        this.logger.log(
          `Status callback processed: messageId=${messageId}, status=${status}`,
        );
      } else {
        this.logger.warn(
          `Status callback received for unknown messageId: ${messageId}`,
        );
      }
      return { success: true };
    } catch (error) {
      // Log error but return success to avoid retries
      this.logger.error(
        `Failed to process status callback for messageId ${messageId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { success: false };
    }
  }

  @Post('callback/create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk SMS Create Callback (Webhook)',
    description: 'Webhook endpoint for AfroMessage to notify when bulk SMS messages are queued. Called via POST with campaign and message details.',
  })
  @ApiResponse({
    status: 200,
    description: 'Callback received successfully',
  })
  async handleCreateCallback(
    @Body() body: {
      campaign_id?: string;
      message_id?: string;
      message?: string;
      to?: string;
      from?: string;
      status?: string;
    },
  ): Promise<{ success: boolean }> {
    if (!body.message_id || !body.to) {
      this.logger.warn('Create callback received without message_id or to', body);
      return { success: false };
    }

    try {
      const status = body.status || 'queued';
      const updated = await this.smsService.updateMessageStatus(
        body.message_id,
        status,
      );
      
      if (updated) {
        this.logger.log(
          `Create callback processed: messageId=${body.message_id}, campaignId=${body.campaign_id}, status=${status}`,
        );
      } else {
        // Message might not be in database yet for bulk sends
        // This is okay, status callback will update it later
        this.logger.debug(
          `Create callback received for messageId not yet in database: ${body.message_id}`,
        );
      }
      
      return { success: true };
    } catch (error) {
      this.logger.error(
        `Failed to process create callback for messageId ${body.message_id}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { success: false };
    }
  }
}

