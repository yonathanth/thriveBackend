import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A share of revenue on top of a staff member's base pay, set by admins on the
 * website: payments from members assigned to them, add-ons they train, drop-ins they
 * ran, or every payment for one plan, add-on or drop-in. A percentage of each payment
 * or a fixed amount per payment.
 */
@Entity('staff_revenue_share')
export class StaffRevenueShare {
  @PrimaryGeneratedColumn('increment')
  id: number;

  /** Desktop staff id */
  @Column({ type: 'int' })
  @Index('idx_staff_revenue_share_staff')
  staffLocalId: number;

  /** assigned_members | addon_trainer | drop_in_instructor | service */
  @Column({ type: 'varchar', length: 30 })
  scope: string;

  /** plan | addon | drop_in, with targetLocalId: one plan, add-on or drop-in only */
  @Column({ type: 'varchar', length: 10, nullable: true })
  targetKind: string | null;

  /** Desktop id of the plan (service), add-on or drop-in */
  @Column({ type: 'int', nullable: true })
  targetLocalId: number | null;

  /** percent | fixed (per payment) */
  @Column({ type: 'varchar', length: 10 })
  rateType: string;

  @Column({ type: 'double precision' })
  rate: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
