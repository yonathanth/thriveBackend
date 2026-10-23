import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsMessage } from '../entities/sms-message.entity';
import { SmsConfigService } from './sms.config';

export class SmsApiError extends HttpException {
  constructor(message: string) {
    super({ message }, HttpStatus.BAD_REQUEST);
    this.name = 'SmsApiError';
  }
}

/** How a batch went: how many went out, how many failed, and the first reason. */
export interface BatchResult {
  sent: number;
  failed: number;
  firstError: string | null;
}

export interface Recipient {
  phone: string;
  message: string;
  memberId?: number;
}

/** Pause between messages of one batch, to stay under the provider's rate limit. */
const BATCH_PAUSE_MS = 150;

/**
 * The number in the only form SMS Ethiopia accepts: 2519 and eight more digits.
 * Takes 09…, 9…, 2519… and +251 9…, with any spaces, dashes or brackets. Safaricom
 * numbers (07…) are refused: SMS Ethiopia delivers to Ethio Telecom only.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  let local: string | null = null;
  if (digits.length === 12 && digits.startsWith('251')) local = digits.slice(3);
  else if (digits.length === 10 && digits.startsWith('0'))
    local = digits.slice(1);
  else if (digits.length === 9) local = digits;
  if (local?.startsWith('9')) return `251${local}`;
  if (local?.startsWith('7')) {
    throw new SmsApiError(
      `${raw.trim()} is a Safaricom number; SMS Ethiopia can only send to Ethio Telecom (09…) numbers`,
    );
  }
  throw new SmsApiError(
    `${raw.trim() || 'An empty number'} is not an Ethiopian mobile number`,
  );
}

/** A plain-language reason for a refused request. */
export function explainError(status: number, body: string): string {
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    json = null;
  }
  const errorMessage =
    typeof json?.error_message === 'string' ? json.error_message : null;
  if (errorMessage) {
    const code = errorMessage.split('::').pop()?.trim();
    switch (code) {
      case '10000':
        return 'The phone number was refused; it must be an Ethio Telecom number (09…)';
      case '10001':
        return 'The message is empty';
      case '10002':
        return 'Your SMS Ethiopia campaign is not active; contact SMS Ethiopia support';
      case '10005':
        return 'Out of SMS: renew your package in the SMS Ethiopia dashboard';
      case '10006':
        return 'Your sender name is not approved yet (Ethio Telecom approval takes 1-2 business days)';
      case '10007':
        return 'This number is not verified for the free test campaign: verify it in the SMS Ethiopia dashboard, or buy a package to send to anyone';
      default:
        return errorMessage;
    }
  }
  const snippet = body.trim().slice(0, 200) || 'no details';
  if (status === 401)
    return 'SMS Ethiopia refused the API key: check SMS_ETHIOPIA_API_KEY, and that the key is switched on in the SMS Ethiopia dashboard';
  if (status === 429) return 'Too many messages at once; try again in a minute';
  if (status === 400) {
    // Missing fields come back keyed by field name.
    const fields = json
      ? Object.values(json).filter((v): v is string => typeof v === 'string')
      : [];
    return fields.length
      ? fields.join('; ')
      : `SMS Ethiopia refused the message: ${snippet}`;
  }
  if (status >= 500)
    return `SMS Ethiopia is having problems (HTTP ${status}); try again later`;
  return `SMS Ethiopia error (HTTP ${status}): ${snippet}`;
}

