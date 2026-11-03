import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  NotFoundException,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { MembersService } from './members.service';
import { MemberQueryDto } from './dto/member-query.dto';
import {
  MemberDetailsDto,
  MemberResponseDto,
  MemberStatsDto,
  MemberWebDto,
} from './dto/member-response.dto';
import { Auth } from '../auth/auth.decorator';
import type { AuthUser } from '../auth/roles.guard';
import { can, RequirePermission } from '../auth/permissions';
import { redactMember, stripMoney } from '../auth/redact';
import { PaginatedResponseDto, PaginationMeta } from '../common/dto/pagination.dto';
import { Member } from '../entities/member.entity';

@ApiTags('members')
@Controller('api/members')
@Auth('admin', 'manager')
@RequirePermission('members.view')
@ApiBearerAuth('bearer')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  @ApiOperation({
    summary: 'List all members',
    description: 'Returns a paginated list of members with optional filtering and search',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of members',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async findAll(
    @Query() query: MemberQueryDto,
    @Request() req: { user: AuthUser },
  ): Promise<PaginatedResponseDto<MemberWebDto>> {
    const page = await this.membersService.findAll(query);
    return { ...page, data: page.data.map((m) => redactMember(req.user, m)) };
  }

  @Get('stats')
  @RequirePermission('members.stats.view')
  @ApiOperation({
    summary: 'Get member statistics',
    description: 'Returns aggregate statistics about members',
  })
  @ApiResponse({
    status: 200,
    description: 'Member statistics',
    type: MemberStatsDto,
  })
  async getStats(): Promise<MemberStatsDto> {
    return this.membersService.getStats();
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search members',
    description: 'Search members by name, phone, or email',
  })
  @ApiQuery({
    name: 'q',
    description: 'Search query',
    example: 'john',
  })
  @ApiQuery({
    name: 'limit',
    description: 'Maximum results to return',
    required: false,
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: 'Search results',
    type: [MemberResponseDto],
  })
  async search(
    @Query('q') searchTerm: string,
    @Request() req: { user: AuthUser },
    @Query('limit') limit?: number,
  ): Promise<MemberWebDto[]> {
    const found = await this.membersService.search(searchTerm, limit || 10);
    return found.map((m) => redactMember(req.user, m));
  }

  @Get(':id/details')
  @ApiOperation({
    summary: 'Get what the desktop keeps about a member',
    description:
      'Trainer, add-on subscriptions, freeze history, plan periods, group, linked members and drop-in visits',
  })
  @ApiParam({ name: 'id', description: 'Member ID', example: 1 })
  @ApiResponse({ status: 200, type: MemberDetailsDto })
  @ApiResponse({ status: 404, description: 'Member not found' })
  async getDetails(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: AuthUser },
  ): Promise<MemberDetailsDto> {
    const member = await this.membersService.findOne(id);
    if (!member) {
      throw new NotFoundException(`Member with ID ${id} not found`);
    }
    const details = await this.membersService.getDetails(member);
    // What the member paid for plans, add-ons and drop-ins is payment history.
    if (can(req.user, 'members.payments.view')) return details;
    return {
      ...details,
      addons: details.addons.map(stripMoney),
      planHistory: details.planHistory.map(stripMoney),
      dropIns: details.dropIns.map(stripMoney),
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get member by ID',
    description: 'Returns a single member by their database ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Member ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Member found',
    type: MemberWebDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Member not found',
  })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: AuthUser },
  ): Promise<MemberWebDto> {
    const member = await this.membersService.findOne(id);
    if (!member) {
      throw new NotFoundException(`Member with ID ${id} not found`);
    }
    return redactMember(req.user, this.membersService.transformToWebFormat(member));
  }
}









