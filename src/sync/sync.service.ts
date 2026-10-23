import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { SyncPayloadDto } from './dto/sync-payload.dto';
import { SyncResponseDto, DetailedSyncResultsDto, SyncResultDto } from './dto/sync-response.dto';
import { Service } from '../entities/service.entity';
import { Member } from '../entities/member.entity';
import { Attendance } from '../entities/attendance.entity';
import { Transaction } from '../entities/transaction.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { HealthMetric } from '../entities/health-metric.entity';
import { Staff } from '../entities/staff.entity';
import { StaffAttendance } from '../entities/staff-attendance.entity';
import { ServiceSyncDto } from './dto/service-sync.dto';
import { MemberSyncDto } from './dto/member-sync.dto';
import { AttendanceSyncDto } from './dto/attendance-sync.dto';
import { TransactionSyncDto } from './dto/transaction-sync.dto';
import { HealthMetricSyncDto } from './dto/health-metric-sync.dto';
import { StaffSyncDto } from './dto/staff-sync.dto';
import { StaffAttendanceSyncDto } from './dto/staff-attendance-sync.dto';
import { PaymentMethodSyncDto } from './dto/payment-method-sync.dto';
import {
  RecordSyncDto,
  DeletionSyncDto,
  ProspectStatusSyncDto,
} from './dto/record-sync.dto';
import { SyncRecord } from '../entities/sync-record.entity';
import { PotentialCustomer } from '../entities/potential-customer.entity';
import { Notification } from '../entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { AccountProvisioningService } from '../accounts/account-provisioning.service';

/**
 * Bumped when the payload gains something an older API would reject. The desktop
 * reads it from GET /api/sync/status and only sends what this version accepts.
 */
export const SYNC_PROTOCOL_VERSION = 3;

/** Desktop tables that have their own entity here, by desktop table name. */
const TYPED_ENTITIES: Record<string, any> = {
  service: Service,
  member: Member,
  attendance: Attendance,
  transaction: Transaction,
  health_metric_history: HealthMetric,
  staff: Staff,
  staff_attendance: StaffAttendance,
};

/**
 * Fields never stored even if a desktop sends them: login PINs, licence and API keys,
 * device keys and biometric templates. Current desktops leave them out; this keeps an
 * older or modified one from putting them in the website's database.
 */
const SECRET_FIELDS = new Set([
  'pin',
  'password',
  'password_hash',
  'license_token',
  'installation_code',
  'sync_api_key',
  'sms_afro_token',
  'comm_key',
  'template_data',
  'fingerprint_template',
]);

/** Desktop tables that are never stored: biometrics and the device and sync queues. */
const LOCAL_ONLY_ENTITIES = new Set([
  'device_credential',
  'device_enrollment',
  'device_command',
  'device_roster',
  'device_roster_bio',
  'device_drift',
  'sync_event',
  'sync_deletion',
  'sync_state',
]);

function withoutSecrets(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([key]) => !SECRET_FIELDS.has(key)));
}

