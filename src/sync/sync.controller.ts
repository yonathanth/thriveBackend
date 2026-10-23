import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiSecurity,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SyncService, SYNC_PROTOCOL_VERSION } from './sync.service';
import { SyncPayloadDto } from './dto/sync-payload.dto';
import { SyncResponseDto } from './dto/sync-response.dto';
import { ApiKey } from '../auth/api-key.decorator';
import { Auth } from '../auth/auth.decorator';

@ApiTags('sync')
@Controller('api/sync')
@ApiSecurity('api-key')
@ApiBearerAuth('bearer')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post()
  @ApiKey()
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({
    summary: 'Sync data to cloud',
    description:
      'Synchronizes services, members, attendance, transactions, payment methods, health metrics, staff, other desktop tables (records), deletions and lead statuses from the desktop app to the cloud database',
  })
  @ApiBody({ type: SyncPayloadDto })
  @ApiResponse({
    status: 200,
    description: 'Data synchronized successfully',
    type: SyncResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error - invalid payload',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing API key',
  })
  async sync(@Body() payload: SyncPayloadDto): Promise<SyncResponseDto> {
    return this.syncService.syncData(payload);
  }

  @Get('status')
  @ApiKey()
  @ApiOperation({
    summary: 'Check sync service status',
    description: 'Returns the current status of the sync service',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is operational',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2026-01-12T03:46:41.482Z' },
        protocol: {
          type: 'number',
          example: SYNC_PROTOCOL_VERSION,
          description: 'Highest sync payload version this API accepts',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing API key',
  })
  getStatus(): { status: string; timestamp: string; protocol: number } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      protocol: SYNC_PROTOCOL_VERSION,
    };
  }

  @Get('last-sync')
  @Auth('admin', 'manager')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get last sync time',
    description: 'Returns the most recent sync time from all synced entities',
  })
  @ApiResponse({
    status: 200,
    description: 'Last sync time',
    schema: {
      type: 'object',
      properties: {
        lastSyncAt: {
          type: 'string',
          nullable: true,
          example: '2026-01-17T10:05:36.646Z',
        },
      },
    },
  })
  async getLastSync(): Promise<{ lastSyncAt: string | null }> {
    return this.syncService.getLastSyncTime();
  }

  @Post('test')
  @ApiKey()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Test API connection',
    description: 'Tests the API connection and authentication',
  })
  @ApiResponse({
    status: 200,
    description: 'Connection successful',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Connection successful' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing API key',
  })
  testConnection(): { success: boolean; message: string } {
    return {
      success: true,
      message: 'Connection successful',
    };
  }
}
