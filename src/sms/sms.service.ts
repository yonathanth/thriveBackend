import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsMessage } from '../entities/sms-message.entity';
import { SmsConfigService } from './sms.config';

interface AfroMessageResponse {
  acknowledge: string;
  response: {
    status?: string;
    message_id?: string;
    message?: string;
    to?: string;
    campaign_id?: string;
    balance?: string;
    estimatedMessages?: number;
    cost?: string;
    parts?: number;
    description?: string;
    errors?: string[];
    relatedObject?: string;
  };
}

export class SmsApiError extends HttpException {
  constructor(
    message: string,
    public readonly errors?: string[],
    public readonly relatedObject?: string,
  ) {
    super(
      {
        message,
        errors: errors || [],
        relatedObject,
      },
      HttpStatus.BAD_REQUEST,
    );
    this.name = 'SmsApiError';
  }
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly maxRetries = 3;
  private readonly baseDelay = 1000; // 1 second

  constructor(
    @InjectRepository(SmsMessage)
    private smsMessageRepository: Repository<SmsMessage>,
    private smsConfig: SmsConfigService,
  ) {}

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async makeRequest(
    url: string,
    options: RequestInit,
    retryCount = 0,
  ): Promise<Response> {
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        const fallback =
          errorText && errorText.trim()
            ? errorText
            : `AfroMessage API returned ${response.status} with no error details. This may indicate a temporary server issue, invalid config (token/sender/identifier), or unsupported request. Verify your SMS config and try again.`;
        this.logger.error(
          `AfroMessage API error ${response.status}: ${fallback}`,
          { url, method: options.method || 'GET' },
        );
        throw new Error(`AfroMessage API error: ${response.status} - ${fallback}`);
      }

