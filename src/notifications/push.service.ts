import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import { PushSubscription } from '../entities/push-subscription.entity';
import { NOTIFICATION_TYPES } from './notification-text';

/** What the service worker receives and shows. */
export interface PushMessage {
  title: string;
  body: string;
  /** Page opened when the notification is clicked */
  url: string;
  /** Same tag replaces an earlier notification on the device instead of stacking */
  tag: string;
  type: string;
  notificationId?: number;
  timestamp: number;
}

/**
 * Push services browsers subscribe through. A subscription naming any other host is
 * refused, so the server never posts to an address an attacker chose.
 * PUSH_ENDPOINT_HOSTS (comma-separated) can add more.
 */
const DEFAULT_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'notify.windows.com',
  'push.apple.com',
];

/** A subscription failing this many times in a row, without the service saying it is gone, is dropped. */
const MAX_FAILURES = 20;

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;
  private publicKey: string | null = null;
  private allowedHosts: string[] = DEFAULT_PUSH_HOSTS;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(PushSubscription)
    private readonly subscriptions: Repository<PushSubscription>,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT') || 'mailto:admin@example.com';
    const extraHosts = (this.config.get<string>('PUSH_ENDPOINT_HOSTS') || '')
      .split(',')
      .map(h => h.trim().toLowerCase())
      .filter(Boolean);
    this.allowedHosts = [...DEFAULT_PUSH_HOSTS, ...extraHosts];

    if (!publicKey || !privateKey) {
      this.logger.warn(
        'Web Push is off: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (generate with `npx web-push generate-vapid-keys`). In-app notifications still work.',
      );
      return;
    }
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.publicKey = publicKey;
      this.enabled = true;
      if (!this.config.get<string>('VAPID_SUBJECT')) {
        this.logger.warn('VAPID_SUBJECT is not set; Apple may refuse pushes. Use mailto:you@yourgym.com.');
      }
    } catch (error) {
      this.logger.error(
        `Web Push is off: invalid VAPID settings: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  getConfig(): { enabled: boolean; publicKey: string | null } {
    return { enabled: this.enabled, publicKey: this.publicKey };
  }

  private checkEndpoint(endpoint: string): void {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new BadRequestException('Push endpoint is not a URL');
    }
    const host = url.hostname.toLowerCase();
    const known = this.allowedHosts.some(h => host === h || host.endsWith(`.${h}`));
    if (url.protocol !== 'https:' || !known) {
      throw new BadRequestException(`Push endpoint host is not a known push service: ${host}`);
    }
  }

  private cleanTypes(types?: string[], hidden: string[] = []): string[] {
    const wanted = (types ?? [...NOTIFICATION_TYPES]).filter(
      t => (NOTIFICATION_TYPES as readonly string[]).includes(t) && !hidden.includes(t),
    );
    return [...new Set(wanted)];
  }

  /** Saves this browser's subscription for the admin; a browser already subscribed (maybe by another admin) is taken over. */
  async subscribe(
    adminId: number,
    input: { endpoint: string; p256dh: string; auth: string; types?: string[] },
    userAgent: string | null,
    hidden: string[] = [],
  ): Promise<PushSubscription> {
    this.checkEndpoint(input.endpoint);
    const existing = await this.subscriptions.findOne({ where: { endpoint: input.endpoint } });
    const row = existing ?? this.subscriptions.create({ endpoint: input.endpoint });
    row.adminId = adminId;
    row.p256dh = input.p256dh;
    row.auth = input.auth;
    row.types = this.cleanTypes(input.types ?? existing?.types, hidden);
    row.userAgent = userAgent ? userAgent.slice(0, 255) : null;
    row.failureCount = 0;
    return this.subscriptions.save(row);
  }

  async setTypes(
    adminId: number,
    endpoint: string,
    types: string[],
    hidden: string[] = [],
  ): Promise<PushSubscription | null> {
    const row = await this.subscriptions.findOne({ where: { endpoint, adminId } });
    if (!row) return null;
    row.types = this.cleanTypes(types, hidden);
    return this.subscriptions.save(row);
  }

  async unsubscribe(adminId: number, endpoint: string): Promise<boolean> {
    const result = await this.subscriptions.delete({ endpoint, adminId });
    return (result.affected ?? 0) > 0;
  }

  listForAdmin(adminId: number): Promise<PushSubscription[]> {
    return this.subscriptions.find({ where: { adminId }, order: { createdAt: 'DESC' } });
  }

  /** Every subscription that wants this type, across admins. */
  async subscriptionsFor(types: string[]): Promise<PushSubscription[]> {
    if (!this.enabled || types.length === 0) return [];
    return this.subscriptions
      .createQueryBuilder('s')
      .where('s.types && :types', { types })
      .getMany();
  }

  /** Sends one message to some subscriptions; returns how many were delivered. */
  async send(subs: PushSubscription[], message: PushMessage): Promise<{ sent: number; failed: number }> {
    if (!this.enabled || subs.length === 0) return { sent: 0, failed: 0 };
    const payload = JSON.stringify(message);
    const outcomes = await Promise.all(subs.map(sub => this.deliver(sub, payload)));
    const sent = outcomes.filter(Boolean).length;
    return { sent, failed: outcomes.length - sent };
  }

  private async deliver(sub: PushSubscription, payload: string): Promise<boolean> {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 24 * 60 * 60, urgency: 'normal' },
      );
      if (sub.failureCount > 0 || !sub.lastSuccessAt || Date.now() - sub.lastSuccessAt.getTime() > 3_600_000) {
        await this.subscriptions.update(sub.id, { failureCount: 0, lastSuccessAt: new Date() });
      }
      return true;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // The browser unsubscribed or the subscription expired; it will never work again.
        await this.subscriptions.delete(sub.id);
        this.logger.log(`Removed expired push subscription ${sub.id} (HTTP ${status})`);
      } else if (sub.failureCount + 1 >= MAX_FAILURES) {
        await this.subscriptions.delete(sub.id);
        this.logger.warn(`Removed push subscription ${sub.id} after ${MAX_FAILURES} failed deliveries`);
      } else {
        await this.subscriptions.increment({ id: sub.id }, 'failureCount', 1);
        this.logger.warn(
          `Push to subscription ${sub.id} failed${status ? ` (HTTP ${status})` : ''}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
      return false;
    }
  }
}
