import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Between, MoreThanOrEqual, LessThanOrEqual, In } from 'typeorm';
import { Member } from '../entities/member.entity';
import { MemberQueryDto } from './dto/member-query.dto';
import { MemberDetailsDto, MemberStatsDto, MemberWebDto } from './dto/member-response.dto';
import { Staff } from '../entities/staff.entity';
import { SyncRecord } from '../entities/sync-record.entity';
import { RecordsService } from '../records/records.service';
import { PaginatedResponseDto, createPaginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    @InjectRepository(Member)
    private memberRepository: Repository<Member>,
    @InjectRepository(Staff)
    private staffRepository: Repository<Staff>,
    @InjectRepository(SyncRecord)
    private syncRecordRepository: Repository<SyncRecord>,
    private recordsService: RecordsService,
  ) {}

  /**
   * What the desktop keeps about a member beyond the member row: trainer, add-ons,
   * freezes, plan periods, group, linked members and drop-in visits.
   */
  async getDetails(member: Member): Promise<MemberDetailsDto> {
    const localId = member.localId;
    const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

    const [addons, freezeHistory, planHistory, groupLinks, dropIns, relationRecords, trainer] =
      await Promise.all([
        this.recordsService.forMember('member_additional_subscription', localId),
        this.recordsService.forMember('freeze_history', localId),
        this.recordsService.forMember('member_plan_history', localId),
        this.recordsService.forMember('member_group_member', localId),
        this.recordsService.forMember('service_usage', localId),
        // A link is stored once, under the lower of the two ids.
        this.syncRecordRepository
          .createQueryBuilder('r')
          .where('r.entity = :entity', { entity: 'member_relation' })
          .andWhere(
            "(r.memberLocalId = :id OR CAST(r.data->>'related_member_id' AS integer) = :id)",
            { id: localId },
          )
          .getMany(),
        member.trainerStaffLocalId != null
          ? this.staffRepository.findOne({ where: { localId: member.trainerStaffLocalId } })
          : Promise.resolve(null),
      ]);

    const [addonServices, variants, dropInServices] = await Promise.all([
      this.recordsService.byIds(
        'additional_service',
        addons.map(a => num(a['additional_service_id'])).filter((x): x is number => x != null),
      ),
      this.recordsService.byIds(
        'additional_service_variant',
        addons.map(a => num(a['variant_id'])).filter((x): x is number => x != null),
      ),
      this.recordsService.byIds(
        'usage_service',
        dropIns.map(d => num(d['usage_service_id'])).filter((x): x is number => x != null),
      ),
    ]);

    const currentLink = groupLinks.find(g => g['left_at'] == null);
    const groupId = currentLink ? num(currentLink['group_id']) : null;
    const group = groupId != null
      ? (await this.recordsService.byIds('member_group', [groupId])).get(groupId)
      : undefined;

    const relations = relationRecords.map(r => ({
      other:
        r.memberLocalId === localId ? num(r.data['related_member_id']) : r.memberLocalId,
      relation: r.data['relation'],
      note: r.data['note'] ?? null,
    }));
    const otherIds = relations.map(r => r.other).filter((x): x is number => x != null);
    const others = otherIds.length
      ? await this.memberRepository.find({ where: { localId: In(otherIds) } })
      : [];
    const otherMap = new Map(others.map(m => [m.localId, m]));

    const byStart = (a: Record<string, unknown>, b: Record<string, unknown>) =>
      String(b['start_date'] ?? '').localeCompare(String(a['start_date'] ?? ''));

    return {
      trainer: trainer ? { id: trainer.id, fullName: trainer.fullName } : null,
      addons: addons
        .map(a => ({
          ...a,
          addonName: addonServices.get(num(a['additional_service_id']) ?? -1)?.['name'] ?? null,
          variantName: variants.get(num(a['variant_id']) ?? -1)?.['name'] ?? null,
        }))
        .sort(byStart),
      freezeHistory: [...freezeHistory].sort(byStart),
      planHistory: [...planHistory].sort(byStart),
      group: group && groupId != null
        ? { id: groupId, name: String(group['name'] ?? ''), joinedAt: currentLink?.['joined_at'] ?? null }
        : null,
      relations: relations.map(r => {
        const other = r.other != null ? otherMap.get(r.other) : undefined;
        return {
          relation: r.relation,
          note: r.note,
          member: other ? { id: other.id, fullName: other.fullName } : null,
        };
      }),
      dropIns: dropIns
        .map(d => ({
          ...d,
          serviceName: dropInServices.get(num(d['usage_service_id']) ?? -1)?.['name'] ?? null,
        }))
        .sort((a, b) => String(b['usage_date'] ?? '').localeCompare(String(a['usage_date'] ?? ''))),
    };
  }

  /**
   * Transform Member entity to web app format. Status is passed through from DB with no overrides.
   */
  transformToWebFormat(member: Member): MemberWebDto {
    return {
      id: member.id,
      memberId: member.localId.toString(), // Convert localId to string
      fullName: member.fullName,
      phone: member.phoneNumber,
      email: member.email || undefined,
      gender: member.gender || undefined,
      status: member.status,
      serviceType: member.service?.name || undefined,
      startDate: member.subscriptionStartDate.toISOString(),
      endDate: member.subscriptionEndDate.toISOString(),
      registrationDate: member.firstRegisteredAt.toISOString(),
      emergencyContact: undefined, // Not in database
      notes: undefined, // Not in database
      membershipTier: member.membershipTier || undefined,
      goals: member.goals || undefined,
      bloodType: member.bloodType || undefined,
      age: member.age || undefined,
      height: member.height || undefined,
      telegramUsername: member.telegramUsername || undefined,
      remark: member.remark || undefined,
      objective: member.objective || undefined,
      trainerStaffId: member.trainerStaffLocalId ?? undefined,
      createdAt: member.createdAt.toISOString(),
      updatedAt: member.updatedAt.toISOString(),
    };
  }

  async findAll(query: MemberQueryDto): Promise<PaginatedResponseDto<MemberWebDto>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'DESC', search, status, subscriptionStatus, serviceId } = query;

    this.logger.log(`findAll called with query: ${JSON.stringify(query)}`);

    const queryBuilder = this.memberRepository.createQueryBuilder('member')
      .leftJoinAndSelect('member.service', 'service');

    // Search filter
    if (search) {
      queryBuilder.andWhere(
        '(member.fullName ILIKE :search OR member.phoneNumber ILIKE :search OR member.email ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    // Status filter
    if (status) {
      queryBuilder.andWhere('member.status = :status', { status });
    }

    // Subscription status filter
    if (subscriptionStatus) {
      queryBuilder.andWhere('member.subscriptionStatus = :subscriptionStatus', { subscriptionStatus });
    }

    // Service filter
    if (serviceId) {
      queryBuilder.andWhere('member.serviceId = :serviceId', { serviceId });
    }

    // Sorting
    const validSortFields = ['createdAt', 'fullName', 'subscriptionEndDate', 'firstRegisteredAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    queryBuilder.orderBy(`member.${sortField}`, sortOrder);

    // Get total count
    const total = await queryBuilder.getCount();

    // Pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const members = await queryBuilder.getMany();

    this.logger.log(`Found ${total} total members, returning ${members.length} on page ${page}`);

    // Transform members to web format
    const transformedMembers = members.map(member => this.transformToWebFormat(member));

    return createPaginatedResponse(transformedMembers, total, page, limit);
  }

  async findOne(id: number): Promise<Member | null> {
    return this.memberRepository.findOne({
      where: { id },
      relations: ['service'],
    });
  }

  async findByLocalId(localId: number): Promise<Member | null> {
    return this.memberRepository.findOne({
      where: { localId },
      relations: ['service'],
    });
  }

  async search(searchTerm: string, limit: number = 10): Promise<MemberWebDto[]> {
    const members = await this.memberRepository.createQueryBuilder('member')
      .leftJoinAndSelect('member.service', 'service')
      .where(
        '(member.fullName ILIKE :search OR member.phoneNumber ILIKE :search OR member.email ILIKE :search)',
        { search: `%${searchTerm}%` }
      )
      .orderBy('member.fullName', 'ASC')
      .take(limit)
      .getMany();
    
    return members.map(member => this.transformToWebFormat(member));
  }

  async getStats(): Promise<MemberStatsDto> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + 7);

    const [
      total,
      active,
      inactive,
      expiredSubscriptions,
      newThisMonth,
    ] = await Promise.all([
      this.memberRepository.count(),
      this.memberRepository.count({ where: { status: 'active' } }),
      // Count inactive + legacy expired status as inactive
      this.memberRepository.count({ where: { status: In(['inactive', 'expired']) } }),
      this.memberRepository.count({ where: { subscriptionStatus: 'expired' } }),
      this.memberRepository.count({
        where: {
          firstRegisteredAt: MoreThanOrEqual(startOfMonth),
        },
      }),
    ]);

    // Count expired members (subscription end date has passed)
    const expiredMembers = await this.memberRepository.count({
      where: {
        subscriptionEndDate: LessThanOrEqual(now),
      },
    });

    // Count frozen members
    const frozenMembers = await this.memberRepository.count({
      where: {
        status: 'frozen',
      },
    });

    // Count pending members
    const pendingMembers = await this.memberRepository.count({
      where: {
        status: 'pending',
      },
    });

    return {
      totalMembers: total,
      activeMembers: active,
      inactiveMembers: inactive,
      expiredMembers: expiredMembers,
      newThisMonth,
      frozenMembers,
      pendingMembers,
    };
  }
}

