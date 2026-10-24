import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiKey } from '../auth/api-key.decorator';
import { Auth } from '../auth/auth.decorator';
import type { AuthUser } from '../auth/roles.guard';
import { PayrollService } from './payroll.service';

class PaySetupDto {
  @IsIn(['none', 'monthly', 'daily'])
  baseType: string;

  @IsNumber()
  @Min(0)
  baseAmount: number;

  @IsIn(['monthly', 'days'])
  cycle: string;

  @IsInt()
  @Min(7)
  @Max(62)
  cycleDays: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  cycleStart: string;

  @IsBoolean()
  deductAbsence: boolean;

  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workDays: number[];

  @IsBoolean()
  active: boolean;
}

class RevenueShareDto {
  @IsOptional()
  @IsInt()
  id?: number | null;

  @IsIn(['assigned_members', 'addon_trainer', 'drop_in_instructor', 'service'])
  scope: string;

  @IsOptional()
  @IsIn(['plan', 'addon', 'drop_in'])
  targetKind?: string | null;

  @IsOptional()
  @IsInt()
  targetLocalId?: number | null;

  @IsIn(['percent', 'fixed'])
  rateType: string;

  @IsNumber()
  @Min(0)
  rate: number;
}

export class SaveStaffPayDto {
  @ValidateNested()
  @Type(() => PaySetupDto)
  setup: PaySetupDto;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RevenueShareDto)
  shares: RevenueShareDto[];
}

export class PayPayoutDto {
  /** What was actually paid; the form starts at the calculated amount */
  @IsNumber()
  @Min(0)
  paidAmount: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  paidDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentMethod?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

class CollectedPayoutDto {
  @IsInt()
  id: number;

  @IsInt()
  revision: number;
}

export class CollectedPayoutsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CollectedPayoutDto)
  collected: CollectedPayoutDto[];
}

/**
 * Payroll is set up, calculated and paid here, by admins only: they decide what staff
 * are paid. The gym app collects paid payouts with its API key and books them as expenses.
 */
@ApiTags('payroll')
@Controller('api/payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('staff')
  @Auth('admin')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Staff with their pay setup, revenue shares and what is due',
  })
  staff() {
    return this.payroll.staffList();
  }

  @Put('staff/:staffLocalId')
  @Auth('admin')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: "Save a staff member's pay setup and revenue shares together",
  })
  save(
    @Request() req: { user: AuthUser },
    @Param('staffLocalId', ParseIntPipe) staffLocalId: number,
    @Body() body: SaveStaffPayDto,
  ) {
    return this.payroll.save(req.user, staffLocalId, body);
  }

  @Get('payouts')
  @Auth('admin')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Pay periods: running, due and paid' })
  list() {
    return this.payroll.list();
  }

  @Post('payouts/:id/pay')
  @Auth('admin')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Mark a finished pay period paid with what was actually paid',
  })
  pay(
    @Request() req: { user: AuthUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: PayPayoutDto,
  ) {
    return this.payroll.pay(req.user, id, body);
  }

  @Post('payouts/:id/unpay')
  @Auth('admin')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Undo a payment recorded by mistake' })
  unpay(
    @Request() req: { user: AuthUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.payroll.unpay(req.user, id);
  }

  @Get('paid/uncollected')
  @ApiKey()
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'For the gym app: paid payouts it does not have the latest of',
  })
  uncollected() {
    return this.payroll.uncollected();
  }

  @Post('paid/collected')
  @ApiKey()
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'For the gym app: paid payouts it has stored' })
  async collected(@Body() body: CollectedPayoutsDto) {
    return { collected: await this.payroll.collected(body.collected) };
  }
}

/** Each member of staff's own payslips, for those with a website login. */
@ApiTags('payroll')
@Controller('api/payslips')
@Auth('admin', 'manager', 'trainer')
@ApiBearerAuth('bearer')
export class PayslipsController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('me')
  @ApiOperation({ summary: "The signed-in staff member's pay periods" })
  mine(@Request() req: { user: AuthUser }) {
    return this.payroll.mine(req.user.staffLocalId ?? null);
  }
}
