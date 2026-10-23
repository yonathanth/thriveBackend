import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Request,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { Auth } from '../auth/auth.decorator';
import { Roles } from '../auth/roles';
import { CHECK_INTERVALS, GOAL_METRICS, ProgressService, Viewer } from './progress.service';

export class GoalDto {
  @IsIn(GOAL_METRICS)
  metric: string;

  /** In the units shown (kg for masses); null removes the goal */
  @IsOptional()
  @IsNumber()
  target?: number | null;
}

export class ScheduleDto {
  /** Days between checks; null stops the reminders */
  @IsOptional()
  @IsInt()
  @IsIn(CHECK_INTERVALS)
  intervalDays?: number | null;
}

export class PhotoDto {
  @IsInt()
  healthMetricId: number;

  /** The compressed photo, as base64 or a data URL */
  @IsString()
  @MaxLength(5_000_000)
  image: string;

  @IsString()
  @MaxLength(600_000)
  thumb: string;

  @IsBoolean()
  visibleToTrainer: boolean;

  @IsBoolean()
  visibleToStaff: boolean;
}

export class VisibilityDto {
  @IsBoolean()
  visibleToTrainer: boolean;

  @IsBoolean()
  visibleToStaff: boolean;
}

/**
 * Progress for every role: members their own, trainers their clients, admins and
 * managers everyone. Photos are the member's to add, share and remove.
 */
@ApiTags('progress')
@Controller('api/progress')
@Auth('admin', 'manager', 'trainer', 'member')
@ApiBearerAuth('bearer')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get('me')
  @Roles('member')
  @ApiOperation({ summary: "The signed-in member's measurements, photos, goals and check schedule" })
  mine(@Request() req: { user: Viewer }) {
    return this.progress.progress(req.user, 'me');
  }

  @Get('member/:id')
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: "A member's progress (trainers: their clients); photos only as the member shared them" })
  ofMember(@Request() req: { user: Viewer }, @Param('id', ParseIntPipe) id: number) {
    return this.progress.progress(req.user, id);
  }

  @Put('me/goal')
  @Roles('member')
  setMyGoal(@Request() req: { user: Viewer }, @Body() body: GoalDto) {
    return this.progress.setGoal(req.user, 'me', body.metric, body.target ?? null);
  }

  @Put('member/:id/goal')
  @Roles('admin', 'manager', 'trainer')
  setGoal(@Request() req: { user: Viewer }, @Param('id', ParseIntPipe) id: number, @Body() body: GoalDto) {
    return this.progress.setGoal(req.user, id, body.metric, body.target ?? null);
  }

  @Put('member/:id/schedule')
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'How often the member should come for a progress check' })
  setSchedule(@Request() req: { user: Viewer }, @Param('id', ParseIntPipe) id: number, @Body() body: ScheduleDto) {
    return this.progress.setSchedule(req.user, id, body.intervalDays ?? null);
  }

  @Post('photos')
  @Roles('member')
  @ApiOperation({ summary: 'Attach a compressed photo to one of your measurements' })
  addPhoto(@Request() req: { user: Viewer }, @Body() body: PhotoDto) {
    return this.progress.addPhoto(req.user, body);
  }

  @Patch('photos/:id')
  @Roles('member')
  @ApiOperation({ summary: 'Choose who besides you may see a photo' })
  setVisibility(@Request() req: { user: Viewer }, @Param('id', ParseIntPipe) id: number, @Body() body: VisibilityDto) {
    return this.progress.setPhotoVisibility(req.user, id, body.visibleToTrainer, body.visibleToStaff);
  }

  @Delete('photos/:id')
  @Roles('member')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePhoto(@Request() req: { user: Viewer }, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.progress.deletePhoto(req.user, id);
  }

  @Get('photos/:id/:size')
  @ApiOperation({ summary: 'A photo (full or thumb), if the signed-in account may see it' })
  async photo(
    @Request() req: { user: Viewer },
    @Param('id', ParseIntPipe) id: number,
    @Param('size') size: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.progress.photoFile(req.user, id, size === 'thumb' ? 'thumb' : 'full');
    res.setHeader('Content-Type', file.mimeType);
    // Private: never kept by shared caches.
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.sendFile(file.path);
  }
}
