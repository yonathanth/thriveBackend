import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
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
  IsIn,
  IsInt,
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
    return this.payments.decide(reference, body.status, body.by ?? null, body.note ?? null);
  }
}
