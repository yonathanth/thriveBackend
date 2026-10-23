import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
} from '@nestjs/common';
import { AuditActor, WebAuditService } from '../web-audit/web-audit.service';
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
  SmsHistoryDto,
  SmsStatusDto,
  SmsBatchResultDto,
} from './dto/sms-response.dto';
import {
  PaginatedResponseDto,
  createPaginatedResponse,
} from '../common/dto/pagination.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsMessage } from '../entities/sms-message.entity';

@ApiTags('sms')
@Controller('api/sms')
export class SmsController {
  private readonly logger = new Logger(SmsController.name);

  constructor(
    private readonly smsService: SmsService,
    private readonly templateService: SmsTemplateService,
    private readonly webAudit: WebAuditService,
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
    description:
      'Validation error or SMS refused (e.g. not an Ethio Telecom number, out of SMS, sender name not approved)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async sendSms(
    @Request() req: { user: AuditActor },
    @Body() dto: SendSmsDto,
  ): Promise<SmsResponseDto> {
    let smsMessage: SmsMessage;
    try {
      smsMessage = await this.smsService.sendSingle(dto.phone, dto.message, {
        memberId: dto.memberId,
      });
    } catch (error) {
      await this.webAudit.record(req.user, 'sms', 'send', `SMS to ${dto.phone} failed`, {
        phone: dto.phone,
        message: dto.message,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    await this.webAudit.record(
      req.user,
      'sms',
      'send',
      `Sent an SMS to ${smsMessage.phoneNumber}`,
      { phone: smsMessage.phoneNumber, message: dto.message },
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
    description:
      'How many were sent and how many failed; each failure reason is in the history',
    type: SmsBatchResultDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async sendBulkSms(
    @Request() req: { user: AuditActor },
    @Body() dto: BulkSmsDto,
  ): Promise<SmsBatchResultDto> {
    const result = await this.smsService.sendBulk(dto.phones, dto.message);
    await this.webAudit.record(
      req.user,
      'sms',
      'send_bulk',
      `Sent the same SMS to ${result.sent} of ${dto.phones.length} numbers${result.failed ? ` (${result.failed} failed)` : ''}`,
      { message: dto.message, ...result },
    );
    return result;
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
    description:
      'How many were sent and how many failed; each failure reason is in the history',
    type: SmsBatchResultDto,
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
    @Request() req: { user: AuditActor },
    @Body() dto: PersonalizedSmsDto,
  ): Promise<SmsBatchResultDto> {
    const result = await this.smsService.sendBatch(
      dto.recipients.map((r) => ({
        phone: r.phone,
        message: r.message,
        memberId: r.memberId,
      })),
    );
    await this.webAudit.record(
      req.user,
      'sms',
      'send_bulk',
      `Sent an SMS to ${result.sent} of ${dto.recipients.length} people${result.failed ? ` (${result.failed} failed)` : ''}`,
      { sample: dto.recipients[0]?.message ?? null, ...result },
    );
    return result;
  }

  @Get('status/:messageId')
  @Auth('admin', 'manager')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get message status',
    description:
      'Looks up the delivery of a sent message at SMS Ethiopia and stores it',
  })
  @ApiParam({
    name: 'messageId',
    description: 'Message ID from SMS Ethiopia',
    example: '01JZX5M8Q3T5V0X8YW9RCB2K7D',
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
    return this.smsService.refreshStatus(messageId);
  }

  @Get('history')
  @Auth('admin', 'manager')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get SMS history',
    description:
      'Get paginated SMS message history (lightweight, last 30 days by default)',
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
    // Delivery is looked up when the history is viewed, not by a background job.
    await this.smsService.refreshUnsettled(messages);

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
        errorMessage: msg.errorMessage,
        createdAt: msg.createdAt,
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
}
