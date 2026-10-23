import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Admin } from '../entities/admin.entity';
import { AccountAudit } from '../entities/account-audit.entity';
import { AccountLinkConflict } from '../entities/account-link-conflict.entity';
import type { AuthUser } from '../auth/roles.guard';
import { normalizePhone } from './phone';
import { defaultPassword, hashPassword } from './passwords';
import {
  MANAGER_MANAGES,
  canResetPassword,
  canSetStatus,
  canView,
} from './account-policy';
import { AccountDto, AccountQueryDto, CreateAdminDto } from './dto/account.dto';
import {
  AccountProvisioningService,
  ReconcileSummary,
} from './account-provisioning.service';

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    @InjectRepository(Admin) private accounts: Repository<Admin>,
    @InjectRepository(AccountAudit) private audit: Repository<AccountAudit>,
    @InjectRepository(AccountLinkConflict)
    private conflicts: Repository<AccountLinkConflict>,
    private provisioning: AccountProvisioningService,
  ) {}

  async list(actor: AuthUser, query: AccountQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.accounts.createQueryBuilder('a');

    // Managers only ever see trainer and member accounts.
    if (actor.role === 'manager')
      qb.andWhere('a.role IN (:...visible)', { visible: MANAGER_MANAGES });
    if (query.role) qb.andWhere('a.role = :role', { role: query.role });
    if (query.status)
      qb.andWhere('a.isActive = :active', {
        active: query.status === 'active',
      });
    if (query.search) {
      const term = `%${query.search.trim()}%`;
      const phone = normalizePhone(query.search);
      qb.andWhere(
        new Brackets((w) => {
          w.where('a.name ILIKE :term', { term })
            .orWhere('a.email ILIKE :term', { term })
            .orWhere('a.phone ILIKE :term', { term });
          if (phone) w.orWhere('a.phone = :phone', { phone });
        }),
      );
    }

    const [rows, total] = await qb
      .orderBy('a.role', 'ASC')
      .addOrderBy('a.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows.map((a) => this.toDto(actor, a)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async get(actor: AuthUser, id: number): Promise<AccountDto> {
    return this.toDto(actor, await this.findVisible(actor, id));
  }

  /** Back to the temporary default; the holder must choose a new one at next sign-in. */
  async resetPassword(actor: AuthUser, id: number): Promise<AccountDto> {
    const target = await this.findVisible(actor, id);
    if (!canResetPassword(actor, target)) {
      throw new ForbiddenException(
        actor.id === target.id
          ? 'Use change password for your own account'
          : 'You cannot reset this account',
      );
    }

    target.password = await hashPassword(defaultPassword());
    target.mustChangePassword = true;
    target.tokenVersion += 1;
    target.failedLoginAttempts = 0;
    target.lockedUntil = null;
    await this.accounts.save(target);
    await this.log(actor.id, 'password_reset', target.id, {
      role: target.role,
    });

    this.logger.log(`Password reset: account ${target.id} by ${actor.id}`);
    return this.toDto(actor, target);
  }

  /** Website-only admin, signing in by phone (and optionally email). */
  async createAdmin(actor: AuthUser, dto: CreateAdminDto): Promise<AccountDto> {
    const phone = normalizePhone(dto.phone);
    if (!phone)
      throw new BadRequestException('Enter a valid Ethiopian mobile number');
    const email = dto.email?.trim().toLowerCase() || null;

    if (await this.accounts.findOne({ where: { phone } })) {
      throw new ConflictException(
        'An account with this phone number already exists',
      );
    }
    if (email && (await this.accounts.findOne({ where: { email } }))) {
      throw new ConflictException('An account with this email already exists');
    }

    const admin = this.accounts.create({
      name: dto.name.trim(),
      phone,
      email,
      role: 'admin',
      password: await hashPassword(dto.password),
      // The creator knows this password, so the new admin replaces it on first sign-in.
      mustChangePassword: true,
      isActive: true,
      source: 'web',
      createdById: actor.id,
    });
    await this.accounts.save(admin);
    await this.log(actor.id, 'admin_created', admin.id, null);

    this.logger.log(`Admin created: account ${admin.id} by ${actor.id}`);
    return this.toDto(actor, admin);
  }

  async setStatus(
    actor: AuthUser,
    id: number,
    isActive: boolean,
  ): Promise<AccountDto> {
    const target = await this.findVisible(actor, id);
    if (!canSetStatus(actor, target)) {
      throw new ForbiddenException(
        actor.id === target.id
          ? 'You cannot change your own status'
          : 'You cannot change this account',
      );
    }
    if (target.isActive === isActive) return this.toDto(actor, target);

    if (!isActive && target.role === 'admin') {
      const activeAdmins = await this.accounts.count({
        where: { role: 'admin', isActive: true },
      });
      if (activeAdmins <= 1)
        throw new BadRequestException(
          'The last active admin cannot be deactivated',
        );
    }

    target.isActive = isActive;
    // Null marks an admin's decision, which sync will not undo.
    target.deactivatedReason = null;
    if (!isActive) target.tokenVersion += 1;
    await this.accounts.save(target);
    await this.log(
      actor.id,
      isActive ? 'activated' : 'deactivated',
      target.id,
      null,
    );

    return this.toDto(actor, target);
  }

  async listConflicts(status: 'open' | 'resolved') {
    const rows = await this.conflicts.find({
      where: { status },
      order: { createdAt: 'DESC' },
      take: 500,
    });
    return { data: rows, total: rows.length };
  }

  async resolveConflict(
    actor: AuthUser,
    id: number,
  ): Promise<AccountLinkConflict> {
    const conflict = await this.conflicts.findOne({ where: { id } });
    if (!conflict) throw new NotFoundException('Conflict not found');
    conflict.status = 'resolved';
    conflict.resolvedAt = new Date();
    await this.conflicts.save(conflict);
    await this.log(actor.id, 'conflict_resolved', null, { conflictId: id });
    return conflict;
  }

  async reconcileAll(actor: AuthUser): Promise<ReconcileSummary> {
    const summary = await this.provisioning.reconcileAll();
    await this.log(actor.id, 'reconciled', null, { ...summary });
    return summary;
  }

  async recentAudit(actor: AuthUser, targetId: number) {
    await this.findVisible(actor, targetId);
    return this.audit.find({
      where: { targetId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  /** 404 rather than 403 for accounts the actor may not see, so ids are not probed. */
  private async findVisible(actor: AuthUser, id: number): Promise<Admin> {
    const account = await this.accounts.findOne({ where: { id } });
    if (!account || !canView(actor, account))
      throw new NotFoundException('Account not found');
    return account;
  }

  private toDto(actor: AuthUser, a: Admin): AccountDto {
    return {
      id: a.id,
      name: a.name,
      role: a.role,
      email: a.email,
      phone: a.phone,
      isActive: a.isActive,
      deactivatedReason: a.deactivatedReason,
      mustChangePassword: a.mustChangePassword,
      source: a.source,
      staffLocalId: a.staffLocalId,
      memberLocalId: a.memberLocalId,
      lastLoginAt: a.lastLoginAt,
      lockedUntil:
        a.lockedUntil && a.lockedUntil > new Date() ? a.lockedUntil : null,
      createdAt: a.createdAt,
      canResetPassword: canResetPassword(actor, a),
      canSetStatus: canSetStatus(actor, a),
    };
  }

  private async log(
    actorId: number,
    action: string,
    targetId: number | null,
    detail: Record<string, unknown> | null,
  ): Promise<void> {
    await this.audit.save(
      this.audit.create({ actorId, action, targetId, detail }),
    );
  }
}
