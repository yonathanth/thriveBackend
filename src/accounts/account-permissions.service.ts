import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Admin } from '../entities/admin.entity';
import { AccountAudit } from '../entities/account-audit.entity';
import { AccountPermission } from '../entities/account-permission.entity';
import type { AuthUser } from '../auth/roles.guard';
import { Role, isRole } from '../auth/roles';
import {
  PERMISSIONS,
  ROLE_DEFAULTS,
  canOverride,
  effectivePermissions,
  isPermissionKey,
} from '../auth/permissions';
import { loadOverrides } from '../auth/permission-overrides';
import { WebAuditService } from '../web-audit/web-audit.service';

export interface PermissionRow {
  key: string;
  label: string;
  area: string;
  action: string;
  adminOnly: boolean;
  /** Whether an admin may override this key for this account's role. */
  grantable: boolean;
  roleDefault: boolean;
  override: 'grant' | 'deny' | null;
  effective: boolean;
}

export interface AccountPermissionsDto {
  account: { id: number; name: string; role: string };
  permissions: PermissionRow[];
}

function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string } };
  return e?.code === '42P01' || e?.driverError?.code === '42P01';
}

/**
 * Per-account overrides on top of role defaults, set by admins.
 *
 * Overrides are read on every request (JwtStrategy), so a change applies to the
 * account's very next call without signing anyone out.
 */
@Injectable()
export class AccountPermissionsService {
  constructor(
    @InjectRepository(Admin) private accounts: Repository<Admin>,
    @InjectRepository(AccountPermission)
    private overrides: Repository<AccountPermission>,
    @InjectRepository(AccountAudit) private audit: Repository<AccountAudit>,
    @Optional() private webAudit?: WebAuditService,
  ) {}

  catalog() {
    return {
      permissions: PERMISSIONS.map((p) => ({
        key: p.key,
        label: p.label,
        area: p.area,
        action: p.action,
        adminOnly: !!p.adminOnly,
        grantableTo: p.grantableTo,
      })),
      roleDefaults: ROLE_DEFAULTS,
    };
  }

  async get(id: number): Promise<AccountPermissionsDto> {
    const account = await this.target(id);
    const role = account.role as Role;
    const rows = await loadOverrides(this.overrides, account.id);
    const byKey = new Map(rows.map((r) => [r.permission, r.effect]));
    const effective = new Set(effectivePermissions(role, rows));
    const defaults = new Set(ROLE_DEFAULTS[role]);
    return {
      account: { id: account.id, name: account.name, role: account.role },
      permissions: PERMISSIONS.map((p) => {
        const grantable = canOverride(role, p.key);
        const o = byKey.get(p.key);
        return {
          key: p.key,
          label: p.label,
          area: p.area,
          action: p.action,
          adminOnly: !!p.adminOnly,
          grantable,
          roleDefault: defaults.has(p.key),
          override: grantable && (o === 'grant' || o === 'deny') ? o : null,
          effective: effective.has(p.key),
        };
      }),
    };
  }

  async set(
    actor: AuthUser,
    id: number,
    changes: Record<string, unknown>,
  ): Promise<AccountPermissionsDto> {
    const account = await this.target(id);
    const role = account.role as Role;

    // Validate everything first so one bad key changes nothing.
    const entries = Object.entries(changes ?? {});
    for (const [key, value] of entries) {
      if (!isPermissionKey(key)) {
        throw new BadRequestException(`Unknown permission: ${String(key)}`);
      }
      if (value !== null && value !== 'grant' && value !== 'deny') {
        throw new BadRequestException(`${key} must be 'grant', 'deny' or null`);
      }
      if (value !== null && !canOverride(role, key)) {
        throw new BadRequestException(
          `${key} can't be changed for a ${role} account`,
        );
      }
    }

    const changed: Record<string, string | null> = {};
    try {
      const existing = new Map(
        (await this.overrides.find({ where: { accountId: id } })).map((r) => [
          r.permission,
          r,
        ]),
      );
      for (const [key, value] of entries as [
        string,
        'grant' | 'deny' | null,
      ][]) {
        const row = existing.get(key);
        if (value === null) {
          if (row) {
            await this.overrides.delete({ id: row.id });
            changed[key] = null;
          }
        } else if (!row) {
          await this.overrides.insert({
            accountId: id,
            permission: key,
            effect: value,
            createdBy: actor.id,
          });
          changed[key] = value;
        } else if (row.effect !== value) {
          await this.overrides.update(
            { id: row.id },
            { effect: value, createdBy: actor.id },
          );
          changed[key] = value;
        }
      }
    } catch (err) {
      if (isMissingTable(err)) {
        throw new ServiceUnavailableException(
          'Permission overrides are not set up yet (migration 0016 has not been applied)',
        );
      }
      throw err;
    }

    if (Object.keys(changed).length) {
      await this.audit.save(
        this.audit.create({
          actorId: actor.id,
          action: 'permissions_changed',
          targetId: id,
          detail: { changes: changed },
        }),
      );
      await this.webAudit?.record(
        actor,
        'accounts',
        'permissions_changed',
        `Changed permissions for ${account.name}`,
        { targetId: id, changes: changed },
      );
    }
    return this.get(id);
  }

  /** Admins always hold everything; members have their own fixed portal. */
  private async target(id: number): Promise<Admin> {
    const account = await this.accounts.findOne({ where: { id } });
    if (!account || !isRole(account.role)) {
      throw new NotFoundException('Account not found');
    }
    if (account.role === 'admin') {
      throw new BadRequestException('Admins always have every permission');
    }
    if (account.role === 'member') {
      throw new BadRequestException(
        "Member accounts don't have adjustable permissions",
      );
    }
    return account;
  }
}
