import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/auth.decorator';
import type { AuthUser } from '../auth/roles.guard';
import { AccountsService } from './accounts.service';
import {
  AccountDto,
  AccountQueryDto,
  ConflictQueryDto,
  CreateAdminDto,
  SetAccountStatusDto,
} from './dto/account.dto';

interface AuthedRequest {
  user: AuthUser;
}

/**
 * Website logins. Admins see and manage everyone; managers see trainer and member
 * accounts and may reset their passwords. Permission checks live in account-policy.
 */
@ApiTags('accounts')
@Controller('api/accounts')
@ApiBearerAuth('bearer')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @Auth('admin', 'manager')
  @ApiOperation({ summary: 'List website accounts the signed-in user may see' })
  list(@Request() req: AuthedRequest, @Query() query: AccountQueryDto) {
    return this.accounts.list(req.user, query);
  }

  @Get('conflicts')
  @Auth('admin', 'manager')
  @ApiOperation({
    summary: 'Synced records that could not be given a login automatically',
  })
  conflicts(@Query() query: ConflictQueryDto) {
    return this.accounts.listConflicts(query.status ?? 'open');
  }

  @Post('conflicts/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @Auth('admin', 'manager')
  @ApiOperation({ summary: 'Mark a link conflict as handled' })
  resolveConflict(
    @Request() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.accounts.resolveConflict(req.user, id);
  }

  @Post('reconcile')
  @HttpCode(HttpStatus.OK)
  @Auth('admin', 'manager')
  @ApiOperation({
    summary:
      'Re-run login provisioning for every synced member and staff record',
  })
  reconcile(@Request() req: AuthedRequest) {
    return this.accounts.reconcileAll(req.user);
  }

  @Post('admins')
  @Auth('admin')
  @ApiOperation({ summary: 'Create a website-only admin (signs in by phone)' })
  createAdmin(
    @Request() req: AuthedRequest,
    @Body() dto: CreateAdminDto,
  ): Promise<AccountDto> {
    return this.accounts.createAdmin(req.user, dto);
  }

  @Get(':id')
  @Auth('admin', 'manager')
  @ApiOperation({ summary: 'One account' })
  get(
    @Request() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AccountDto> {
    return this.accounts.get(req.user, id);
  }

  @Get(':id/audit')
  @Auth('admin', 'manager')
  @ApiOperation({ summary: 'Recent account actions (resets, status changes)' })
  audit(@Request() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.accounts.recentAudit(req.user, id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @Auth('admin', 'manager')
  @ApiOperation({
    summary: 'Reset a password to the temporary default',
    description:
      'The holder must choose a new password at next sign-in; their sessions end.',
  })
  resetPassword(
    @Request() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AccountDto> {
    return this.accounts.resetPassword(req.user, id);
  }

  @Patch(':id/status')
  @Auth('admin')
  @ApiOperation({ summary: 'Activate or deactivate an account' })
  setStatus(
    @Request() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetAccountStatusDto,
  ): Promise<AccountDto> {
    return this.accounts.setStatus(req.user, id, dto.isActive);
  }
}
