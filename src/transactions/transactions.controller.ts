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
} from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { TransactionResponseDto, TransactionStatsDto, TransactionWebDto } from './dto/transaction-response.dto';
import { Auth } from '../auth/auth.decorator';
import { RequirePermission } from '../auth/permissions';
import { PaginatedResponseDto } from '../common/dto/pagination.dto';

/** Notes are filtered by the viewer's role. */
interface AuthedRequest {
  user?: { role?: string };
}

@ApiTags('transactions')
@Controller('api/transactions')
@Auth('admin', 'manager')
@RequirePermission('finance.view')
@ApiBearerAuth('bearer')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all transactions',
    description: 'Returns a paginated list of transactions with optional filtering',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of transactions',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async findAll(
    @Request() req: AuthedRequest,
    @Query() query: TransactionQueryDto,
  ): Promise<PaginatedResponseDto<TransactionWebDto>> {
    return this.transactionsService.findAll(query, req.user?.role);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get transaction statistics',
    description: 'Returns financial statistics including income, expenses, and trends',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction statistics',
    type: TransactionStatsDto,
  })
  async getStats(@Query() query: TransactionQueryDto): Promise<TransactionStatsDto> {
    return this.transactionsService.getStats(query);
  }

  @Get('member/:memberId')
  // One member's payments are also the member page's payment history.
  @RequirePermission('finance.view', 'members.payments.view')
  @ApiOperation({
    summary: 'Get member transactions',
    description: 'Returns transaction history for a specific member',
  })
  @ApiParam({
    name: 'memberId',
    description: 'Member ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Member transaction history',
  })
  async findByMember(
    @Request() req: AuthedRequest,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Query() query: TransactionQueryDto,
  ): Promise<PaginatedResponseDto<TransactionWebDto>> {
    return this.transactionsService.findByMember(memberId, query, req.user?.role);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get transaction by ID',
    description: 'Returns a single transaction by its database ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Transaction ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction found',
    type: TransactionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Transaction not found',
  })
  async findOne(
    @Request() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TransactionWebDto> {
    const transaction = await this.transactionsService.findOne(id, req.user?.role);
    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }
    return transaction;
  }
}









