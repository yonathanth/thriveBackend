import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One pay period of one member of staff, calculated on the website from synced
 * attendance and payments. 'building' while the period runs and 'due' once it ends
 * (both recalculated, so payments the gym app syncs late still count); 'paid' once an
 * admin marks it paid, its figures then frozen. The gym app collects paid payouts and
 * books them as expenses, which sync back as ordinary transactions.
 */
@Entity('staff_payout')
@Index('idx_staff_payout_period', ['staffLocalId', 'periodStart'], {
  unique: true,
})
export class StaffPayout {
  @PrimaryGeneratedColumn('increment')
  id: number;

  /** Desktop staff id */
  @Column({ type: 'int' })
  @Index('idx_staff_payout_staff')
  staffLocalId: number;

  /** First day, YYYY-MM-DD */
  @Column({ type: 'varchar', length: 10 })
  periodStart: string;

  /** The day after the last day, YYYY-MM-DD */
  @Column({ type: 'varchar', length: 10 })
  periodEnd: string;

  /** building | due | paid */
  @Column({ type: 'varchar', length: 10 })
  @Index('idx_staff_payout_status')
  status: string;

  @Column({ type: 'double precision', default: 0 })
  calculatedAmount: number;

  /** [{ kind, label, amount, detail? }] */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  lines: unknown[];

  @Column({ type: 'timestamptz', nullable: true })
  computedAt: Date | null;

  @Column({ type: 'double precision', nullable: true })
  paidAmount: number | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  paidDate: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  paymentMethod: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'int', nullable: true })
  paidById: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  paidByName: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  /** Bumped whenever the payment is recorded, changed or undone */
  @Column({ type: 'int', default: 0 })
  revision: number;

  /** The revision the gym app last collected; behind revision means it has news */
  @Column({ type: 'int', nullable: true })
  collectedRevision: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
