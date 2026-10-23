import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Admin } from '../entities/admin.entity';
import { Member } from '../entities/member.entity';
import { Staff } from '../entities/staff.entity';
import { AccountAudit } from '../entities/account-audit.entity';
import { AccountLinkConflict } from '../entities/account-link-conflict.entity';
import type { Role } from '../auth/roles';
import { normalizePhone } from './phone';
import { higherRole, websiteRoleForStaff } from './role-mapping';
import { defaultPassword, hashPassword } from './passwords';

type SourceType = 'member' | 'staff';
type ConflictKind =
  'shared_phone' | 'admin_phone' | 'phone_taken' | 'invalid_phone';

/** deactivatedReason values set by sync; an admin's own deactivation leaves it null. */
const SYNC_REASON = 'no_desktop_access';

export interface ReconcileSummary {
  created: number;
  updated: number;
  conflicts: number;
}

/**
 * Gives synced managers, trainers and members a website login, and keeps it in step
 * with the desktop. Accounts are linked by desktop id (staffLocalId / memberLocalId);
 * the phone number is only the sign-in name and the first-time match.
 *
 * Never guesses: a phone shared by several members, held by a website admin, or
 * already linked elsewhere becomes an AccountLinkConflict for an admin instead.
 * Idempotent, so it is safe to run after every sync and as a full backfill.
 */
@Injectable()
export class AccountProvisioningService {
  private readonly logger = new Logger(AccountProvisioningService.name);

  constructor(
    @InjectRepository(Admin) private accounts: Repository<Admin>,
    @InjectRepository(Member) private members: Repository<Member>,
    @InjectRepository(Staff) private staff: Repository<Staff>,
    @InjectRepository(AccountLinkConflict)
    private conflicts: Repository<AccountLinkConflict>,
    @InjectRepository(AccountAudit) private audit: Repository<AccountAudit>,
  ) {}