      return response;
    } catch (error) {
      if (retryCount < this.maxRetries) {
        const delay = this.baseDelay * Math.pow(2, retryCount);
        this.logger.warn(
          `Request failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${this.maxRetries})`,
        );
        await this.sleep(delay);
        return this.makeRequest(url, options, retryCount + 1);
      }
      throw error;
    }
  }

  private parseAfroMessageError(data: AfroMessageResponse): SmsApiError {
    const errors = data.response?.errors || [];
    const relatedObject = data.response?.relatedObject;

    // Extract meaningful error messages
    let errorMessage = 'Failed to send SMS';
    
    if (errors.length > 0) {
      const firstError = errors[0];
      
      // Handle specific error types - check more specific errors FIRST
      if (firstError.includes('unverified contact')) {
        errorMessage = 'Contact number is not verified. During beta testing, you need to verify contacts in the AfroMessage dashboard before sending SMS.';
      } else if (firstError.includes('sender id') || firstError.includes('sender id/name') || 
                 firstError.includes('identifier') || firstError.includes('short code')) {
        // Sender ID or identifier issue - preserve the original error message
        errorMessage = firstError;
      } else if (firstError.includes('insufficient') || firstError.includes('balance')) {
        errorMessage = 'Insufficient account balance. Please top up your account.';
      } else if (firstError.includes('rate limit') || firstError.includes('too many')) {
        errorMessage = 'Rate limit exceeded. Please try again later.';
      } else if ((firstError.includes('invalid') || firstError.includes('Invalid')) && 
                 (firstError.toLowerCase().includes('phone') || firstError.toLowerCase().includes('number'))) {
        // Only categorize as phone format error if it explicitly mentions phone/number
        errorMessage = 'Invalid phone number format. Please check the phone number and try again.';
      } else {
        // Use the first error message as-is
        errorMessage = firstError;
      }
    } else {
      errorMessage = 'An unknown error occurred while sending SMS.';
    }

    this.logger.error(
      `AfroMessage API error: ${errorMessage}`,
      { errors, relatedObject, fullResponse: JSON.stringify(data) },
    );

    return new SmsApiError(errorMessage, errors, relatedObject);
  }

  private async callAfroMessageApi(
    endpoint: string,
    body?: Record<string, unknown>,
  ): Promise<AfroMessageResponse> {
    const config = this.smsConfig.getConfig();
    const url = `${config.baseUrl}${endpoint}`;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
    };

    const options: RequestInit = {
      method: body ? 'POST' : 'GET',
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await this.makeRequest(url, options);
      const data: AfroMessageResponse = await response.json();

      if (data.acknowledge !== 'success') {
        throw this.parseAfroMessageError(data);
      }

      return data;
    } catch (error) {
      // If it's already an SmsApiError, rethrow it
      if (error instanceof SmsApiError) {
        throw error;
      }
      
      // Log unexpected errors
      this.logger.error(`Failed to call AfroMessage API: ${error}`);
      
      // Wrap in SmsApiError for consistent error handling
      if (error instanceof Error) {
        throw new SmsApiError(
          `Network error: ${error.message}`,
          [error.message],
        );
      }
      
      throw new SmsApiError('An unexpected error occurred while calling SMS API');
    }
  }

  /**
   * Normalize AfroMessage status to our database status format
   */
  private normalizeStatus(afroStatus: string): string {
    const statusLower = afroStatus.toLowerCase();
    
    // Map common AfroMessage statuses to our format
    if (statusLower.includes('queued') || statusLower.includes('progress')) {
      return 'queued';
    }
    if (statusLower.includes('sent') || statusLower === 'sent') {
      return 'sent';
    }
    if (statusLower.includes('delivered') || statusLower === 'delivered') {
      return 'delivered';
    }
    if (statusLower.includes('failed') || statusLower.includes('undeliv') || statusLower.includes('error')) {
      return 'failed';
    }
    if (statusLower.includes('pending')) {
      return 'queued';
    }
    
    // Default to lowercase version or 'queued'
    return statusLower || 'queued';
  }

  /**
   * Update SMS message status from callback
   */
  async updateMessageStatus(
    messageId: string,
    status: string,
    deliveredAt?: Date,
  ): Promise<SmsMessage | null> {
    try {
      const smsMessage = await this.smsMessageRepository.findOne({
        where: { messageId },
      });

      if (!smsMessage) {
        this.logger.warn(`SMS message not found for messageId: ${messageId}`);
        return null;
      }

      const oldStatus = smsMessage.status;
      const normalizedStatus = this.normalizeStatus(status);
      
      smsMessage.status = normalizedStatus;
      
      if (normalizedStatus === 'delivered' && deliveredAt) {
        smsMessage.deliveredAt = deliveredAt;
      } else if (normalizedStatus === 'delivered' && !smsMessage.deliveredAt) {
        smsMessage.deliveredAt = new Date();
      }

      // Clear error message if status changed from failed to success
      if (oldStatus === 'failed' && (normalizedStatus === 'sent' || normalizedStatus === 'delivered')) {
        smsMessage.errorMessage = null;
      }

      const updated = await this.smsMessageRepository.save(smsMessage);

      this.logger.log(
        `Updated SMS status for messageId ${messageId}: ${oldStatus} -> ${normalizedStatus}`,
      );

      return updated;
    } catch (error) {
      this.logger.error(
        `Failed to update SMS status for messageId ${messageId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Update SMS message status by phone number (for cases where messageId is not available)
   */
  async updateMessageStatusByPhone(
    phoneNumber: string,
    status: string,
    deliveredAt?: Date,
  ): Promise<SmsMessage | null> {
    try {
      // Find the most recent queued or sent message for this phone number
      const smsMessage = await this.smsMessageRepository.findOne({
        where: { phoneNumber },
        order: { createdAt: 'DESC' },
      });

      if (!smsMessage) {
        this.logger.warn(`SMS message not found for phone: ${phoneNumber}`);
        return null;
      }

      // Only update if current status is queued or sent (not already delivered/failed)
      if (smsMessage.status === 'delivered' || smsMessage.status === 'failed') {
        return smsMessage;
      }

      return this.updateMessageStatus(smsMessage.messageId || '', status, deliveredAt);
    } catch (error) {
      this.logger.error(
        `Failed to update SMS status by phone ${phoneNumber}: ${error}`,
      );
      return null;
    }
  }

  async sendSingle(
    phone: string,
    message: string,
    options?: { memberId?: number; callback?: string },
  ): Promise<SmsMessage> {
    const config = this.smsConfig.getConfig();

    const body: Record<string, unknown> = {
      to: phone,
      message,
    };

    // Only include sender if provided (for beta testing, can be omitted)
    if (config.senderName) {
      body.sender = config.senderName.trim(); // Trim whitespace
    }

    if (config.identifierId) {
      body.from = config.identifierId;
    }

    // Use provided callback or default callback URL from config
    const callbackUrl = options?.callback || this.smsConfig.getCallbackUrl('/api/sms/callback/status');
    if (callbackUrl) {
      body.callback = callbackUrl;
    }

    try {
      const apiResponse = await this.callAfroMessageApi('/send', body);
      const responseData = apiResponse.response;

      const smsMessage = this.smsMessageRepository.create({
        messageId: responseData.message_id || null,
        memberId: options?.memberId || null,
        phoneNumber: phone,
        message,
        status: 'queued',
        sentAt: new Date(),
      });

      const saved = await this.smsMessageRepository.save(smsMessage);

      this.logger.log(
        `SMS sent successfully to ${phone}, message ID: ${responseData.message_id}`,
      );

      return saved;
    } catch (error) {
      let errorMessage = 'Unknown error';
      
      if (error instanceof SmsApiError) {
        errorMessage = error.message;
        // Include additional error details if available
        if (error.errors && error.errors.length > 0) {
          errorMessage = error.errors.join('; ');
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      this.logger.error(`Failed to send SMS to ${phone}: ${errorMessage}`, {
        phone,
        memberId: options?.memberId,
        error: error instanceof Error ? error.stack : error,
      });

      const smsMessage = this.smsMessageRepository.create({
        memberId: options?.memberId || null,
        phoneNumber: phone,
        message,
        status: 'failed',
        errorMessage,
      });

      const saved = await this.smsMessageRepository.save(smsMessage);
      
      // Re-throw the error so the controller can handle it properly
      throw error;
    }
  }

  async sendBulk(
    phones: string[],
    message: string,
    campaign?: string,
  ): Promise<{ campaignId: string | null; count: number }> {
    const config = this.smsConfig.getConfig();

    const body: Record<string, unknown> = {
      to: phones,
      message,
    };

    // Only include sender if provided - trim whitespace to avoid validation issues
    if (config.senderName) {
      body.sender = config.senderName.trim();
    }

    if (config.identifierId) {
      body.from = config.identifierId;
    }

    if (campaign) {
      body.campaign = campaign;
    }

    // Add callback URLs for bulk sends
    const statusCallbackUrl = this.smsConfig.getCallbackUrl('/api/sms/callback/status');
    const createCallbackUrl = this.smsConfig.getCallbackUrl('/api/sms/callback/create');
    
    if (statusCallbackUrl) {
      body.statusCallback = statusCallbackUrl;
    }
    if (createCallbackUrl) {
      body.createCallback = createCallbackUrl;
    }

    // Log the ACTUAL request body being sent (for debugging)
    this.logger.log('Bulk SMS request payload:', JSON.stringify(body, null, 2));

    try {
      const apiResponse = await this.callAfroMessageApi('/bulk_send', body);
      const responseData = apiResponse.response;
      const campaignId = responseData.campaign_id || null;

      // Save messages to database
      const smsMessages = phones.map((phone) =>
        this.smsMessageRepository.create({
          phoneNumber: phone,
          message,
          status: 'queued',
          campaignId,
          sentAt: new Date(),
        }),
      );

      await this.smsMessageRepository.save(smsMessages);

      this.logger.log(
        `Bulk SMS sent successfully to ${phones.length} recipients, campaign ID: ${campaignId}`,
      );

      return { campaignId, count: phones.length };
    } catch (error) {
      let errorMessage = 'Failed to send bulk SMS';
      
      if (error instanceof SmsApiError) {
        errorMessage = error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      this.logger.error(`Failed to send bulk SMS: ${errorMessage}`, {
        recipientCount: phones.length,
        senderName: config.senderName,
        hasIdentifier: !!config.identifierId,
        error: error instanceof Error ? error.stack : error,
      });
      
      // Provide more helpful error message if it's a sender/identifier issue
      if (error instanceof SmsApiError) {
        const errorText = error.message.toLowerCase();
        if (errorText.includes('sender') || errorText.includes('identifier') || errorText.includes('short code')) {
          const enhancedMessage = 
            `${errorMessage}\n\n` +
            `Note: Bulk SMS requires either:\n` +
            `1. An approved sender ID (your current sender: "${config.senderName || 'not set'}"), OR\n` +
            `2. A registered short code/identifier (AFRO_IDENTIFIER_ID).\n\n` +
            `If your sender ID works for single sends but not bulk, it may need to be approved for bulk operations.\n` +
            `Contact AfroMessage support to ensure "${config.senderName || 'your sender ID'}" is approved for bulk messaging.`;
          
          throw new SmsApiError(
            enhancedMessage,
            error.errors,
            error.relatedObject,
          );
        }
      }
      
      throw error;
    }
  }

  async sendPersonalizedBulk(
    recipients: Array<{ phone: string; message: string }>,
    campaign?: string,
  ): Promise<{ campaignId: string | null; count: number }> {
    const config = this.smsConfig.getConfig();

    const body: Record<string, unknown> = {
      to: recipients.map((r) => ({ to: r.phone, message: r.message })),
    };

    // Only include sender if provided - trim whitespace to avoid validation issues
    if (config.senderName) {
      body.sender = config.senderName.trim();
    }

    if (config.identifierId) {
      body.from = config.identifierId;
    }

    if (campaign) {
      body.campaign = campaign;
    }

    // Add callback URLs for personalized bulk sends
    const statusCallbackUrl = this.smsConfig.getCallbackUrl('/api/sms/callback/status');
    const createCallbackUrl = this.smsConfig.getCallbackUrl('/api/sms/callback/create');
    
    if (statusCallbackUrl) {
      body.statusCallback = statusCallbackUrl;
    }
    if (createCallbackUrl) {
      body.createCallback = createCallbackUrl;
    }

    try {
      const apiResponse = await this.callAfroMessageApi('/bulk_send', body);
      const responseData = apiResponse.response;
      const campaignId = responseData.campaign_id || null;

      // Save messages to database
      const smsMessages = recipients.map((recipient) =>
        this.smsMessageRepository.create({
          phoneNumber: recipient.phone,
          message: recipient.message,
          status: 'queued',
          campaignId,
          sentAt: new Date(),
        }),
      );

      await this.smsMessageRepository.save(smsMessages);

      this.logger.log(
        `Personalized bulk SMS sent successfully to ${recipients.length} recipients, campaign ID: ${campaignId}`,
      );

      return { campaignId, count: recipients.length };
    } catch (error) {
      let errorMessage = 'Failed to send personalized bulk SMS';
      
      if (error instanceof SmsApiError) {
        errorMessage = error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      this.logger.error(`Failed to send personalized bulk SMS: ${errorMessage}`, {
        recipientCount: recipients.length,
        error: error instanceof Error ? error.stack : error,
      });
      
      throw error;
    }
  }

  async getBalance(): Promise<{ balance: string; estimatedMessages: number }> {
    try {
      const apiResponse = await this.callAfroMessageApi('/balance');
      const responseData = apiResponse.response;

      return {
        balance: responseData.balance || '0',
        estimatedMessages: responseData.estimatedMessages || 0,
      };
    } catch (error) {
      this.logger.error(`Failed to get balance: ${error}`);
      throw error;
    }
  }

  async getMessageStatus(messageId: string): Promise<{
    messageId: string;
    cost: string;
    parts: number;
    status: string;
    description: string;
  }> {
    try {
      const apiResponse = await this.callAfroMessageApi(
        `/status?id=${encodeURIComponent(messageId)}`,
      );
      const responseData = apiResponse.response;

      return {
        messageId: responseData.message_id || messageId,
        cost: responseData.cost || '0',
        parts: responseData.parts || 1,
        status: responseData.status || 'UNKNOWN',
        description: responseData.description || 'Status unknown',
      };
    } catch (error) {
      this.logger.error(
        `Failed to get message status for ${messageId}: ${error}`,
      );
      throw error;
    }
  }
}