/** Parses a desktop date string, or null when absent or unreadable. */
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(Member)
    private memberRepository: Repository<Member>,
    @InjectRepository(Attendance)
    private attendanceRepository: Repository<Attendance>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(PaymentMethod)
    private paymentMethodRepository: Repository<PaymentMethod>,
    @InjectRepository(HealthMetric)
    private healthMetricRepository: Repository<HealthMetric>,
    @InjectRepository(Staff)
    private staffRepository: Repository<Staff>,
    @InjectRepository(StaffAttendance)
    private staffAttendanceRepository: Repository<StaffAttendance>,
    private dataSource: DataSource,
    private notificationsService: NotificationsService,
    @Optional() private accountProvisioning?: AccountProvisioningService,
  ) {}

  async syncData(payload: SyncPayloadDto): Promise<SyncResponseDto> {
    const errors: string[] = [];
    let membersSynced = 0;
    let attendanceSynced = 0;
    let transactionsSynced = 0;
    let paymentMethodsSynced = 0;
    let servicesSynced = 0;
    let healthMetricsSynced = 0;
    let staffSynced = 0;
    let staffAttendanceSynced = 0;
    let recordsSynced = 0;
    let deletionsApplied = 0;
    const results: DetailedSyncResultsDto = {};
    let createdNotifications: Notification[] = [];

    // Use a transaction for atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Sync services first (they're referenced by members)
      if (payload.services && payload.services.length > 0) {
        const serviceResult = await this.syncServices(
          payload.services,
          queryRunner,
        );
        servicesSynced = serviceResult.synced;
        if (serviceResult.results) {
          results.services = serviceResult.results;
        }
        if (serviceResult.errors.length > 0) {
          errors.push(...serviceResult.errors);
        }
      }

      // Sync members (they're referenced by attendance and transactions)
      if (payload.members && payload.members.length > 0) {
        const memberResult = await this.syncMembers(payload.members, queryRunner);
        membersSynced = memberResult.synced;
        if (memberResult.results) {
          results.members = memberResult.results;
        }
        if (memberResult.errors.length > 0) {
          errors.push(...memberResult.errors);
        }
      }

      // Sync attendance
      if (payload.attendance && payload.attendance.length > 0) {
        const attendanceResult = await this.syncAttendance(
          payload.attendance,
          queryRunner,
        );
        attendanceSynced = attendanceResult.synced;
        if (attendanceResult.results) {
          results.attendance = attendanceResult.results;
        }
        if (attendanceResult.errors.length > 0) {
          errors.push(...attendanceResult.errors);
        }
      }

      // Sync transactions
      if (payload.transactions && payload.transactions.length > 0) {
        const transactionResult = await this.syncTransactions(
          payload.transactions,
          queryRunner,
        );
        transactionsSynced = transactionResult.synced;
        if (transactionResult.results) {
          results.transactions = transactionResult.results;
        }
        if (transactionResult.errors.length > 0) {
          errors.push(...transactionResult.errors);
        }
      }

      // Sync payment methods used by transactions
      if (payload.paymentMethods && payload.paymentMethods.length > 0) {
        const paymentMethodResult = await this.syncPaymentMethods(
          payload.paymentMethods,
          queryRunner,
        );
        paymentMethodsSynced = paymentMethodResult.synced;
        if (paymentMethodResult.results) {
          results.paymentMethods = paymentMethodResult.results;
        }
        if (paymentMethodResult.errors.length > 0) {
          errors.push(...paymentMethodResult.errors);
        }
      }

      // Sync health metrics (after members, as they reference members)
      if (payload.healthMetrics && payload.healthMetrics.length > 0) {
        const healthMetricResult = await this.syncHealthMetrics(
          payload.healthMetrics,
          queryRunner,
        );
        healthMetricsSynced = healthMetricResult.synced;
        if (healthMetricResult.results) {
          results.healthMetrics = healthMetricResult.results;
        }
        if (healthMetricResult.errors.length > 0) {
          errors.push(...healthMetricResult.errors);
        }
      }

      // Sync staff (no FK to members/services)
      if (payload.staff && payload.staff.length > 0) {
        const staffResult = await this.syncStaff(payload.staff, queryRunner);
        staffSynced = staffResult.synced;
        if (staffResult.results) {
          results.staff = staffResult.results;
        }
        if (staffResult.errors.length > 0) {
          errors.push(...staffResult.errors);
        }
      }

      // Sync staff attendance (after staff)
      if (payload.staffAttendance && payload.staffAttendance.length > 0) {
        const staffAttendanceResult = await this.syncStaffAttendance(
          payload.staffAttendance,
          queryRunner,
        );
        staffAttendanceSynced = staffAttendanceResult.synced;
        if (staffAttendanceResult.results) {
          results.staffAttendance = staffAttendanceResult.results;
        }
        if (staffAttendanceResult.errors.length > 0) {
          errors.push(...staffAttendanceResult.errors);
        }
      }

      // Rows of desktop tables without a dedicated entity
      if (payload.records && payload.records.length > 0) {
        const recordResult = await this.syncRecords(payload.records, queryRunner);
        recordsSynced = recordResult.synced;
        results.records = recordResult.results;
        errors.push(...recordResult.errors);
      }

      // What the desktop did with leads it pulled from the website
      if (payload.prospectStatuses && payload.prospectStatuses.length > 0) {
        const prospectResult = await this.syncProspectStatuses(
          payload.prospectStatuses,
          queryRunner,
        );
        results.prospectStatuses = prospectResult.results;
        errors.push(...prospectResult.errors);
      }

      // Deletions last, after every upsert in this batch has been applied
      if (payload.deletions && payload.deletions.length > 0) {
        const deletionResult = await this.applyDeletions(payload.deletions, queryRunner);
        deletionsApplied = deletionResult.synced;
        results.deletions = deletionResult.results;
        errors.push(...deletionResult.errors);
      }

      // Notifications last: they describe what the rest of the batch just stored
      if (payload.events && payload.events.length > 0) {
        try {
          const eventResult = await this.notificationsService.createFromEvents(
            payload.events,
            queryRunner.manager,
          );
          createdNotifications = eventResult.created;
          // Events that could not be stored stay on the desktop for a later sync; they
          // are not errors of this sync, which must not stall over a notification.
          results.events = { successful: eventResult.acknowledged, failed: eventResult.failed };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Failed to store notifications: ${errorMessage}`);
          results.events = { successful: [], failed: payload.events.map(e => e.uid) };
          errors.push(`Failed to store notifications: ${errorMessage}`);
        }
      }

      // Only commit if no critical errors occurred
      const hasCriticalErrors = errors.some(e => 
        e.includes('FOREIGN KEY') || e.includes('missing') || e.includes('not found')
      );

      if (hasCriticalErrors) {
        await queryRunner.rollbackTransaction();
        this.logger.warn(`Sync rolled back due to critical errors: ${errors.join('; ')}`);
        // Don't return results since transaction was rolled back - nothing was actually synced
        return {
          success: false,
          membersSynced: 0,
          attendanceSynced: 0,
          transactionsSynced: 0,
          paymentMethodsSynced: 0,
          servicesSynced: 0,
          healthMetricsSynced: 0,
          staffSynced: 0,
          staffAttendanceSynced: 0,
          recordsSynced: 0,
          deletionsApplied: 0,
          errors: errors.length > 0 ? errors : undefined,
          timestamp: new Date().toISOString(),
          results: undefined, // Clear results since nothing was committed
        };
      } else {
        await queryRunner.commitTransaction();
        if (createdNotifications.length > 0) {
          void this.notificationsService.pushCreated(createdNotifications);
        }
        // Website logins for synced staff and members; runs after commit and never
        // affects the sync result.
        if (this.accountProvisioning) {
          void this.accountProvisioning.afterSync(...this.accountSources(payload));
        }
        this.logger.log(
          `Sync completed: ${servicesSynced} services, ${membersSynced} members, ${attendanceSynced} attendance, ${transactionsSynced} transactions, ${paymentMethodsSynced} payment methods, ${healthMetricsSynced} health metrics, ${staffSynced} staff, ${staffAttendanceSynced} staff attendance`,
        );
      }

      return {
        success: errors.length === 0,
        membersSynced,
        attendanceSynced,
        transactionsSynced,
        paymentMethodsSynced,
        servicesSynced,
        healthMetricsSynced,
        staffSynced,
        staffAttendanceSynced,
        recordsSynced,
        deletionsApplied,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date().toISOString(),
        results: Object.keys(results).length > 0 ? results : undefined,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);
      this.logger.error(`Sync failed: ${errorMessage}`, error.stack);

      return {
        success: false,
        membersSynced,
        attendanceSynced,
        transactionsSynced,
        paymentMethodsSynced,
        servicesSynced,
        healthMetricsSynced,
        staffSynced,
        staffAttendanceSynced,
        recordsSynced,
        deletionsApplied,
        errors,
        timestamp: new Date().toISOString(),
        results: Object.keys(results).length > 0 ? results : undefined,
      };
    } finally {
      await queryRunner.release();
    }
  }

  private async syncServices(
    services: ServiceSyncDto[],
    queryRunner: any,
  ): Promise<{ synced: number; results?: SyncResultDto; errors: string[] }> {
    if (services.length === 0) return { synced: 0, errors: [] };

    const successful: number[] = [];
    const failed: number[] = [];
    const errors: string[] = [];

    // Bulk insert/update all services at once
    const values = services.map(serviceDto => ({
      localId: serviceDto.id,
      name: serviceDto.name,
      period: serviceDto.period,
      price: serviceDto.price,
      category: serviceDto.category,
      description: serviceDto.description,
      maxUsageCount: serviceDto.maxUsageCount,
      usageType: serviceDto.usageType,
      status: serviceDto.status,
      color: serviceDto.color ?? null,
      freezeMaxDays: serviceDto.freezeMaxDays ?? null,
      freezeMinDays: serviceDto.freezeMinDays ?? null,
      freezeMaxCount: serviceDto.freezeMaxCount ?? null,
      freezeRuleMode: serviceDto.freezeRuleMode ?? null,
      groupSize: serviceDto.groupSize ?? null,
      groupPricing: serviceDto.groupPricing ?? null,
      lastSyncedAt: new Date(),
      deletedAt: null,
    }));

    try {
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(Service)
        .values(values)
        .orUpdate(
          [
            'name',
            'period',
            'price',
            'category',
            'description',
            'maxUsageCount',
            'usageType',
            'status',
            'color',
            'freezeMaxDays',
            'freezeMinDays',
            'freezeMaxCount',
            'freezeRuleMode',
            'groupSize',
            'groupPricing',
            'updatedAt',
            'lastSyncedAt',
            'deletedAt',
          ],
          ['localId'],
        )
        .execute();

      // All services synced successfully
      services.forEach(s => successful.push(s.id));

      return {
        synced: services.length,
        results: { successful, failed },
        errors,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to bulk sync services: ${errorMessage}`,
      );
      services.forEach(s => failed.push(s.id));
      errors.push(`Failed to sync services: ${errorMessage}`);
      return { synced: 0, results: { successful, failed }, errors };
    }
  }

  private async syncMembers(
    members: MemberSyncDto[],
    queryRunner: any,
  ): Promise<{ synced: number; results?: SyncResultDto; errors: string[] }> {
    if (members.length === 0) return { synced: 0, errors: [] };

    const successful: number[] = [];
    const failed: number[] = [];
    const errors: string[] = [];

    // Bulk load all services into a Map for O(1) lookup
    const serviceLocalIds = [
      ...new Set(members.map(m => m.serviceId).filter(Boolean)),
    ];
    const services =
      serviceLocalIds.length > 0
        ? await queryRunner.manager.find(Service, {
            where: { localId: In(serviceLocalIds) },
          })
        : [];

    const serviceMap = new Map(services.map(s => [s.localId, s.id]));

    // Validate foreign keys before syncing
    const membersWithMissingServices: MemberSyncDto[] = [];
    const validMembers: MemberSyncDto[] = [];

    for (const memberDto of members) {
      if (memberDto.serviceId && !serviceMap.has(memberDto.serviceId)) {
        membersWithMissingServices.push(memberDto);
        failed.push(memberDto.id);
        errors.push(
          `Member with localId ${memberDto.id} references missing service with localId ${memberDto.serviceId}`,
        );
      } else {
        validMembers.push(memberDto);
      }
    }

    if (membersWithMissingServices.length > 0) {
      this.logger.warn(
        `${membersWithMissingServices.length} members skipped due to missing service references`,
      );
    }

    if (validMembers.length === 0) {
      return {
        synced: 0,
        results: { successful, failed },
        errors,
      };
    }

    // Prepare all valid member values
    const values = validMembers.map(memberDto => {
      const serviceId = memberDto.serviceId
        ? serviceMap.get(memberDto.serviceId) || null
        : null;

      return {
        localId: memberDto.id,
        fullName: memberDto.fullName,
        phoneNumber: memberDto.phoneNumber,
        email: memberDto.email,
        firstRegisteredAt: new Date(memberDto.firstRegisteredAt),
        profileImageUrl: memberDto.profileImageUrl,
        subscriptionStartDate: new Date(memberDto.subscriptionStartDate),
        subscriptionEndDate: new Date(memberDto.subscriptionEndDate),
        subscriptionUsedCount: memberDto.subscriptionUsedCount,
        subscriptionStatus: memberDto.subscriptionStatus,
        frozen: memberDto.frozen,
        frozenStartDate: memberDto.frozenStartDate
          ? new Date(memberDto.frozenStartDate)
          : null,
        frozenUntilDate: memberDto.frozenUntilDate
          ? new Date(memberDto.frozenUntilDate)
          : null,
        frozenReason: memberDto.frozenReason,
        freezeDurationRequested: memberDto.freezeDurationRequested,
        status: memberDto.status,
        serviceLocalId: memberDto.serviceId,
        serviceId: serviceId,
        externalMemberId: memberDto.externalMemberId,
        dateOfBirth: memberDto.dateOfBirth
          ? new Date(memberDto.dateOfBirth)
          : null,
        gender: memberDto.gender,
        organizationName: memberDto.organizationName,
        cardNo: memberDto.cardNo,
        membershipTier: memberDto.membershipTier,
        goals: memberDto.goals,
        bloodType: memberDto.bloodType,
        age: memberDto.age,
        height: memberDto.height,
        telegramUsername: memberDto.telegramUsername,
        remark: memberDto.remark,
        objective: memberDto.objective,
        trainerStaffLocalId: memberDto.trainerStaffId ?? null,
        lastSyncedAt: new Date(),
        deletedAt: null,
      };
    });

    try {
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(Member)
        .values(values)
        .orUpdate(
          [
            'fullName',
            'phoneNumber',
            'email',
            'firstRegisteredAt',
            'profileImageUrl',
            'subscriptionStartDate',
            'subscriptionEndDate',
            'subscriptionUsedCount',
            'subscriptionStatus',
            'frozen',
            'frozenStartDate',
            'frozenUntilDate',
            'frozenReason',
            'freezeDurationRequested',
            'status',
            'serviceLocalId',
            'serviceId',
            'externalMemberId',
            'dateOfBirth',
            'gender',
            'organizationName',
            'cardNo',
            'membershipTier',
            'goals',
            'bloodType',
            'age',
            'height',
            'telegramUsername',
            'remark',
            'objective',
            'trainerStaffLocalId',
            'updatedAt',
            'lastSyncedAt',
            'deletedAt',
          ],
          ['localId'],
        )
        .execute();

      // All valid members synced successfully
      validMembers.forEach(m => successful.push(m.id));

      return {
        synced: validMembers.length,
        results: { successful, failed },
        errors,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to bulk sync members: ${errorMessage}`,
      );
      validMembers.forEach(m => failed.push(m.id));
      errors.push(`Failed to sync members: ${errorMessage}`);
      return { synced: 0, results: { successful, failed }, errors };
    }
  }

  private async syncAttendance(
    attendance: AttendanceSyncDto[],
    queryRunner: any,
  ): Promise<{ synced: number; results?: SyncResultDto; errors: string[] }> {
    if (attendance.length === 0) return { synced: 0, errors: [] };

    const successful: number[] = [];
    const failed: number[] = [];
    const errors: string[] = [];

    // Bulk load all members into a Map
    const memberLocalIds = [...new Set(attendance.map(a => a.memberId))];
    const members = await queryRunner.manager.find(Member, {
      where: { localId: In(memberLocalIds) },
    });

    const memberMap = new Map(members.map(m => [m.localId, m.id]));

    // Separate valid and invalid attendance records
    const validAttendance: AttendanceSyncDto[] = [];
    const invalidAttendance: AttendanceSyncDto[] = [];

    for (const attendanceDto of attendance) {
      if (memberMap.has(attendanceDto.memberId)) {
        validAttendance.push(attendanceDto);
      } else {
        invalidAttendance.push(attendanceDto);
        failed.push(attendanceDto.id);
        errors.push(
          `Attendance record with localId ${attendanceDto.id} references missing member with localId ${attendanceDto.memberId}`,
        );
      }
    }

    if (invalidAttendance.length > 0) {
      this.logger.warn(
        `${invalidAttendance.length} attendance records skipped due to missing members`,
      );
    }

    if (validAttendance.length === 0) {
      return {
        synced: 0,
        results: { successful, failed },
        errors,
      };
    }

    const values = validAttendance.map(attendanceDto => ({
      localId: attendanceDto.id,
      memberLocalId: attendanceDto.memberId,
      memberId: memberMap.get(attendanceDto.memberId)!,
      date: new Date(attendanceDto.date),
      lastSyncedAt: new Date(),
      deletedAt: null,
    }));

    try {
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(Attendance)
        .values(values)
        .orUpdate(
          ['memberLocalId', 'memberId', 'date', 'updatedAt', 'lastSyncedAt', 'deletedAt'],
          ['localId'],
        )
        .execute();

      // All valid attendance synced successfully
      validAttendance.forEach(a => successful.push(a.id));

      return {
        synced: validAttendance.length,
        results: { successful, failed },
        errors,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to bulk sync attendance: ${errorMessage}`,
      );
      validAttendance.forEach(a => failed.push(a.id));
      errors.push(`Failed to sync attendance: ${errorMessage}`);
      return { synced: 0, results: { successful, failed }, errors };
    }
  }

  private async syncStaff(
    staff: StaffSyncDto[],
    queryRunner: any,
  ): Promise<{ synced: number; results?: SyncResultDto; errors: string[] }> {
    if (staff.length === 0) return { synced: 0, errors: [] };

    const successful: number[] = [];
    const failed: number[] = [];
    const errors: string[] = [];

    const values = staff.map(dto => ({
      localId: dto.id,
      fullName: dto.fullName,
      phoneNumber: dto.phoneNumber ?? null,
      role: dto.role ?? null,
      status: dto.status ?? null,
      accessValidTo: toDate(dto.accessValidTo),
      lastSyncedAt: new Date(),
      deletedAt: null,
    }));

    try {
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(Staff)
        .values(values)
        .orUpdate(
          [
            'fullName',
            'phoneNumber',
            'role',
            'status',
            'accessValidTo',
            'updatedAt',
            'lastSyncedAt',
            'deletedAt',
          ],
          ['localId'],
        )
        .execute();

      staff.forEach(s => successful.push(s.id));
      return {
        synced: staff.length,
        results: { successful, failed },
        errors,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to bulk sync staff: ${errorMessage}`);
      staff.forEach(s => failed.push(s.id));
      errors.push(`Failed to sync staff: ${errorMessage}`);
      return { synced: 0, results: { successful, failed }, errors };
    }
  }

  private async syncStaffAttendance(
    staffAttendance: StaffAttendanceSyncDto[],
    queryRunner: any,
  ): Promise<{ synced: number; results?: SyncResultDto; errors: string[] }> {
    if (staffAttendance.length === 0) return { synced: 0, errors: [] };

    const successful: number[] = [];
    const failed: number[] = [];
    const errors: string[] = [];

    const staffLocalIds = [...new Set(staffAttendance.map(a => a.staffId))];
    const staffList = await queryRunner.manager.find(Staff, {
      where: { localId: In(staffLocalIds) },
    });
    const staffMap = new Map(staffList.map(s => [s.localId, s.id]));

    const valid: StaffAttendanceSyncDto[] = [];
    for (const dto of staffAttendance) {
      if (staffMap.has(dto.staffId)) {
        valid.push(dto);
      } else {
        failed.push(dto.id);
        errors.push(
          `Staff attendance with localId ${dto.id} references missing staff with localId ${dto.staffId}`,
        );
      }
    }

    if (valid.length === 0) {
      return { synced: 0, results: { successful, failed }, errors };
    }

    const values = valid.map(dto => ({
      localId: dto.id,
      staffLocalId: dto.staffId,
      staffId: staffMap.get(dto.staffId)!,
      scannedAt: new Date(dto.scannedAt),
      lastSyncedAt: new Date(),
      deletedAt: null,
    }));

    try {
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(StaffAttendance)
        .values(values)
        .orUpdate(
          ['staffLocalId', 'staffId', 'scannedAt', 'updatedAt', 'lastSyncedAt', 'deletedAt'],
          ['localId'],
        )
        .execute();

      valid.forEach(a => successful.push(a.id));
      return {
        synced: valid.length,
        results: { successful, failed },
        errors,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to bulk sync staff attendance: ${errorMessage}`);
      valid.forEach(a => failed.push(a.id));
      errors.push(`Failed to sync staff attendance: ${errorMessage}`);
      return { synced: 0, results: { successful, failed }, errors };
    }
  }

  private async syncTransactions(
    transactions: TransactionSyncDto[],
    queryRunner: any,
  ): Promise<{ synced: number; results?: SyncResultDto; errors: string[] }> {
    if (transactions.length === 0) return { synced: 0, errors: [] };

    const successful: number[] = [];
    const failed: number[] = [];
    const errors: string[] = [];

    // Bulk load all members and services
    const memberLocalIds = [
      ...new Set(transactions.map(t => t.memberId).filter(Boolean)),
    ];
    const serviceLocalIds = [
      ...new Set(transactions.map(t => t.serviceId).filter(Boolean)),
    ];

    const [members, services] = await Promise.all([
      memberLocalIds.length > 0
        ? queryRunner.manager.find(Member, {
            where: { localId: In(memberLocalIds) },
          })
        : [],
      serviceLocalIds.length > 0
        ? queryRunner.manager.find(Service, {
            where: { localId: In(serviceLocalIds) },
          })
        : [],
    ]);

    const memberMap = new Map(members.map(m => [m.localId, m.id]));
    const serviceMap = new Map(services.map(s => [s.localId, s.id]));

    // Validate foreign keys before syncing
    const validTransactions: TransactionSyncDto[] = [];
    const invalidTransactions: TransactionSyncDto[] = [];

    for (const transactionDto of transactions) {
      let isValid = true;
      
      if (transactionDto.memberId && !memberMap.has(transactionDto.memberId)) {
        isValid = false;
        failed.push(transactionDto.id);
        errors.push(
          `Transaction with localId ${transactionDto.id} references missing member with localId ${transactionDto.memberId}`,
        );
      }
      
      if (transactionDto.serviceId && !serviceMap.has(transactionDto.serviceId)) {
        isValid = false;
        if (!failed.includes(transactionDto.id)) {
          failed.push(transactionDto.id);
        }
        errors.push(
          `Transaction with localId ${transactionDto.id} references missing service with localId ${transactionDto.serviceId}`,
        );
      }

      if (isValid) {
        validTransactions.push(transactionDto);
      } else {
        invalidTransactions.push(transactionDto);
      }
    }

    if (invalidTransactions.length > 0) {
      this.logger.warn(
        `${invalidTransactions.length} transaction records skipped due to missing foreign key references`,
      );
    }

    if (validTransactions.length === 0) {
      return {
        synced: 0,
        results: { successful, failed },
        errors,
      };
    }

    const values = validTransactions.map(transactionDto => ({
      localId: transactionDto.id,
      transactionType: transactionDto.transactionType,
      amount: transactionDto.amount,
      transactionDate: new Date(transactionDto.transactionDate),
      description: transactionDto.description,
      memberLocalId: transactionDto.memberId,
      memberId: transactionDto.memberId
        ? memberMap.get(transactionDto.memberId) || null
        : null,
      serviceLocalId: transactionDto.serviceId,
      serviceId: transactionDto.serviceId
        ? serviceMap.get(transactionDto.serviceId) || null
        : null,
      paymentMethodId: transactionDto.paymentMethodId,
      incomeCategoryId: transactionDto.incomeCategoryId,
      paymentStatus: transactionDto.paymentStatus,
      subscriptionPeriodStart: transactionDto.subscriptionPeriodStart
        ? new Date(transactionDto.subscriptionPeriodStart)
        : null,
      subscriptionPeriodEnd: transactionDto.subscriptionPeriodEnd
        ? new Date(transactionDto.subscriptionPeriodEnd)
        : null,
      expenseCategoryId: transactionDto.expenseCategoryId,
      vendor: transactionDto.vendor,
      receiptUrl: transactionDto.receiptUrl,
      notes: transactionDto.notes,
      referenceTransactionId: transactionDto.referenceTransactionId,
      originalAmount: transactionDto.originalAmount ?? null,
      discountAmount: transactionDto.discountAmount ?? null,
      discountLocalId: transactionDto.discountId ?? null,
      discountCode: transactionDto.discountCode ?? null,
      additionalServiceLocalId: transactionDto.additionalServiceId ?? null,
      usageServiceLocalId: transactionDto.usageServiceId ?? null,
      memberGroupLocalId: transactionDto.memberGroupId ?? null,
      lastSyncedAt: new Date(),
      deletedAt: null,
    }));

    try {
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(Transaction)
        .values(values)
        .orUpdate(
          [
            'transactionType',
            'amount',
            'transactionDate',
            'description',
            'memberLocalId',
            'memberId',
            'serviceLocalId',
            'serviceId',
            'paymentMethodId',
            'incomeCategoryId',
            'paymentStatus',
            'subscriptionPeriodStart',
            'subscriptionPeriodEnd',
            'expenseCategoryId',
            'vendor',
            'receiptUrl',
            'notes',
            'referenceTransactionId',
            'originalAmount',
            'discountAmount',
            'discountLocalId',
            'discountCode',
            'additionalServiceLocalId',
            'usageServiceLocalId',
            'memberGroupLocalId',
            'updatedAt',
            'lastSyncedAt',
            'deletedAt',
          ],
          ['localId'],
        )
        .execute();

      // All valid transactions synced successfully
      validTransactions.forEach(t => successful.push(t.id));

      return {
        synced: validTransactions.length,
        results: { successful, failed },
        errors,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to bulk sync transactions: ${errorMessage}`,
      );
      validTransactions.forEach(t => failed.push(t.id));
      errors.push(`Failed to sync transactions: ${errorMessage}`);
      return { synced: 0, results: { successful, failed }, errors };
    }
  }

  private async syncHealthMetrics(
    healthMetrics: HealthMetricSyncDto[],
    queryRunner: any,
  ): Promise<{ synced: number; results?: SyncResultDto; errors: string[] }> {
    if (healthMetrics.length === 0) return { synced: 0, errors: [] };

    const successful: number[] = [];
    const failed: number[] = [];
    const errors: string[] = [];

    // Bulk load all members into a Map
    const memberLocalIds = [...new Set(healthMetrics.map(hm => hm.memberId))];
    const members = await queryRunner.manager.find(Member, {
      where: { localId: In(memberLocalIds) },
    });

    const memberMap = new Map(members.map(m => [m.localId, m.id]));

    // Separate valid and invalid health metric records
    const validHealthMetrics: HealthMetricSyncDto[] = [];
    const invalidHealthMetrics: HealthMetricSyncDto[] = [];

    for (const healthMetricDto of healthMetrics) {
      if (memberMap.has(healthMetricDto.memberId)) {
        validHealthMetrics.push(healthMetricDto);
      } else {
        invalidHealthMetrics.push(healthMetricDto);
        failed.push(healthMetricDto.id);
        errors.push(
          `Health metric record with localId ${healthMetricDto.id} references missing member with localId ${healthMetricDto.memberId}`,
        );
      }
    }

    if (invalidHealthMetrics.length > 0) {
      this.logger.warn(
        `${invalidHealthMetrics.length} health metric records skipped due to missing members`,
      );
    }

    if (validHealthMetrics.length === 0) {
      return {
        synced: 0,
        results: { successful, failed },
        errors,
      };
    }

    const values = validHealthMetrics.map(healthMetricDto => ({
      localId: healthMetricDto.id,
      memberLocalId: healthMetricDto.memberId,
      memberId: memberMap.get(healthMetricDto.memberId)!,
      measuredAt: new Date(healthMetricDto.measuredAt),
      weight: healthMetricDto.weight,
      bmi: healthMetricDto.bmi,
      bodyFatPercent: healthMetricDto.bodyFatPercent,
      heartRate: healthMetricDto.heartRate,
      muscleMass: healthMetricDto.muscleMass,
      leanBodyMass: healthMetricDto.leanBodyMass,
      boneMass: healthMetricDto.boneMass,
      skeletalMuscleMass: healthMetricDto.skeletalMuscleMass,
      visceralFat: healthMetricDto.visceralFat,
      subcutaneousFatPercent: healthMetricDto.subcutaneousFatPercent,
      proteinPercent: healthMetricDto.proteinPercent,
      bmr: healthMetricDto.bmr,
      bodyAge: healthMetricDto.bodyAge,
      bodyType: healthMetricDto.bodyType,
      lastSyncedAt: new Date(),
      deletedAt: null,
    }));

    try {
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(HealthMetric)
        .values(values)
        .orUpdate(
          [
            'memberLocalId',
            'memberId',
            'measuredAt',
            'weight',
            'bmi',
            'bodyFatPercent',
            'heartRate',
            'muscleMass',
            'leanBodyMass',
            'boneMass',
            'skeletalMuscleMass',
            'visceralFat',
            'subcutaneousFatPercent',
            'proteinPercent',
            'bmr',
            'bodyAge',
            'bodyType',
            'updatedAt',
            'lastSyncedAt',
            'deletedAt',
          ],
          ['localId'],
        )
        .execute();

      // All valid health metrics synced successfully
      validHealthMetrics.forEach(hm => successful.push(hm.id));

      return {
        synced: validHealthMetrics.length,
        results: { successful, failed },
        errors,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to bulk sync health metrics: ${errorMessage}`,
      );
      validHealthMetrics.forEach(hm => failed.push(hm.id));
      errors.push(`Failed to sync health metrics: ${errorMessage}`);
      return { synced: 0, results: { successful, failed }, errors };
    }
  }

  private async syncPaymentMethods(
    paymentMethods: PaymentMethodSyncDto[],
    queryRunner: any,
  ): Promise<{ synced: number; results?: SyncResultDto; errors: string[] }> {
    if (paymentMethods.length === 0) return { synced: 0, errors: [] };

    const successful: number[] = [];
    const failed: number[] = [];
    const errors: string[] = [];

    const values = paymentMethods.map(paymentMethodDto => ({
      localId: paymentMethodDto.id,
      name: paymentMethodDto.name,
      description: paymentMethodDto.description ?? null,
      isActive: paymentMethodDto.isActive,
      lastSyncedAt: new Date(),
    }));

    try {
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(PaymentMethod)
        .values(values)
        .orUpdate(
          ['name', 'description', 'isActive', 'updatedAt', 'lastSyncedAt'],
          ['localId'],
        )
        .execute();

      paymentMethods.forEach(paymentMethod => successful.push(paymentMethod.id));

      return {
        synced: paymentMethods.length,
        results: { successful, failed },
        errors,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to bulk sync payment methods: ${errorMessage}`,
      );
      paymentMethods.forEach(paymentMethod => failed.push(paymentMethod.id));
      errors.push(`Failed to sync payment methods: ${errorMessage}`);
      return { synced: 0, results: { successful, failed }, errors };
    }
  }

  /**
   * Stores rows of desktop tables that have no entity of their own. Each table is
   * upserted separately so one bad table cannot hold back the others. Error texts
   * avoid the words that roll the whole batch back: these rows carry no foreign keys.
   */
  private async syncRecords(
    records: RecordSyncDto[],
    queryRunner: any,
  ): Promise<{ synced: number; results: Record<string, SyncResultDto>; errors: string[] }> {
    const results: Record<string, SyncResultDto> = {};
    const errors: string[] = [];
    let synced = 0;

    const byEntity = new Map<string, RecordSyncDto[]>();
    for (const record of records) {
      // A row of a table with its own entity belongs in that table, not here.
      if (TYPED_ENTITIES[record.entity]) {
        errors.push(`Record entity '${record.entity}' must use its own payload field`);
        continue;
      }
      if (LOCAL_ONLY_ENTITIES.has(record.entity)) {
        errors.push(`Record entity '${record.entity}' is not stored on the website`);
        continue;
      }
      const list = byEntity.get(record.entity) ?? [];
      list.push(record);
      byEntity.set(record.entity, list);
    }

    for (const [entity, rows] of byEntity) {
      // The last copy of a row wins if the desktop sent it twice.
      const unique = [...new Map(rows.map(r => [r.id, r])).values()];
      const values = unique.map(r => {
        const memberId = r.data['member_id'];
        return {
          entity,
          localId: r.id,
          memberLocalId: typeof memberId === 'number' ? memberId : null,
          data: withoutSecrets(r.data),
          lastSyncedAt: new Date(),
          deletedAt: null,
        };
      });
      try {
        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(SyncRecord)
          .values(values)
          .orUpdate(
            ['memberLocalId', 'data', 'updatedAt', 'lastSyncedAt', 'deletedAt'],
            ['entity', 'localId'],
          )
          .execute();
        results[entity] = { successful: unique.map(r => r.id), failed: [] };
        synced += unique.length;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to sync ${entity} records: ${errorMessage}`);
        results[entity] = { successful: [], failed: unique.map(r => r.id) };
        errors.push(`Failed to sync ${entity} records: ${errorMessage}`);
      }
    }

    return { synced, results, errors };
  }

  /** Marks leads the desktop acted on, so the desktop stops pulling them as pending. */
  private async syncProspectStatuses(
    statuses: ProspectStatusSyncDto[],
    queryRunner: any,
  ): Promise<{ results: SyncResultDto; errors: string[] }> {
    const successful: number[] = [];
    const failed: number[] = [];
    const errors: string[] = [];

    const memberLocalIds = [
      ...new Set(
        statuses
          .map(s => s.convertedToMemberId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    ];
    const members: Member[] =
      memberLocalIds.length > 0
        ? await queryRunner.manager.find(Member, { where: { localId: In(memberLocalIds) } })
        : [];
    const memberMap = new Map(members.map(m => [m.localId, m.id]));

    for (const dto of statuses) {
      try {
        const converted = dto.status === 'converted';
        await queryRunner.manager.update(PotentialCustomer, { id: dto.cloudId }, {
          status: dto.status,
          convertedAt: converted ? new Date() : null,
          convertedToMemberId:
            converted && dto.convertedToMemberId
              ? memberMap.get(dto.convertedToMemberId) ?? null
              : null,
        });
        // A lead deleted on the website has nothing left to update; that counts as done.
        successful.push(dto.cloudId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        failed.push(dto.cloudId);
        errors.push(`Failed to update lead ${dto.cloudId}: ${errorMessage}`);
      }
    }

    return { results: { successful, failed }, errors };
  }

  /**
   * Soft-deletes rows the desktop deleted. Deleting is idempotent: a row that is
   * already gone, or never arrived, counts as applied. A member takes their visits,
   * health records and other member-owned rows with them, as on the desktop.
   */
  /** Desktop member and staff ids this sync touched, upserted or deleted. */
  private accountSources(payload: SyncPayloadDto): [number[], number[]] {
    const memberIds = new Set((payload.members ?? []).map((m) => m.id));
    const staffIds = new Set((payload.staff ?? []).map((s) => s.id));
    for (const d of payload.deletions ?? []) {
      if (d.entity === 'member') memberIds.add(d.id);
      else if (d.entity === 'staff') staffIds.add(d.id);
    }
    return [[...memberIds], [...staffIds]];
  }

  private async applyDeletions(
    deletions: DeletionSyncDto[],
    queryRunner: any,
  ): Promise<{ synced: number; results: SyncResultDto; errors: string[] }> {
    const successful: number[] = [];
    const failed: number[] = [];
    const errors: string[] = [];

    const byEntity = new Map<string, DeletionSyncDto[]>();
    for (const d of deletions) {
      const list = byEntity.get(d.entity) ?? [];
      list.push(d);
      byEntity.set(d.entity, list);
    }

    for (const [entity, rows] of byEntity) {
      const ids = [...new Set(rows.map(r => r.id))];
      try {
        if (entity === 'potential_customer') {
          // Leads live in the cloud; deleting one on the desktop means "not interested".
          await queryRunner.manager.update(
            PotentialCustomer,
            { id: In(ids), status: 'pending' },
            { status: 'ignored' },
          );
        } else if (TYPED_ENTITIES[entity]) {
          await queryRunner.manager.softDelete(TYPED_ENTITIES[entity], { localId: In(ids) });
          if (entity === 'member') {
            await queryRunner.manager.softDelete(Attendance, { memberLocalId: In(ids) });
            await queryRunner.manager.softDelete(HealthMetric, { memberLocalId: In(ids) });
            await queryRunner.manager.softDelete(SyncRecord, { memberLocalId: In(ids) });
          }
        } else {
          await queryRunner.manager.softDelete(SyncRecord, { entity, localId: In(ids) });
        }
        successful.push(...rows.map(r => r.queueId));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to apply ${entity} deletions: ${errorMessage}`);
        failed.push(...rows.map(r => r.queueId));
        errors.push(`Failed to apply ${entity} deletions: ${errorMessage}`);
      }
    }

    return { synced: successful.length, results: { successful, failed }, errors };
  }

  async getLastSyncTime(): Promise<{ lastSyncAt: string | null }> {
    try {
      // Helper function to safely get max lastSyncedAt
      const getMaxLastSynced = async (
        repository: Repository<any>,
        entityName: string,
      ): Promise<{ max: Date | string } | null> => {
        try {
          const result = await repository
            .createQueryBuilder(entityName)
            .select(`MAX(${entityName}.lastSyncedAt)`, 'max')
            .where(`${entityName}.lastSyncedAt IS NOT NULL`)
            .getRawOne();
          return result || null;
        } catch (err) {
          this.logger.warn(`Failed to get ${entityName} lastSyncAt: ${err instanceof Error ? err.message : 'Unknown error'}`);
          return null;
        }
      };

      // Get the most recent lastSyncedAt from all entities
      const [serviceMax, memberMax, attendanceMax, transactionMax, paymentMethodMax, healthMetricMax, staffMax, staffAttendanceMax] = await Promise.allSettled([
        getMaxLastSynced(this.serviceRepository, 'service'),
        getMaxLastSynced(this.memberRepository, 'member'),
        getMaxLastSynced(this.attendanceRepository, 'attendance'),
        getMaxLastSynced(this.transactionRepository, 'transaction'),
        getMaxLastSynced(this.paymentMethodRepository, 'paymentMethod'),
        getMaxLastSynced(this.healthMetricRepository, 'healthMetric'),
        getMaxLastSynced(this.staffRepository, 'staff'),
        getMaxLastSynced(this.staffAttendanceRepository, 'staffAttendance'),
      ]);

      const dates: Date[] = [];
      
      if (serviceMax.status === 'fulfilled' && serviceMax.value?.max) {
        dates.push(new Date(serviceMax.value.max));
      }
      if (memberMax.status === 'fulfilled' && memberMax.value?.max) {
        dates.push(new Date(memberMax.value.max));
      }
      if (attendanceMax.status === 'fulfilled' && attendanceMax.value?.max) {
        dates.push(new Date(attendanceMax.value.max));
      }
      if (transactionMax.status === 'fulfilled' && transactionMax.value?.max) {
        dates.push(new Date(transactionMax.value.max));
      }
      if (paymentMethodMax.status === 'fulfilled' && paymentMethodMax.value?.max) {
        dates.push(new Date(paymentMethodMax.value.max));
      }
      if (healthMetricMax.status === 'fulfilled' && healthMetricMax.value?.max) {
        dates.push(new Date(healthMetricMax.value.max));
      }
      if (staffMax.status === 'fulfilled' && staffMax.value?.max) {
        dates.push(new Date(staffMax.value.max));
      }
      if (staffAttendanceMax.status === 'fulfilled' && staffAttendanceMax.value?.max) {
        dates.push(new Date(staffAttendanceMax.value.max));
      }

      if (dates.length === 0) {
        return { lastSyncAt: null };
      }

      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      return { lastSyncAt: maxDate.toISOString() };
    } catch (error) {
      this.logger.error(`Failed to get last sync time: ${error instanceof Error ? error.message : 'Unknown error'}`, error instanceof Error ? error.stack : undefined);
      return { lastSyncAt: null };
    }
  }
}

