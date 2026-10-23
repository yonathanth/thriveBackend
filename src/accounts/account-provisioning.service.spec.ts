/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await, @typescript-eslint/no-this-alias, @typescript-eslint/no-unnecessary-type-assertion -- loose in-memory repository fakes */
import { FindOperator } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AccountProvisioningService } from './account-provisioning.service';
import { normalizePhone } from './phone';
import { Admin } from '../entities/admin.entity';
import { Member } from '../entities/member.entity';
import { Staff } from '../entities/staff.entity';
import { AccountLinkConflict } from '../entities/account-link-conflict.entity';

type Row = Record<string, any>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond instanceof FindOperator) {
      const value = cond.value as any;
      switch (cond.type) {
        case 'in':
          return (value as unknown[]).includes(row[key]);
        case 'not':
          return value instanceof FindOperator
            ? !matches(row, { [key]: value })
            : row[key] !== value;
        case 'isNull':
          return row[key] == null;
        default:
          throw new Error(`unsupported operator ${cond.type}`);
      }
    }
    return row[key] === cond;
  });
}

/** Just enough of a TypeORM repository for the provisioning service. */
class FakeRepo {
  rows: Row[] = [];
  private nextId = 1;

  constructor(private defaults: Row = {}) {}

  private visible(opts: { withDeleted?: boolean }) {
    return opts.withDeleted ? this.rows : this.rows.filter((r) => !r.deletedAt);
  }
  async findOne(opts: { where: Row; withDeleted?: boolean }) {
    return this.visible(opts).find((r) => matches(r, opts.where)) ?? null;
  }
  async find(opts: { where?: Row; withDeleted?: boolean } = {}) {
    return this.visible(opts).filter(
      (r) => !opts.where || matches(r, opts.where),
    );
  }
  create(obj: Row) {
    return { ...this.defaults, ...obj };
  }
  async save(obj: Row) {
    if (obj.id == null) {
      obj.id = this.nextId++;
      obj.createdAt = new Date();
      this.rows.push(obj);
    }
    return obj;
  }
  async insert(obj: Row) {
    await this.save({ ...obj });
  }
  async update(where: Row, patch: Row) {
    this.rows
      .filter((r) => matches(r, where))
      .forEach((r) => Object.assign(r, patch));
  }
  /** Member phone lookups and the conflict upsert. */
  createQueryBuilder() {
    const repo = this;
    let excludeLocalId: number | undefined;
    let values: Row;
    const qb: any = {
      select: () => qb,
      where: () => qb,
      andWhere: (_sql: string, params: Row) => {
        excludeLocalId = params.localId;
        return qb;
      },
      getMany: async () =>
        repo.rows.filter((r) => !r.deletedAt && r.localId !== excludeLocalId),
      insert: () => qb,
      values: (v: Row) => {
        values = v;
        return qb;
      },
      orUpdate: () => qb,
      execute: async () => {
        const existing = repo.rows.find(
          (r) =>
            r.kind === values.kind &&
            r.sourceType === values.sourceType &&
            r.sourceLocalId === values.sourceLocalId,
        );
        if (existing) Object.assign(existing, values);
        else await repo.save({ ...values });
      },
    };
    return qb;
  }
}

