import { Controller, Get, Query, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Auth } from '../auth/auth.decorator';
import type { AuthUser } from '../auth/roles.guard';
import { PaginatedResponseDto } from '../common/dto/pagination.dto';
import {
  AssignmentView,
  HoldingView,
  InventoryItemView,
  InventoryReport,
  InventoryService,
  MovementView,
  SaleView,
} from './inventory.service';
import {
  AssignmentsQueryDto,
  InventoryItemsQueryDto,
  InventoryRangeQueryDto,
  InventoryReportQueryDto,
} from './dto/inventory-query.dto';

/**
 * Inventory as the desktop last synced it. Read-only: the desktop owns stock.
 * Managers see stock and who holds it; money (sales and revenue) is admin-only.
 */
@ApiTags('inventory')
@Controller('api/inventory')
@Auth('admin', 'manager')
@ApiBearerAuth('bearer')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('items')
  @ApiOperation({
    summary:
      'Items and assets with store, held, pending and sold quantities (base units)',
  })
  async items(
    @Query() query: InventoryItemsQueryDto,
  ): Promise<InventoryItemView[]> {
    return this.inventoryService.items(query.kind);
  }

  @Get('holdings')
  @ApiOperation({ summary: 'Stock currently held by each desktop account' })
  async holdings(): Promise<HoldingView[]> {
    return this.inventoryService.holdings();
  }

  @Get('assignments')
  @ApiOperation({ summary: 'Hand-overs, pending ones first' })
  async assignments(
    @Query() query: AssignmentsQueryDto,
  ): Promise<PaginatedResponseDto<AssignmentView>> {
    return this.inventoryService.assignments(query);
  }

  @Get('movements')
  @ApiOperation({
    summary: 'The stock ledger; prices and amounts only for admins',
  })
  async movements(
    @Query() query: InventoryRangeQueryDto,
    @Request() req: { user: AuthUser },
  ): Promise<PaginatedResponseDto<MovementView>> {
    return this.inventoryService.movements(query, req.user.role === 'admin');
  }

  @Get('integrity')
  @ApiOperation({
    summary: 'Items whose synced balances disagree with the synced ledger',
  })
  async integrity() {
    return this.inventoryService.integrity();
  }

  @Get('sales')
  @Auth('admin')
  @ApiOperation({ summary: 'Stock reports that booked a sale, with amounts' })
  async sales(
    @Query() query: InventoryRangeQueryDto,
  ): Promise<PaginatedResponseDto<SaleView>> {
    return this.inventoryService.sales(query);
  }

  @Get('report')
  @Auth('admin')
  @ApiOperation({
    summary: 'Inventory revenue by day, month or year, beside all revenue',
  })
  async report(
    @Query() query: InventoryReportQueryDto,
  ): Promise<InventoryReport> {
    return this.inventoryService.report(query);
  }
}
