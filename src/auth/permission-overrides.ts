import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AccountPermission } from '../entities/account-permission.entity';
import type { PermissionOverride } from './permissions';

const logger = new Logger('PermissionOverrides');
let warnedMissingTable = false;

/** Postgres "undefined_table": the 0016 migration has not been applied yet. */
function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string } };
  return e?.code === '42P01' || e?.driverError?.code === '42P01';
}

/**
 * An account's permission overrides.
 *
 * If the code is deployed before account_permission exists, signing in must keep
 * working: everyone simply gets their role defaults until the table is created.
 */
export async function loadOverrides(
  repo: Repository<AccountPermission>,
  accountId: number,
): Promise<PermissionOverride[]> {
  try {
    return await repo.find({
      where: { accountId },
      select: { permission: true, effect: true },
    });
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    if (!warnedMissingTable) {
      warnedMissingTable = true;
      logger.warn(
        'account_permission table missing (apply migrations/0016_account_permissions.sql); using role defaults',
      );
    }
    return [];
  }
}
