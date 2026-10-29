import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createPrivateKey, createPublicKey, sign, verify } from 'crypto';

const BASE_URLS = {
  test: 'https://testnet.santimpay.com/api/v1/gateway',
  live: 'https://services.santimpay.com/api/v1/gateway',
} as const;

/** SantimPay's answer to "how did this transaction end". */
export interface SantimPayStatus {
  status: string;
  message?: string;
  phoneNumber?: string;
  santimPayTxnId?: string;
  id?: string;
  paymentMethod?: string;
}

const b64url = (buf: Buffer) =>
  buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Keys from .env may carry literal "\n" in place of line breaks. */
const pem = (raw: string) => raw.replace(/\\n/g, '\n').trim();

/**
 * Talks to SantimPay. Every request carries a fresh ES256 token signed with our private
 * key, built with Node's crypto (the token SantimPay expects is a plain JWT, so no extra
 * dependency). Settings come from .env only; with any missing, online payment is off.
 *
 *   SANTIMPAY_ENV          test | live
 *   SANTIMPAY_MERCHANT_ID
 *   SANTIMPAY_PRIVATE_KEY  ours, PEM
 *   SANTIMPAY_PUBLIC_KEY   SantimPay's, PEM; checks the callback's signature
 */
@Injectable()
export class SantimPayClient {
  private readonly logger = new Logger(SantimPayClient.name);

  get enabled(): boolean {
    return Boolean(
      process.env.SANTIMPAY_MERCHANT_ID &&
        process.env.SANTIMPAY_PRIVATE_KEY &&
        this.baseUrl,
    );
  }

  private get baseUrl(): string | null {
    const env = (process.env.SANTIMPAY_ENV || 'test').toLowerCase();
    return env === 'live' || env === 'test' ? BASE_URLS[env] : null;
  }

  private get merchantId(): string {
    return process.env.SANTIMPAY_MERCHANT_ID ?? '';
  }

  private require() {
    if (!this.enabled)
      throw new ServiceUnavailableException('Online payment is not set up yet.');
  }

  /** A JWT signed ES256 with our private key, exactly as the SantimPay SDK makes it. */
  private token(payload: Record<string, unknown>): string {
    const header = b64url(Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })));
    const body = b64url(Buffer.from(JSON.stringify(payload)));
    const key = createPrivateKey(pem(process.env.SANTIMPAY_PRIVATE_KEY ?? ''));
    const signature = sign('sha256', Buffer.from(`${header}.${body}`), {
      key,
      dsaEncoding: 'ieee-p1363',
    });
    return `${header}.${body}.${b64url(signature)}`;
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const reason =
        (data as { reason?: string; Reason?: string; message?: string } | null)?.reason ??
        (data as { Reason?: string } | null)?.Reason ??
        (data as { message?: string } | null)?.message ??
        `HTTP ${res.status}`;
      this.logger.warn(`SantimPay ${path} refused: ${reason}`);
      throw new Error(String(reason));
    }
    return data as T;
  }

  /** Starts a hosted checkout and returns the page to send the member to. */
  async checkoutUrl(input: {
    id: string;
    amount: number;
    reason: string;
    successUrl: string;
    failureUrl: string;
    cancelUrl: string;
    notifyUrl: string;
    phoneNumber?: string | null;
  }): Promise<string> {
    this.require();
    const signedToken = this.token({
      amount: input.amount,
      paymentReason: input.reason,
      merchantId: this.merchantId,
      generated: Math.floor(Date.now() / 1000),
    });
    const body: Record<string, unknown> = {
      id: input.id,
      amount: input.amount,
      reason: input.reason,
      merchantId: this.merchantId,
      signedToken,
      successRedirectUrl: input.successUrl,
      failureRedirectUrl: input.failureUrl,
      cancelRedirectUrl: input.cancelUrl,
      notifyUrl: input.notifyUrl,
    };
    if (input.phoneNumber) body.phoneNumber = input.phoneNumber;
    const data = await this.post<{ url?: string }>('/initiate-payment', body);
    if (!data?.url) throw new Error('SantimPay did not return a checkout page');
    return data.url;
  }

  /** The final word on a transaction, by our id. Callbacks are only trusted through this. */
  async status(id: string): Promise<SantimPayStatus> {
    this.require();
    const signedToken = this.token({
      id,
      merId: this.merchantId,
      generated: Math.floor(Date.now() / 1000),
    });
    return this.post<SantimPayStatus>('/fetch-transaction-status', {
      id,
      merchantId: this.merchantId,
      signedToken,
    });
  }

  /**
   * Whether a callback's token was signed by SantimPay. Without their public key this
   * cannot be checked and returns null; the status API confirms the payment either way.
   */
  callbackSignatureValid(token: string | undefined): boolean | null {
    const raw = process.env.SANTIMPAY_PUBLIC_KEY;
    if (!raw) return null;
    if (!token) return false;
    const parts = token.replace(/^Bearer\s+/i, '').split('.');
    if (parts.length !== 3) return false;
    try {
      const sig = Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      return verify(
        'sha256',
        Buffer.from(`${parts[0]}.${parts[1]}`),
        { key: createPublicKey(pem(raw)), dsaEncoding: 'ieee-p1363' },
        sig,
      );
    } catch {
      return false;
    }
  }
}
