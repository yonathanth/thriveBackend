import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  NotFoundException,
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
import { PaginatedResponseDto } from '../common/dto/pagination.dto';

@ApiTags('transactions')
@Controller('api/transactions')
@Auth('admin')
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
  async findAll(@Query() query: TransactionQueryDto): Promise<PaginatedResponseDto<TransactionWebDto>> {
    return this.transactionsService.findAll(query);
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
    @Param('memberId', ParseIntPipe) memberId: number,
    @Query() query: TransactionQueryDto,
  ): Promise<PaginatedResponseDto<TransactionWebDto>> {
    return this.transactionsService.findByMember(memberId, query);
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
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<TransactionWebDto> {
    const transaction = await this.transactionsService.findOne(id);
    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }
    return transaction;
  }
}









