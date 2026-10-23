import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SmsConfig {
  token: string;
  senderName?: string;
  identifierId?: string;
  baseUrl: string;
  callbackBaseUrl?: string;
}

@Injectable()
export class SmsConfigService implements OnModuleInit {
  private readonly logger = new Logger(SmsConfigService.name);
  private config: SmsConfig;

  constructor(private configService: ConfigService) {}

  // A missing token turns SMS off rather than stopping the API from starting.
  onModuleInit() {
    if (!this.configService.get<string>('AFRO_TOKEN')) {
      this.logger.warn(
        'AFRO_TOKEN is not set: SMS is disabled until it is configured',
      );
      return;
    }
    this.validateConfig();
  }

  private validateConfig(): void {
    const token = this.configService.get<string>('AFRO_TOKEN');
    const senderName = this.configService.get<string>('AFRO_SENDER_NAME');

    if (!token) {
      throw new ServiceUnavailableException(
        'SMS is not configured: set AFRO_TOKEN to enable it',
      );
    }

    // Sender name is optional for beta testing - if not provided, AfroMessage will use default
    // Callback URL is optional - if not provided, status updates won't be received
    const callbackBaseUrl = this.configService.get<string>('AFRO_CALLBACK_BASE_URL');
    
    this.config = {
      token,
      senderName, // Can be undefined for beta testing
      identifierId: this.configService.get<string>('AFRO_IDENTIFIER_ID'),
      baseUrl: 'https://api.afromessage.com/api',
      callbackBaseUrl, // Optional - e.g., https://your-domain.com
    };
  }

  getConfig(): SmsConfig {
    if (!this.config) {
      this.validateConfig();
    }
    return this.config;
  }

  getToken(): string {
    return this.getConfig().token;
  }

  getSenderName(): string | undefined {
    return this.getConfig().senderName;
  }

  getIdentifierId(): string | undefined {
    return this.getConfig().identifierId;
  }

  getBaseUrl(): string {
    return this.getConfig().baseUrl;
  }

  getCallbackBaseUrl(): string | undefined {
    return this.getConfig().callbackBaseUrl;
  }

  getCallbackUrl(path: string): string | undefined {
    const baseUrl = this.getCallbackBaseUrl();
    if (!baseUrl) return undefined;
    // Ensure baseUrl doesn't end with / and path starts with /
    const cleanBase = baseUrl.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }
}

