import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { Notification } from '../entities/notification.entity';
import { SyncRecord } from '../entities/sync-record.entity';
import { paidIncome } from '../common/finance';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { TransactionStatsDto, TransactionWebDto } from './dto/transaction-response.dto';
import { PaginatedResponseDto, createPaginatedResponse } from '../common/dto/pagination.dto';

interface TransactionNames {
  paymentMethods: Map<number, string>;
  addons: Map<number, string>;
  dropIns: Map<number, string>;
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(PaymentMethod)
    private paymentMethodRepository: Repository<PaymentMethod>,
    @InjectRepository(SyncRecord)
    private syncRecordRepository: Repository<SyncRecord>,
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
  ) {}

  /**
   * Names for the desktop ids a page of transactions refers to: payment methods,
   * add-ons and drop-in services, each looked up once for the whole page.
   */
  private async loadNames(transactions: Transaction[]): Promise<TransactionNames> {
    const ids = (pick: (t: Transaction) => number | null) => [
      ...new Set(transactions.map(pick).filter((id): id is number => id != null)),
    ];
    const methodIds = ids(t => t.paymentMethodId);
    const addonIds = ids(t => t.additionalServiceLocalId);
    const dropInIds = ids(t => t.usageServiceLocalId);

    const [methods, addons, dropIns] = await Promise.all([
      methodIds.length
        ? this.paymentMethodRepository.find({ where: { localId: In(methodIds) } })
        : Promise.resolve([] as PaymentMethod[]),
      addonIds.length
        ? this.syncRecordRepository.find({
            where: { entity: 'additional_service', localId: In(addonIds) },
          })
        : Promise.resolve([] as SyncRecord[]),
      dropInIds.length
        ? this.syncRecordRepository.find({
            where: { entity: 'usage_service', localId: In(dropInIds) },
          })
        : Promise.resolve([] as SyncRecord[]),
    ]);
    const recordName = (r: SyncRecord): [number, string] => [r.localId, String(r.data['name'] ?? '')];
    return {
      paymentMethods: new Map(methods.map(m => [m.localId, m.name])),
      addons: new Map(addons.map(recordName)),
      dropIns: new Map(dropIns.map(recordName)),
    };
  }

  async findAll(query: TransactionQueryDto): Promise<PaginatedResponseDto<TransactionWebDto>> {
    const { page = 1, limit = 20, sortBy = 'transactionDate', sortOrder = 'DESC', transactionType, paymentStatus, memberId, serviceId, startDate, endDate } = query;

    const queryBuilder = this.transactionRepository.createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.member', 'member')
      .leftJoinAndSelect('transaction.service', 'service');

    // Transaction type filter
    if (transactionType) {
      queryBuilder.andWhere('transaction.transactionType = :transactionType', { transactionType });
    }

    // Payment status filter
    if (paymentStatus) {
      queryBuilder.andWhere('transaction.paymentStatus = :paymentStatus', { paymentStatus });
    }

    // Member filter
    if (memberId) {
      queryBuilder.andWhere('transaction.memberId = :memberId', { memberId });
    }

    // Service filter
    if (serviceId) {
      queryBuilder.andWhere('transaction.serviceId = :serviceId', { serviceId });
    }

    // Date range filter
    if (startDate) {
      queryBuilder.andWhere('transaction.transactionDate >= :startDate', { startDate: new Date(startDate) });
    }
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('transaction.transactionDate <= :endDate', { endDate: endDateTime });
    }

    // Sorting
    const validSortFields = ['transactionDate', 'amount', 'createdAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'transactionDate';
    queryBuilder.orderBy(`transaction.${sortField}`, sortOrder);

    // Get total count
    const total = await queryBuilder.getCount();

    // Pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const transactions = await queryBuilder.getMany();
    const names = await this.loadNames(transactions);

    // Transform to web format
    const transformedTransactions = transactions.map(t => this.transformToWebFormat(t, names));

    return createPaginatedResponse(transformedTransactions, total, page, limit);
  }

  private transformToWebFormat(transaction: Transaction, names: TransactionNames): TransactionWebDto {
    const rawType = transaction.transactionType;
    const validTypes: TransactionWebDto['type'][] = ['income', 'expense', 'positive_return', 'negative_return'];
    const type = validTypes.includes(rawType as TransactionWebDto['type']) ? (rawType as TransactionWebDto['type']) : 'income';

    let source: TransactionWebDto['source'] = 'other';
    let sourceName: string | undefined;
    if (transaction.additionalServiceLocalId != null) {
      source = 'addon';
      sourceName = names.addons.get(transaction.additionalServiceLocalId) || undefined;
    } else if (transaction.usageServiceLocalId != null) {
      source = 'drop_in';
      sourceName = names.dropIns.get(transaction.usageServiceLocalId) || undefined;
    } else if (transaction.serviceLocalId != null) {
      source = 'membership';
      sourceName = transaction.service?.name;
    }
    const optionalNumber = (v: number | null) => (v == null ? undefined : Number(v));

    return {
      id: transaction.id,
      memberId: transaction.memberId || 0,
      amount: Number(transaction.amount),
      type,
      category: transaction.service?.category || 'Uncategorized',
      description: transaction.description || undefined,
      paymentMethod:
        transaction.paymentMethodId != null
          ? names.paymentMethods.get(transaction.paymentMethodId)
          : undefined,
      paymentStatus: transaction.paymentStatus,
      source,
      sourceName,
      originalAmount: optionalNumber(transaction.originalAmount),
      // Postgres returns decimals as text, so "0.00" must be compared as a number.
      discountAmount: Number(transaction.discountAmount) > 0 ? Number(transaction.discountAmount) : undefined,
      discountCode: transaction.discountCode || undefined,
      transactionDate: transaction.transactionDate.toISOString(),
      member: transaction.member ? {
        id: transaction.member.id,
        fullName: transaction.member.fullName,
      } : undefined,
      createdAt: transaction.createdAt.toISOString(),
    };
  }

  async findOne(id: number): Promise<TransactionWebDto | null> {
    const transaction = await this.transactionRepository.findOne({
      where: { id },
      relations: ['member', 'service'],
    });
    if (!transaction) return null;
    const dto = this.transformToWebFormat(transaction, await this.loadNames([transaction]));
    return { ...dto, recordedBy: await this.recordedBy(transaction.localId) };
  }

  /** Who took a payment, as its notification recorded it. */
  private async recordedBy(localId: number): Promise<TransactionWebDto['recordedBy']> {
    const notification = await this.notificationRepository.findOne({
      where: { type: 'payment', transactionLocalId: localId },
      order: { occurredAt: 'DESC' },
    });
    const data = notification?.data ?? {};
    const username = data['actor_username'];
    if (typeof username !== 'string' || username === '') return null;
    const role = data['actor_role'];
    const auditId = data['audit_id'];
    return {
      username,
      role: typeof role === 'string' ? role : null,
      auditId: typeof auditId === 'number' ? auditId : null,
    };
  }

  async findByMember(memberId: number, query: TransactionQueryDto): Promise<PaginatedResponseDto<TransactionWebDto>> {
    return this.findAll({ ...query, memberId });
  }

  private applyStatsFilters(
    queryBuilder: SelectQueryBuilder<Transaction>,
    query?: Pick<TransactionQueryDto, 'transactionType' | 'startDate' | 'endDate'>,
  ): SelectQueryBuilder<Transaction> {
    if (!query) return queryBuilder;

    if (query.transactionType) {
      queryBuilder.andWhere('transaction.transactionType = :transactionType', {
        transactionType: query.transactionType,
      });
    }

    if (query.startDate) {
      queryBuilder.andWhere('transaction.transactionDate >= :startDate', {
        startDate: new Date(query.startDate),
      });
    }

    if (query.endDate) {
      const endDateTime = new Date(query.endDate);
      endDateTime.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('transaction.transactionDate <= :endDate', {
        endDate: endDateTime,
      });
    }

    return queryBuilder;
  }

  /**
   * All date boundaries use UTC for consistent behaviour regardless of server timezone.
   * Inflows = income (paid) + positive_return; Outflows = expense + negative_return.
   */
  async getStats(
    query?: Pick<TransactionQueryDto, 'transactionType' | 'startDate' | 'endDate'>,
  ): Promise<TransactionStatsDto> {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const d = now.getUTCDate();
    const startOfMonth = new Date(Date.UTC(y, m, 1));
    const startOfLastMonth = new Date(Date.UTC(y, m - 1, 1));

    const inflowsWhere =
      `(${paidIncome('transaction')} OR transaction.transactionType = 'positive_return')`;
    const outflowsWhere =
      "(transaction.transactionType = 'expense' OR transaction.transactionType = 'negative_return')";

    const totalIncome = parseFloat(
      (
        await this.applyStatsFilters(
          this.transactionRepository
            .createQueryBuilder('transaction')
            .select('SUM(transaction.amount)', 'total')
            .where(inflowsWhere),
          query,
        ).getRawOne()
      )?.total || '0',
    );
    const totalOutflows = parseFloat(
      (
        await this.applyStatsFilters(
          this.transactionRepository
            .createQueryBuilder('transaction')
            .select('SUM(transaction.amount)', 'total')
            .where(outflowsWhere),
          query,
        ).getRawOne()
      )?.total || '0',
    );

    const thisMonthIncome = parseFloat(
      (
        await this.applyStatsFilters(
          this.transactionRepository
            .createQueryBuilder('transaction')
            .select('SUM(transaction.amount)', 'total')
            .where(inflowsWhere)
            .andWhere('transaction.transactionDate >= :startOfMonth', { startOfMonth }),
          query,
        ).getRawOne()
      )?.total || '0',
    );
    const thisMonthOutflows = parseFloat(
      (
        await this.applyStatsFilters(
          this.transactionRepository
            .createQueryBuilder('transaction')
            .select('SUM(transaction.amount)', 'total')
            .where(outflowsWhere)
            .andWhere('transaction.transactionDate >= :startOfMonth', { startOfMonth }),
          query,
        ).getRawOne()
      )?.total || '0',
    );

    const lastMonthIncome = parseFloat(
      (
        await this.applyStatsFilters(
          this.transactionRepository
            .createQueryBuilder('transaction')
            .select('SUM(transaction.amount)', 'total')
            .where(inflowsWhere)
            .andWhere('transaction.transactionDate >= :startOfLastMonth', { startOfLastMonth })
            .andWhere('transaction.transactionDate < :startOfMonth', { startOfMonth }),
          query,
        ).getRawOne()
      )?.total || '0',
    );
    const lastMonthOutflows = parseFloat(
      (
        await this.applyStatsFilters(
          this.transactionRepository
            .createQueryBuilder('transaction')
            .select('SUM(transaction.amount)', 'total')
            .where(outflowsWhere)
            .andWhere('transaction.transactionDate >= :startOfLastMonth', { startOfLastMonth })
            .andWhere('transaction.transactionDate < :startOfMonth', { startOfMonth }),
          query,
        ).getRawOne()
      )?.total || '0',
    );

    const totalCount = await this.applyStatsFilters(
      this.transactionRepository.createQueryBuilder('transaction'),
      query,
    ).getCount();

    const last7Days: { date: string; income: number; outflows: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const dayStart = new Date(Date.UTC(y, m, d - i));
      const dayEnd = new Date(Date.UTC(y, m, d - i + 1));
      const dayIncome = parseFloat(
        (
          await this.applyStatsFilters(
            this.transactionRepository
              .createQueryBuilder('transaction')
              .select('SUM(transaction.amount)', 'total')
              .where(inflowsWhere)
              .andWhere('transaction.transactionDate >= :dayStart', { dayStart })
              .andWhere('transaction.transactionDate < :dayEnd', { dayEnd }),
            query,
          ).getRawOne()
        )?.total || '0',
      );
      const dayOutflows = parseFloat(
        (
          await this.applyStatsFilters(
            this.transactionRepository
              .createQueryBuilder('transaction')
              .select('SUM(transaction.amount)', 'total')
              .where(outflowsWhere)
              .andWhere('transaction.transactionDate >= :dayStart', { dayStart })
              .andWhere('transaction.transactionDate < :dayEnd', { dayEnd }),
            query,
          ).getRawOne()
        )?.total || '0',
      );
      last7Days.push({
        date: dayStart.toISOString().split('T')[0],
        income: dayIncome,
        outflows: dayOutflows,
      });
    }

    return {
      total: totalCount,
      totalIncome,
      totalOutflows,
      netProfit: totalIncome - totalOutflows,
      thisMonthIncome,
      thisMonthOutflows,
      lastMonthIncome,
      lastMonthOutflows,
      last7Days,
    };
  }
}
