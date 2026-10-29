import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A renewal a member paid for online through SantimPay. The money is taken here, but
 * the membership is not touched: the gym app collects paid ones into an inbox where
 * staff apply them (starting the period) or reject them (refunded by hand), and
 * report that decision back.
 *
 * initiated -> paid | failed | cancelled          (SantimPay, confirmed by status API)
 * paid      -> applied | rejected -> refunded     (staff, in the gym app)
 *
 * KEEP THESE ROWS. Never add a job that deletes or prunes them, failed attempts
 * included: the SantimPay agreement (§12.1) requires transaction records to be kept for
 * at least a year and produced on request. Old rows are cheap; a missing one in a dispute
 * is not.
 */
@Entity('online_payment')
export class OnlinePayment {
  @PrimaryGeneratedColumn('increment')
  id: number;

  /** Our id sent to SantimPay as the transaction id; unique per attempt */
  @Column({ type: 'varchar', length: 64, unique: true })
  reference: string;

  /** Desktop member id */
  @Column({ type: 'int' })
  @Index('idx_online_payment_member')
  memberLocalId: number;

  @Column({ type: 'varchar', length: 255 })
  memberName: string;

  /** Desktop plan id the member chose to renew onto */
  @Column({ type: 'int' })
  serviceLocalId: number;

  @Column({ type: 'varchar', length: 255 })
  serviceName: string;

  /** Plan length in days, as priced */
  @Column({ type: 'int' })
  servicePeriod: number;

  /** What was charged: the plan's price when the member started paying */
  @Column({ type: 'double precision' })
  amount: number;

  /** initiated | paid | failed | cancelled | applied | rejected | refunded */
  @Column({ type: 'varchar', length: 20 })
  @Index('idx_online_payment_status')
  status: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phoneNumber: string | null;

  /** SantimPay's own transaction id */
  @Column({ type: 'varchar', length: 64, nullable: true })
  providerTxnId: string | null;

  /** Telebirr, CBE Birr, ... as SantimPay reports it */
  @Column({ type: 'varchar', length: 100, nullable: true })
  paidVia: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  /** Last message from SantimPay or from the gym app's decision */
  @Column({ type: 'text', nullable: true })
  note: string | null;

  /** Who applied or rejected it in the gym app */
  @Column({ type: 'varchar', length: 255, nullable: true })
  decidedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  /** Set once the gym app has stored the paid payment */
  @Column({ type: 'timestamptz', nullable: true })
  collectedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
