import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Auth } from '../auth/auth.decorator';
import type { OutreachCandidate, OutreachKind } from './sms-outreach.service';
import { SmsOutreachService } from './sms-outreach.service';

const KINDS: OutreachKind[] = ['absent', 'inactive'];

export class OutreachSendDto {
  @IsIn(KINDS)
  kind: 'absent' | 'inactive';

  @IsArray()
  @ArrayMaxSize(5000)
  @IsInt({ each: true })
  memberIds: number[];

  @IsOptional()
  @IsInt()
  @Min(0)
  minDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  template?: string;
}

@ApiTags('sms')
@Controller('api/sms/outreach')
@Auth('admin', 'manager')
@ApiBearerAuth('bearer')
export class SmsOutreachController {
  constructor(private readonly outreach: SmsOutreachService) {}

  @Get()
  @ApiOperation({ summary: 'Members absent or inactive for at least minDays, with their phone' })
  @ApiQuery({ name: 'kind', enum: KINDS })
  @ApiQuery({ name: 'minDays', required: false, description: 'Omit for all inactive members' })
  @ApiQuery({ name: 'maxDays', required: false, description: 'Upper end of the range; omit for none' })
  candidates(
    @Query('kind') kind: string,
    @Query('minDays') minDays?: string,
    @Query('maxDays') maxDays?: string,
  ): Promise<OutreachCandidate[]> {
    if (!KINDS.includes(kind as OutreachKind)) throw new BadRequestException('kind must be absent or inactive');
    const num = (v?: string) => {
      const n = v == null || v === '' ? undefined : Number(v);
      if (n !== undefined && isNaN(n)) throw new BadRequestException(`Not a number: ${v}`);
      return n;
    };
    return this.outreach.candidates(kind as OutreachKind, num(minDays), num(maxDays));
  }

  @Post('send')
  @ApiOperation({ summary: 'Text the chosen absent or inactive members now' })
  send(@Body() dto: OutreachSendDto): Promise<{ sent: number; skipped: number; campaignIds: string[] }> {
    return this.outreach.send(dto.kind, dto.memberIds, dto.minDays, dto.template, dto.maxDays);
  }
}
