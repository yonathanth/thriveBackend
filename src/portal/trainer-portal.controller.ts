import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/auth.decorator';
import type { AuthUser } from '../auth/roles.guard';
import { PortalService } from './portal.service';
import { AssignedMembersQueryDto, PortalPageDto } from './portal.dto';

interface AuthedRequest {
  user: AuthUser;
}

/** Trainer portal: only members assigned to the signed-in trainer on the desktop. */
@ApiTags('trainer portal')
@Controller('api/trainer')
@Auth('trainer')
@ApiBearerAuth('bearer')
export class TrainerPortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('members')
  @ApiOperation({ summary: 'Members assigned to me' })
  members(
    @Request() req: AuthedRequest,
    @Query() query: AssignedMembersQueryDto,
  ) {
    return this.portal.assignedMembers(req.user, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Counts across my assigned members' })
  stats(@Request() req: AuthedRequest) {
    return this.portal.assignedStats(req.user);
  }

  @Get('members/:id')
  @ApiOperation({ summary: 'Limited profile of an assigned member' })
  member(@Request() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.portal.assignedMember(req.user, id);
  }

  @Get('members/:id/attendance')
  @ApiOperation({ summary: 'Check-ins of an assigned member' })
  memberAttendance(
    @Request() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PortalPageDto,
  ) {
    return this.portal.assignedMemberAttendance(req.user, id, query);
  }

  @Get('attendance/today')
  @ApiOperation({ summary: 'Assigned members who checked in today' })
  today(@Request() req: AuthedRequest) {
    return this.portal.todayCheckIns(req.user);
  }

  @Get('schedule')
  @ApiOperation({ summary: 'Weekly timetable with my sessions marked' })
  schedule(@Request() req: AuthedRequest) {
    return this.portal.schedule(req.user);
  }

  @Get('me/attendance')
  @ApiOperation({ summary: 'My own check-ins (last 60 days)' })
  myAttendance(@Request() req: AuthedRequest) {
    return this.portal.myStaffAttendance(req.user);
  }
}
