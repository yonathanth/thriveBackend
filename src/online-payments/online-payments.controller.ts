import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiKey } from '../auth/api-key.decorator';
import { Auth } from '../auth/auth.decorator';
import type { AuthUser } from '../auth/roles.guard';
import { OnlinePaymentsService } from './online-payments.service';

export class StartRenewalPaymentDto {
  @IsInt()
  serviceLocalId: number;

  /** The member ticked "I agree to the Terms and Refund Policy" (SantimPay agreement §8, §9) */
  @Equals(true, { message: 'Please accept the Terms and Refund Policy to continue.' })
  acceptedTerms: boolean;
}

/** Someone new joining from the website and paying for their first plan. */
export class StartJoinPaymentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phoneNumber: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsInt()
  serviceLocalId: number;

  /** Ticked "I agree to the Terms and Refund Policy" (SantimPay agreement §8, §9) */
  @Equals(true, { message: 'Please accept the Terms and Refund Policy to continue.' })
  acceptedTerms: boolean;
}

export class CollectedOnlinePaymentsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  references: string[];
}

export class OnlinePaymentDecisionDto {
  @IsIn(['applied', 'rejected', 'refunded'])
  status: 'applied' | 'rejected' | 'refunded';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  by?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  /** Applying a join registered the person: the gym app's id for the new member */
  @IsOptional()
  @IsInt()
  memberLocalId?: number;
}

/** The signed-in member renewing online. Pays only; the gym confirms the renewal. */
@ApiTags('member portal')
@Controller('api/me/online-payments')
@Auth('member')
@ApiBearerAuth('bearer')
export class MemberOnlinePaymentsController {
  constructor(private readonly payments: OnlinePaymentsService) {}

  @Get('options')
  @ApiOperation({ summary: 'Plans I can renew onto online, or why I cannot' })
  options(@Request() req: { user: AuthUser }) {
    return this.payments.options(req.user);
  }

  @Get()
  @ApiOperation({ summary: 'My online payments, newest first' })
  mine(@Request() req: { user: AuthUser }) {
    return this.payments.mine(req.user);
  }

  @Post()
  @ApiOperation({ summary: 'Start paying for a renewal; returns the SantimPay page' })
  start(@Request() req: { user: AuthUser }, @Body() body: StartRenewalPaymentDto) {
    return this.payments.start(req.user, body.serviceLocalId);
  }

  @Get(':reference')
  @ApiOperation({ summary: 'One of my payments, checked with SantimPay if still open' })
  one(@Request() req: { user: AuthUser }, @Param('reference') reference: string) {
    return this.payments.refreshOwn(req.user, reference);
  }
}

/** Checkouts one address may open per hour; each also creates a registration. */
const JOIN_STARTS_PER_HOUR = 10;

/**
 * Joining from the public website, without an account. Pays only; the person becomes
 * a member when the gym applies the payment.
 */
@ApiTags('public')
@Controller('api/public/join')
export class PublicJoinController {
  private readonly starts = new Map<string, number[]>();

  constructor(private readonly payments: OnlinePaymentsService) {}

  @Get('available')
  @ApiOperation({ summary: 'Whether joining can be paid for online right now' })
  available() {
    return { available: this.payments.joinAvailable() };
  }

  @Post()
  @ApiOperation({ summary: 'Start paying to join; returns the SantimPay page' })
  start(@Req() req: { ip?: string; headers: Record<string, string | string[] | undefined> }, @Body() body: StartJoinPaymentDto) {
    this.limit(req);
    return this.payments.startJoin(body);
  }

  @Get(':reference')
  @ApiOperation({ summary: 'How a join payment ended, checked with SantimPay if still open' })
  one(@Param('reference') reference: string) {
    return this.payments.joinStatus(reference);
  }

  /** A plain per-address limit, so the form cannot be used to flood leads or checkouts. */
  private limit(req: { ip?: string; headers: Record<string, string | string[] | undefined> }) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const now = Date.now();
    const recent = (this.starts.get(ip) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= JOIN_STARTS_PER_HOUR)
      throw new HttpException('Too many attempts. Please try again later or call the front desk.', HttpStatus.TOO_MANY_REQUESTS);
    recent.push(now);
    this.starts.set(ip, recent);
    if (this.starts.size > 5000)
      for (const [key, times] of this.starts) if (times.every((t) => now - t >= 3_600_000)) this.starts.delete(key);
  }
}

@ApiTags('online payments')
@Controller('api/online-payments')
export class OnlinePaymentsController {
  constructor(private readonly payments: OnlinePaymentsService) {}

  @Get()
  @Auth('admin', 'manager')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'All online payments, failed ones included (read-only)' })
  list(
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.payments.list({ status, from, to, page: Number(page), limit: Number(limit) });
  }

  /**
   * SantimPay's server-to-server callback. Public by necessity: its signature is
   * checked, and the payment is confirmed with SantimPay's status API before anything
   * is recorded. Always answers 200 so SantimPay does not retry a callback we read.
   */
  @Post('santimpay/notify')
  @HttpCode(200)
  @ApiOperation({ summary: 'SantimPay payment callback' })
  async notify(
    @Body() body: Record<string, unknown>,
    @Headers('signed-token') dashed?: string,
    @Headers('signedtoken') plain?: string,
    @Headers('authorization') bearer?: string,
  ) {
    await this.payments.notify(body ?? {}, dashed ?? plain ?? bearer);
    return { received: true };
  }

  @Get('uncollected')
  @ApiKey()
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'For the gym app: paid online payments it has not stored' })
  uncollected() {
    return this.payments.uncollected();
  }

  @Post('collected')
  @ApiKey()
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'For the gym app: online payments it has stored' })
  async collected(@Body() body: CollectedOnlinePaymentsDto) {
    return { collected: await this.payments.collected(body.references) };
  }

  @Post(':reference/decision')
  @ApiKey()
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'For the gym app: staff applied, rejected or refunded it' })
  decide(@Param('reference') reference: string, @Body() body: OnlinePaymentDecisionDto) {
    return this.payments.decide(
      reference,
      body.status,
      body.by ?? null,
      body.note ?? null,
      body.memberLocalId ?? null,
    );
  }
}
