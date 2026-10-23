import { Controller, Get, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/auth.decorator';
import type { AuthUser } from '../auth/roles.guard';
import { PortalService } from './portal.service';
import { PortalPageDto } from './portal.dto';

interface AuthedRequest {
  user: AuthUser;
}

/**
 * Member portal: the signed-in member's own membership. Read-only; the desktop owns
 * member data. Website-only contact fields are edited through PUT /api/auth/profile.
 */
@ApiTags('member portal')
@Controller('api/me')
@Auth('member')
@ApiBearerAuth('bearer')
export class MemberPortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('membership')
  @ApiOperation({
    summary: 'My membership: plan, dates, days remaining, freeze state',
  })
  membership(@Request() req: AuthedRequest) {
    return this.portal.myMembership(req.user);
  }

  @Get('attendance')
  @ApiOperation({ summary: 'My check-ins' })
  attendance(@Request() req: AuthedRequest, @Query() query: PortalPageDto) {
    return this.portal.myAttendance(req.user, query);
  }

  @Get('history')
  @ApiOperation({ summary: 'My plan periods, freezes and payments' })
  history(@Request() req: AuthedRequest) {
    return this.portal.myHistory(req.user);
  }
}
