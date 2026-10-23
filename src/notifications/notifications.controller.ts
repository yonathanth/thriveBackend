import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Patch,
  Post,
  Query,
  Request,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/auth.decorator';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { hiddenNotificationTypes } from './notification-access';
import {
  MarkReadDto,
  NotificationQueryDto,
  PushEndpointDto,
  PushSubscribeDto,
  PushTypesDto,
} from './dto/notification.dto';

interface AuthedRequest {
  user: { id: number; name: string; role: string };
  headers: Record<string, string | undefined>;
}

@ApiTags('notifications')
@Controller('api/notifications')
@Auth('admin', 'manager')
@ApiBearerAuth('bearer')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications, newest first, with read state for the signed-in admin' })
  list(@Request() req: AuthedRequest, @Query() query: NotificationQueryDto) {
    return this.notifications.list(req.user.id, {
      page: query.page,
      limit: query.limit,
      unreadOnly: query.unread,
      type: query.type,
      hidden: hiddenNotificationTypes(req.user.role),
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'How many notifications the signed-in admin has not read' })
  async unreadCount(@Request() req: AuthedRequest): Promise<{ count: number }> {
    return {
      count: await this.notifications.unreadCount(req.user.id, hiddenNotificationTypes(req.user.role)),
    };
  }

  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark notifications read' })
  async markRead(@Request() req: AuthedRequest, @Body() body: MarkReadDto): Promise<void> {
    await this.notifications.markRead(req.user.id, body.ids, hiddenNotificationTypes(req.user.role));
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark every notification read' })
  async markAllRead(@Request() req: AuthedRequest): Promise<{ marked: number }> {
    return {
      marked: await this.notifications.markAllRead(req.user.id, hiddenNotificationTypes(req.user.role)),
    };
  }
}

@ApiTags('push')
@Controller('api/push')
@Auth('admin', 'manager')
@ApiBearerAuth('bearer')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('config')
  @ApiOperation({ summary: 'Whether Web Push is set up, and the key browsers subscribe with' })
  config() {
    return this.push.getConfig();
  }

  @Get('subscriptions')
  @ApiOperation({ summary: "The signed-in admin's subscribed devices" })
  async subscriptions(@Request() req: AuthedRequest) {
    const subs = await this.push.listForAdmin(req.user.id);
    return subs.map(s => ({
      endpoint: s.endpoint,
      types: s.types,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastSuccessAt: s.lastSuccessAt,
    }));
  }

  @Post('subscriptions')
  @ApiOperation({ summary: 'Subscribe this browser to push notifications' })
  async subscribe(@Request() req: AuthedRequest, @Body() body: PushSubscribeDto) {
    if (!this.push.getConfig().enabled) {
      throw new ServiceUnavailableException('Push notifications are not set up on the server');
    }
    const sub = await this.push.subscribe(
      req.user.id,
      { endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, types: body.types },
      req.headers['user-agent'] ?? null,
      hiddenNotificationTypes(req.user.role),
    );
    return { endpoint: sub.endpoint, types: sub.types };
  }

  @Patch('subscriptions')
  @ApiOperation({ summary: 'Choose which notifications this browser receives' })
  async setTypes(@Request() req: AuthedRequest, @Body() body: PushTypesDto) {
    const sub = await this.push.setTypes(
      req.user.id,
      body.endpoint,
      body.types,
      hiddenNotificationTypes(req.user.role),
    );
    if (!sub) throw new NotFoundException('This browser is not subscribed');
    return { endpoint: sub.endpoint, types: sub.types };
  }

  @Post('subscriptions/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Stop push notifications to this browser' })
  async unsubscribe(@Request() req: AuthedRequest, @Body() body: PushEndpointDto): Promise<void> {
    await this.push.unsubscribe(req.user.id, body.endpoint);
  }

  @Post('test')
  @ApiOperation({ summary: "Send a test notification to the signed-in admin's devices" })
  async test(@Request() req: AuthedRequest, @Body() body: PushEndpointDto) {
    const subs = (await this.push.listForAdmin(req.user.id)).filter(s => s.endpoint === body.endpoint);
    if (subs.length === 0) throw new NotFoundException('This browser is not subscribed');
    return this.push.send(subs, {
      title: 'Notifications are on',
      body: `${req.user.name}, this device will be notified of payments and membership changes.`,
      url: '/admin/notifications',
      tag: 'notification-test',
      type: 'test',
      timestamp: Date.now(),
    });
  }
}
