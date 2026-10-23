import { DataSource, Repository } from 'typeorm';
import { SyncService } from './sync.service';
import { Service } from '../entities/service.entity';
import { Member } from '../entities/member.entity';
import { Attendance } from '../entities/attendance.entity';
import { Transaction } from '../entities/transaction.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { HealthMetric } from '../entities/health-metric.entity';
import { Staff } from '../entities/staff.entity';
import { StaffAttendance } from '../entities/staff-attendance.entity';
import { NotificationsService } from '../notifications/notifications.service';

describe('SyncService', () => {
  it('syncs payment methods and reports results', async () => {
    const queryBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orUpdate: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      },
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    } as unknown as DataSource;
    const repository = {} as Repository<any>;

    const service = new SyncService(
      repository as Repository<Service>,
      repository as Repository<Member>,
      repository as Repository<Attendance>,
      repository as Repository<Transaction>,
      repository as Repository<PaymentMethod>,
      repository as Repository<HealthMetric>,
      repository as Repository<Staff>,
      repository as Repository<StaffAttendance>,
      dataSource,
      {} as NotificationsService,
    );

    const result = await service.syncData({
      timestamp: '2026-05-16T09:03:42.527Z',
      services: [],
      members: [],
      attendance: [],
      transactions: [],
      paymentMethods: [
        {
          id: 7,
          name: 'Cash',
          description: null,
          isActive: true,
        },
      ],
      healthMetrics: [],
    });

    expect(queryRunner.manager.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(queryBuilder.into).toHaveBeenCalledWith(PaymentMethod);
    expect(queryBuilder.values).toHaveBeenCalledWith([
      expect.objectContaining({
        localId: 7,
        name: 'Cash',
        description: null,
        isActive: true,
      }),
    ]);
    expect(queryBuilder.orUpdate).toHaveBeenCalledWith(
      ['name', 'description', 'isActive', 'updatedAt', 'lastSyncedAt'],
      ['localId'],
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      paymentMethodsSynced: 1,
      results: {
        paymentMethods: {
          successful: [7],
          failed: [],
        },
      },
    });
  });
});
