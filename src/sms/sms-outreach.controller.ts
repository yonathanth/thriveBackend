import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Auth } from '../auth/auth.decorator';
import type { OutreachCandidate, OutreachKind } from './sms-outreach.service';
import { OUTREACH_KINDS, SmsOutreachService } from './sms-outreach.service';
import type { BatchResult } from './sms.service';

const KINDS = OUTREACH_KINDS;

export class OutreachSendDto {
  @IsIn(KINDS)
  kind: OutreachKind;

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
  @ApiOperation({
    summary:
      'Members to text by hand: all, active, expiring, absent or inactive, with their phone',
  })
  @ApiQuery({ name: 'kind', enum: KINDS })
  @ApiQuery({
    name: 'minDays',
    required: false,
    description: 'Lower end of the days range; each list has its own default',
  })
  @ApiQuery({
    name: 'maxDays',
    required: false,
    description: 'Upper end of the range; omit for none',
  })
  candidates(
    @Query('kind') kind: string,
    @Query('minDays') minDays?: string,
    @Query('maxDays') maxDays?: string,
  ): Promise<OutreachCandidate[]> {
    if (!KINDS.includes(kind as OutreachKind))
      throw new BadRequestException(`kind must be one of ${KINDS.join(', ')}`);
    const num = (v?: string) => {
      const n = v == null || v === '' ? undefined : Number(v);
      if (n !== undefined && isNaN(n))
        throw new BadRequestException(`Not a number: ${v}`);
      return n;
    };
    return this.outreach.candidates(
      kind as OutreachKind,
      num(minDays),
      num(maxDays),
    );
  }

  @Post('send')
  @ApiOperation({
    summary:
      'Text the chosen members of a list now, each with their own message',
  })
  send(
    @Body() dto: OutreachSendDto,
  ): Promise<BatchResult & { skipped: number }> {
    return this.outreach.send(
      dto.kind,
      dto.memberIds,
      dto.minDays,
      dto.template,
      dto.maxDays,
    );
  }
}
