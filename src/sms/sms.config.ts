import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * SMS Ethiopia settings. Only the API key is needed: the sender name comes from the
 * SMS Ethiopia campaign the key was created under.
 */
@Injectable()
export class SmsConfigService implements OnModuleInit {
  private readonly logger = new Logger(SmsConfigService.name);

  constructor(private configService: ConfigService) {}

  // A missing key turns SMS off rather than stopping the API from starting.
  onModuleInit() {
    if (!this.apiKey()) {
      this.logger.warn(
        'SMS_ETHIOPIA_API_KEY is not set: SMS is disabled until it is configured',
      );
    }
  }

  private apiKey(): string | undefined {
    return (
      this.configService.get<string>('SMS_ETHIOPIA_API_KEY')?.trim() ||
      undefined
    );
  }

  getApiKey(): string {
    const key = this.apiKey();
    if (!key) {
      throw new ServiceUnavailableException(
        'SMS is not configured: set SMS_ETHIOPIA_API_KEY to enable it',
      );
    }
    return key;
  }

  getBaseUrl(): string {
    return 'https://smsethiopia.com/api/v2/sms';
  }
}