describe('AccountProvisioningService', () => {
  let accounts: FakeRepo;
  let members: FakeRepo;
  let staff: FakeRepo;
  let conflicts: FakeRepo;
  let audit: FakeRepo;
  let service: AccountProvisioningService;

  const member = (
    localId: number,
    phoneNumber: string,
    extra: Partial<Member> = {},
  ) =>
    members.rows.push({
      localId,
      phoneNumber,
      fullName: `Member ${localId}`,
      deletedAt: null,
      ...extra,
    });
  const staffRow = (
    localId: number,
    phoneNumber: string | null,
    role: string,
    extra: Partial<Staff> = {},
  ) =>
    staff.rows.push({
      localId,
      phoneNumber,
      role,
      fullName: `Staff ${localId}`,
      status: 'active',
      accessValidTo: null,
      deletedAt: null,
      ...extra,
    });
  const openConflicts = () =>
    conflicts.rows.filter((c) => c.status === 'open') as AccountLinkConflict[];
  const account = (where: Row) =>
    accounts.rows.find((a) => matches(a, where)) as Admin | undefined;

  beforeEach(() => {
    accounts = new FakeRepo({
      email: null,
      staffLocalId: null,
      memberLocalId: null,
      tokenVersion: 0,
      isActive: true,
      deactivatedReason: null,
    });
    members = new FakeRepo();
    staff = new FakeRepo();
    conflicts = new FakeRepo();
    audit = new FakeRepo();
    service = new AccountProvisioningService(
      accounts as any,
      members as any,
      staff as any,
      conflicts as any,
      audit as any,
    );
  });

  it('creates a member login with the hashed temporary password', async () => {
    member(1, '0911000001');
    const s = await service.reconcile([1], []);

    expect(s.created).toBe(1);
    const a = account({ memberLocalId: 1 })!;
    expect(a.role).toBe('member');
    expect(a.phone).toBe('+251911000001');
    expect(a.mustChangePassword).toBe(true);
    expect(a.source).toBe('desktop_sync');
    expect(a.password).not.toBe('0000');
    expect(await bcrypt.compare('0000', a.password)).toBe(true);
  });

  it('is idempotent: a repeated sync makes no duplicates', async () => {
    member(1, '0911000001');
    staffRow(10, '0911000010', 'Trainer');
    await service.reconcile([1], [10]);
    const second = await service.reconcile([1], [10]);

    expect(accounts.rows).toHaveLength(2);
    expect(second.created).toBe(0);
  });

  it('maps Manager and Trainer and ignores custom desktop roles, including Admin', async () => {
    staffRow(10, '0911000010', 'Manager');
    staffRow(11, '0911000011', 'trainer');
    staffRow(12, '0911000012', 'Receptionist');
    staffRow(13, '0911000013', 'Admin');
    await service.reconcile([], [10, 11, 12, 13]);

    expect(account({ staffLocalId: 10 })?.role).toBe('manager');
    expect(account({ staffLocalId: 11 })?.role).toBe('trainer');
    expect(account({ staffLocalId: 12 })).toBeUndefined();
    expect(account({ staffLocalId: 13 })).toBeUndefined();
    expect(accounts.rows.some((a) => a.role === 'admin')).toBe(false);
  });

  it('gives a trainer who is also a member one login with the higher role', async () => {
    staffRow(10, '+251 911 000 010', 'Trainer');
    member(1, '0911000010');
    await service.reconcile([1], [10]);

    expect(accounts.rows).toHaveLength(1);
    const a = account({ staffLocalId: 10 })!;
    expect(a.memberLocalId).toBe(1);
    expect(a.role).toBe('trainer');
  });

  it('records a conflict instead of linking members who share a phone', async () => {
    member(1, '0911000001');
    member(2, '911000001');
    const s = await service.reconcile([1, 2], []);

    expect(s.created).toBe(0);
    expect(accounts.rows).toHaveLength(0);
    expect(openConflicts().map((c) => [c.kind, c.sourceLocalId])).toEqual([
      ['shared_phone', 1],
      ['shared_phone', 2],
    ]);
  });

  it('never links desktop records to a website admin with the same phone', async () => {
    accounts.rows.push({
      id: 99,
      role: 'admin',
      phone: '+251911000001',
      staffLocalId: null,
      memberLocalId: null,
    });
    staffRow(10, '0911000001', 'Manager');
    await service.reconcile([], [10]);

    const admin = account({ id: 99 })!;
    expect(admin.staffLocalId).toBeNull();
    expect(admin.role).toBe('admin');
    expect(openConflicts()[0].kind).toBe('admin_phone');
  });

  it('records invalid phone numbers as conflicts', async () => {
    member(1, '12345');
    await service.reconcile([1], []);
    expect(accounts.rows).toHaveLength(0);
    expect(openConflicts()[0].kind).toBe('invalid_phone');
  });

  it('deactivates on desktop deletion and reactivates on restore', async () => {
    member(1, '0911000001');
    await service.reconcile([1], []);

    members.rows[0].deletedAt = new Date();
    await service.reconcile([1], []);
    expect(account({ memberLocalId: 1 })!.isActive).toBe(false);

    members.rows[0].deletedAt = null;
    await service.reconcile([1], []);
    expect(account({ memberLocalId: 1 })!.isActive).toBe(true);
  });

  it('does not undo an admin deactivation', async () => {
    member(1, '0911000001');
    await service.reconcile([1], []);
    Object.assign(account({ memberLocalId: 1 })!, {
      isActive: false,
      deactivatedReason: null,
    });

    await service.reconcile([1], []);
    expect(account({ memberLocalId: 1 })!.isActive).toBe(false);
  });

  it('turns off a trainer who is suspended, expired or given a custom role', async () => {
    staffRow(10, '0911000010', 'Trainer');
    await service.reconcile([], [10]);

    staff.rows[0].status = 'suspended';
    await service.reconcile([], [10]);
    expect(account({ staffLocalId: 10 })!.isActive).toBe(false);

    Object.assign(staff.rows[0], {
      status: 'active',
      accessValidTo: new Date(Date.now() - 86400000),
    });
    await service.reconcile([], [10]);
    expect(account({ staffLocalId: 10 })!.isActive).toBe(false);

    Object.assign(staff.rows[0], { accessValidTo: null, role: 'Cleaner' });
    await service.reconcile([], [10]);
    expect(account({ staffLocalId: 10 })!.isActive).toBe(false);

    staff.rows[0].role = 'Trainer';
    await service.reconcile([], [10]);
    expect(account({ staffLocalId: 10 })!.isActive).toBe(true);
  });

  it('follows a desktop phone change but keeps the link on the desktop id', async () => {
    member(1, '0911000001');
    await service.reconcile([1], []);
    members.rows[0].phoneNumber = '0922000001';
    await service.reconcile([1], []);

    const a = account({ memberLocalId: 1 })!;
    expect(a.phone).toBe(normalizePhone('0922000001'));
    expect(accounts.rows).toHaveLength(1);
  });

  it('keeps the old phone when the new one belongs to someone else', async () => {
    member(1, '0911000001');
    member(2, '0911000002');
    await service.reconcile([1, 2], []);
    members.rows[0].phoneNumber = '0911000002';
    await service.reconcile([1], []);

    expect(account({ memberLocalId: 1 })!.phone).toBe('+251911000001');
    expect(
      openConflicts().some(
        (c) => c.kind === 'phone_taken' && c.sourceLocalId === 1,
      ),
    ).toBe(true);
  });

  it('resolves an earlier conflict once the record can be linked', async () => {
    member(1, '12345');
    await service.reconcile([1], []);
    members.rows[0].phoneNumber = '0911000001';
    await service.reconcile([1], []);

    expect(account({ memberLocalId: 1 })).toBeDefined();
    expect(openConflicts()).toHaveLength(0);
  });

  it('afterSync swallows failures so a sync is never affected', async () => {
    jest.spyOn(service, 'reconcile').mockRejectedValue(new Error('db down'));
    await expect(service.afterSync([1], [])).resolves.toBeUndefined();
  });
});
