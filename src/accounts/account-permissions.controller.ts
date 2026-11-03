import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/auth.decorator';
import { RequirePermission } from '../auth/permissions';
import type { AuthUser } from '../auth/roles.guard';
import { AccountPermissionsService } from './account-permissions.service';
import { SetPermissionsDto } from './dto/account.dto';

/** Admin-only: what each manager or trainer account may see and do on the website. */
@ApiTags('accounts')
@Controller('api')
@Auth('admin')
@RequirePermission('accounts.permissions.manage')
@ApiBearerAuth('bearer')
export class AccountPermissionsController {
  constructor(private readonly permissions: AccountPermissionsService) {}

  @Get('permissions/catalog')
  @ApiOperation({ summary: 'Every website permission and the role defaults' })
  catalog() {
    return this.permissions.catalog();
  }

  @Get('accounts/:id/permissions')
  @ApiOperation({
    summary: "An account's permissions: role default, override and effective",
  })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.permissions.get(id);
  }

  @Put('accounts/:id/permissions')
  @ApiOperation({
    summary:
      'Grant or deny single permissions, or reset them to the role default',
    description:
      "Takes effect on the account's next request; nobody is signed out.",
  })
  set(
    @Request() req: { user: AuthUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetPermissionsDto,
  ) {
    return this.permissions.set(req.user, id, dto.overrides);
  }
}
