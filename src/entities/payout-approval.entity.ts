import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * An admin's approval of one payroll payout calculated by the gym app: what was
 * actually paid, when and how. The gym app collects it, books the expense and
 * acknowledges it (recordedAt). Kept for reference; website-only, never synced.
 */
@Entity('payout_approval')
export class PayoutApproval {
  @PrimaryGeneratedColumn('increment')
  id: number;

  /** payroll_payout id in the gym app */
  @Column({ type: 'int' })
  @Index('idx_payout_approval_payout', { unique: true })
  payoutLocalId: number;

  @Column({ type: 'int' })
  @Index('idx_payout_approval_staff')
  staffLocalId: number;

  @Column({ type: 'varchar', length: 10 })
  periodStart: string;

  /** Last day of the period */
  @Column({ type: 'varchar', length: 10 })
  periodLast: string;

  /** What the gym app calculated when it was approved */
  @Column({ type: 'double precision' })
  calculatedAmount: number;

  @Column({ type: 'double precision' })
  paidAmount: number;

  @Column({ type: 'varchar', length: 10 })
  paidDate: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  paymentMethod: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'int', nullable: true })
  approvedById: number | null;

  @Column({ type: 'varchar', length: 255 })
  approvedByName: string;

  @Column({ type: 'timestamptz' })
  approvedAt: Date;

  /** When the gym app booked it; until then the approval can still be changed */
  @Column({ type: 'timestamptz', nullable: true })
  recordedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  transactionLocalId: number | null;
}
