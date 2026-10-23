import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
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
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiKey } from '../auth/api-key.decorator';
import { Auth } from '../auth/auth.decorator';
import type { AuthUser } from '../auth/roles.guard';
import { PayrollService } from './payroll.service';

export class ApprovePayoutDto {
  /** What was actually paid; defaults to the calculated amount in the form */
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

class RecordedApprovalDto {
  @IsInt()
  id: number;

  @IsOptional()
  @IsInt()
  transactionLocalId?: number | null;
}

export class AckApprovalsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecordedApprovalDto)
  recorded: RecordedApprovalDto[];
}

/**
 * Payouts the gym app calculated, approved by admins only: they decide what is paid.
 * The gym app collects approvals with its API key.
 */
@ApiTags('payroll')
@Controller('api/payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('payouts')
  @Auth('admin')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Recent payouts: running, due for approval, approved and paid',
  })
  list() {
    return this.payroll.list();
  }

  @Post('payouts/:id/approve')
  @Auth('admin')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Approve a finished pay period with what was actually paid',
  })
  approve(
    @Request() req: { user: AuthUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ApprovePayoutDto,
  ) {
    return this.payroll.approve(req.user, id, body);
  }

  @Get('approvals/pending')
  @ApiKey()
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'For the gym app: approvals it has not recorded yet',
  })
  pending() {
    return this.payroll.pending();
  }

  @Post('approvals/ack')
  @ApiKey()
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'For the gym app: approvals it recorded as expenses',
  })
  async acknowledge(@Body() body: AckApprovalsDto) {
    return { acknowledged: await this.payroll.acknowledge(body.recorded) };
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