/** Our status for one of SMS Ethiopia's: queued, sent, delivered or failed. */
export function mapStatus(provider: string): string {
  switch (provider.toUpperCase()) {
    case 'ACCEPTED':
    case 'PENDING':
      return 'queued';
    case 'SENT':
      return 'sent';
    case 'DELIVERED':
      return 'delivered';
    default:
      return 'failed';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * SMS through SMS Ethiopia (https://smsethiopia.com). The website only sends by hand;
 * automatic messages are sent by the desktop app.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    @InjectRepository(SmsMessage)
    private smsMessageRepository: Repository<SmsMessage>,
    private smsConfig: SmsConfigService,
  ) {}

  /** Sends one message and returns the provider's message id. A 429 is retried twice. */
  private async post(msisdn: string, text: string): Promise<string | null> {
    const apiKey = this.smsConfig.getApiKey();
    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(`${this.smsConfig.getBaseUrl()}/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            KEY: apiKey,
          },
          body: JSON.stringify({ msisdn, text }),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (error) {
        throw new SmsApiError(
          `Could not reach SMS Ethiopia: ${error instanceof Error ? error.message : error}`,
        );
      }
      const body = await response.text();
      if (response.status === 429 && attempt < 3) {
        await sleep(attempt * 1000);
        continue;
      }
      if (!response.ok) {
        this.logger.warn(
          `SMS Ethiopia refused a send: HTTP ${response.status} ${body.slice(0, 200)}`,
        );
        throw new SmsApiError(explainError(response.status, body));
      }
      let json: { sent?: boolean; id?: string | number; description?: string } =
        {};
      try {
        json = JSON.parse(body) as typeof json;
      } catch {
        json = {};
      }
      if (json.sent === false) {
        throw new SmsApiError(
          `SMS Ethiopia did not accept the message: ${json.description ?? 'not accepted'}`,
        );
      }
      const id = json.id == null ? '' : String(json.id);
      return id && id !== '0' ? id : null;
    }
  }

  /** Sends one message and records it in the history, sent or failed. */
  async sendSingle(
    phone: string,
    message: string,
    options?: { memberId?: number; campaignId?: string },
  ): Promise<SmsMessage> {
    const memberId = options?.memberId ?? null;
    const campaignId = options?.campaignId ?? null;
    let number = phone.trim();
    try {
      number = normalizePhone(phone);
      if (!message.trim()) throw new SmsApiError('The message is empty');
      const messageId = await this.post(number, message);
      return await this.smsMessageRepository.save(
        this.smsMessageRepository.create({
          messageId,
          memberId,
          phoneNumber: number,
          message,
          status: 'queued',
          campaignId,
          sentAt: new Date(),
        }),
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(`SMS to ${number} failed: ${errorMessage}`);
      await this.smsMessageRepository.save(
        this.smsMessageRepository.create({
          memberId,
          phoneNumber: number,
          message,
          status: 'failed',
          campaignId,
          errorMessage,
        }),
      );
      throw error instanceof HttpException
        ? error
        : new SmsApiError(errorMessage);
    }
  }

  /** Sends each recipient their own message, one after another, tagged with one batch id. */
  async sendBatch(recipients: Recipient[]): Promise<BatchResult> {
    this.smsConfig.getApiKey(); // Fail once, up front, when SMS is not set up.
    const campaignId = `batch-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
    const result: BatchResult = { sent: 0, failed: 0, firstError: null };
    for (const [i, r] of recipients.entries()) {
      if (i > 0) await sleep(BATCH_PAUSE_MS);
      try {
        await this.sendSingle(r.phone, r.message, {
          memberId: r.memberId,
          campaignId,
        });
        result.sent++;
      } catch (error) {
        result.failed++;
        result.firstError ??=
          error instanceof Error ? error.message : String(error);
      }
    }
    this.logger.log(
      `Batch ${campaignId}: ${result.sent} sent, ${result.failed} failed`,
    );
    return result;
  }

  /** The same message to every number. */
  sendBulk(phones: string[], message: string): Promise<BatchResult> {
    return this.sendBatch(phones.map((phone) => ({ phone, message })));
  }

  /** Looks up one message's delivery and stores it. */
  async refreshStatus(
    messageId: string,
  ): Promise<{ messageId: string; status: string; segments: number | null }> {
    const response = await fetch(
      `${this.smsConfig.getBaseUrl()}/${encodeURIComponent(messageId)}`,
      {
        headers: {
          Accept: 'application/json',
          KEY: this.smsConfig.getApiKey(),
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    const body = await response.text();
    if (!response.ok)
      throw new SmsApiError(explainError(response.status, body));
    const json = JSON.parse(body) as { status?: string; segments?: number };
    const status = mapStatus(json.status ?? '');
    await this.smsMessageRepository.update(
      { messageId },
      status === 'delivered' ? { status, deliveredAt: new Date() } : { status },
    );
    return { messageId, status, segments: json.segments ?? null };
  }

  /**
   * Refreshes the delivery of the given messages that are recent and not settled yet,
   * quietly: a failed lookup leaves the row as it was.
   */
  async refreshUnsettled(messages: SmsMessage[]): Promise<void> {
    if (!messages.length) return;
    const since = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    const pending = messages.filter(
      (m) =>
        m.messageId &&
        (m.status === 'queued' || m.status === 'sent') &&
        m.createdAt >= since,
    );
    await Promise.all(
      pending.slice(0, 25).map(async (m) => {
        try {
          const { status } = await this.refreshStatus(m.messageId as string);
          m.status = status;
        } catch {
          // Left as it was; tried again next time.
        }
      }),
    );
  }
}