  /** Run after a sync commits. Never throws: a failure here must not touch the sync. */
  async afterSync(
    memberLocalIds: number[],
    staffLocalIds: number[],
  ): Promise<void> {
    if (memberLocalIds.length === 0 && staffLocalIds.length === 0) return;
    try {
      const s = await this.reconcile(memberLocalIds, staffLocalIds);
      if (s.created || s.updated || s.conflicts) {
        this.logger.log(
          `Accounts after sync: ${s.created} created, ${s.updated} updated, ${s.conflicts} conflicts`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Account provisioning after sync failed: ${message}`);
    }
  }

  /** Every synced member and staff row, in chunks. */
  async reconcileAll(): Promise<ReconcileSummary> {
    const total: ReconcileSummary = { created: 0, updated: 0, conflicts: 0 };
    const staffIds = (
      await this.staff.find({ select: ['localId'], withDeleted: true })
    ).map((s) => s.localId);
    const memberIds = (
      await this.members.find({ select: ['localId'], withDeleted: true })
    ).map((m) => m.localId);
    const CHUNK = 500;
    for (let i = 0; i < staffIds.length; i += CHUNK) {
      add(total, await this.reconcile([], staffIds.slice(i, i + CHUNK)));
    }
    for (let i = 0; i < memberIds.length; i += CHUNK) {
      add(total, await this.reconcile(memberIds.slice(i, i + CHUNK), []));
    }
    return total;
  }

  async reconcile(
    memberLocalIds: number[],
    staffLocalIds: number[],
  ): Promise<ReconcileSummary> {
    const summary: ReconcileSummary = { created: 0, updated: 0, conflicts: 0 };
    let defaultHash: string | null = null;
    const getDefaultHash = async () =>
      (defaultHash ??= await hashPassword(defaultPassword()));

    // Staff first, so a trainer who is also a member is created with the higher role.
    const staffRows = staffLocalIds.length
      ? await this.staff.find({
          where: { localId: In(staffLocalIds) },
          withDeleted: true,
        })
      : [];
    const memberRows = memberLocalIds.length
      ? await this.members.find({
          where: { localId: In(memberLocalIds) },
          withDeleted: true,
        })
      : [];

    const sources: {
      type: SourceType;
      localId: number;
      row: Staff | Member | undefined;
    }[] = [
      ...staffLocalIds.map((id) => ({
        type: 'staff' as const,
        localId: id,
        row: staffRows.find((s) => s.localId === id),
      })),
      ...memberLocalIds.map((id) => ({
        type: 'member' as const,
        localId: id,
        row: memberRows.find((m) => m.localId === id),
      })),
    ];

    for (const source of sources) {
      const linkKey =
        source.type === 'staff' ? 'staffLocalId' : 'memberLocalId';
      const linked = await this.accounts.findOne({
        where: { [linkKey]: source.localId },
      });

      if (linked) {
        if (await this.refresh(linked, summary)) summary.updated++;
        continue;
      }

      const role = this.sourceRole(source.type, source.row);
      if (!role || !source.row) continue; // no website access for this record

      await this.link(source.type, source.row, role, summary, getDefaultHash);
    }

    return summary;
  }

  /** The role a desktop record grants on its own, or null if none (deleted, custom role, ...). */
  private sourceRole(
    type: SourceType,
    row: Staff | Member | undefined,
  ): Role | null {
    if (!row || row.deletedAt) return null;
    if (type === 'member') return 'member';
    const staff = row as Staff;
    const role = websiteRoleForStaff(staff.role);
    if (!role) return null;
    if (staff.status && staff.status.toLowerCase() !== 'active') return null;
    if (staff.accessValidTo && staff.accessValidTo < new Date()) return null;
    return role;
  }

  /** First-time link: by phone, or a new account. */
  private async link(
    type: SourceType,
    row: Staff | Member,
    role: Role,
    summary: ReconcileSummary,
    getDefaultHash: () => Promise<string>,
  ): Promise<void> {
    const rawPhone = row.phoneNumber;
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      await this.conflict(
        'invalid_phone',
        type,
        row.localId,
        rawPhone,
        'No usable mobile number',
        summary,
      );
      return;
    }

    if (
      type === 'member' &&
      (await this.memberPhoneIsShared(phone, row.localId))
    ) {
      await this.conflict(
        'shared_phone',
        type,
        row.localId,
        rawPhone,
        'Several members have this phone number',
        summary,
      );
      return;
    }

    const existing = await this.accounts.findOne({ where: { phone } });
    const linkKey = type === 'staff' ? 'staffLocalId' : 'memberLocalId';

    if (!existing) {
      const account = this.accounts.create({
        name: row.fullName,
        phone,
        email: null,
        role,
        password: await getDefaultHash(),
        mustChangePassword: true,
        isActive: true,
        source: 'desktop_sync',
        [linkKey]: row.localId,
      });
      await this.accounts.save(account);
      await this.audit.insert({
        actorId: null,
        action: 'provisioned',
        targetId: account.id,
        detail: { [linkKey]: row.localId, role },
      });
      await this.resolveConflicts(type, row.localId);
      summary.created++;
      return;
    }

    // Website admins are never tied to desktop records: that would hand desktop data
    // control over an admin login, or an admin login to whoever owns the phone.
    if (existing.role === 'admin') {
      await this.conflict(
        'admin_phone',
        type,
        row.localId,
        rawPhone,
        `Phone belongs to website admin account #${existing.id}`,
        summary,
      );
      return;
    }

    if (existing[linkKey] !== null) {
      await this.conflict(
        'phone_taken',
        type,
        row.localId,
        rawPhone,
        `Phone already belongs to account #${existing.id}`,
        summary,
      );
      return;
    }

    // Same phone on a staff and a member record: the same person, one login.
    existing[linkKey] = row.localId;
    await this.refresh(existing, summary, true);
    await this.resolveConflicts(type, row.localId);
    summary.updated++;
  }

  /**
   * Re-derives role, active state and phone from the account's linked desktop records.
   * Returns whether anything changed.
   */
  private async refresh(
    account: Admin,
    summary: ReconcileSummary,
    force = false,
  ): Promise<boolean> {
    if (account.role === 'admin') return false;

    const staff =
      account.staffLocalId !== null
        ? await this.staff.findOne({
            where: { localId: account.staffLocalId },
            withDeleted: true,
          })
        : null;
    const member =
      account.memberLocalId !== null
        ? await this.members.findOne({
            where: { localId: account.memberLocalId },
            withDeleted: true,
          })
        : null;

    const staffRole = this.sourceRole('staff', staff ?? undefined);
    const memberRole = this.sourceRole('member', member ?? undefined);
    const role = higherRole(staffRole, memberRole);
    let changed = force;

    if (role) {
      if (account.role !== role) {
        account.role = role;
        changed = true;
      }
      // Reactivate only what sync itself turned off; an admin's deactivation stands.
      if (!account.isActive && account.deactivatedReason === SYNC_REASON) {
        account.isActive = true;
        account.deactivatedReason = null;
        changed = true;
      }
    } else if (account.isActive) {
      account.isActive = false;
      account.deactivatedReason = SYNC_REASON;
      changed = true;
    }

    // Keep the sign-in phone in step with the desktop, preferring the staff record.
    const phoneSource =
      staffRole && staff ? staff : memberRole && member ? member : null;
    const phone = normalizePhone(phoneSource?.phoneNumber);
    if (phone && phone !== account.phone) {
      const holder = await this.accounts.findOne({
        where: { phone, id: Not(account.id) },
      });
      if (holder) {
        await this.conflict(
          'phone_taken',
          phoneSource === staff ? 'staff' : 'member',
          phoneSource!.localId,
          phoneSource!.phoneNumber,
          `New phone already belongs to account #${holder.id}; account #${account.id} keeps its old phone`,
          summary,
        );
      } else {
        account.phone = phone;
        changed = true;
      }
    }

    const name =
      (staffRole && staff?.fullName) || (memberRole && member?.fullName);
    if (name && name !== account.name) {
      account.name = name;
      changed = true;
    }

    if (changed) await this.accounts.save(account);
    return changed;
  }

  /** Whether another non-deleted member uses the same phone (in any format). */
  private async memberPhoneIsShared(
    phone: string,
    localId: number,
  ): Promise<boolean> {
    const lastNine = phone.slice(-9);
    const candidates = await this.members
      .createQueryBuilder('m')
      .select(['m.localId', 'm.phoneNumber'])
      .where(`regexp_replace(m."phoneNumber", '\\D', '', 'g') LIKE :suffix`, {
        suffix: `%${lastNine}`,
      })
      .andWhere('m.localId != :localId', { localId })
      .getMany();
    return candidates.some((m) => normalizePhone(m.phoneNumber) === phone);
  }

  private async conflict(
    kind: ConflictKind,
    sourceType: SourceType,
    sourceLocalId: number,
    phone: string | null,
    detail: string,
    summary: ReconcileSummary,
  ): Promise<void> {
    await this.conflicts
      .createQueryBuilder()
      .insert()
      .values({
        kind,
        sourceType,
        sourceLocalId,
        phone,
        detail,
        status: 'open',
        resolvedAt: null,
      })
      .orUpdate(
        ['phone', 'detail', 'status', 'resolvedAt'],
        ['kind', 'sourceType', 'sourceLocalId'],
      )
      .execute();
    summary.conflicts++;
  }

  private async resolveConflicts(
    sourceType: SourceType,
    sourceLocalId: number,
  ): Promise<void> {
    await this.conflicts.update(
      { sourceType, sourceLocalId, resolvedAt: IsNull() },
      { status: 'resolved', resolvedAt: new Date() },
    );
  }
}

function add(total: ReconcileSummary, s: ReconcileSummary): void {
  total.created += s.created;
  total.updated += s.updated;
  total.conflicts += s.conflicts;
}
