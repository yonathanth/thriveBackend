import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * How one member of staff is paid, set by admins on the website (never synced from
 * the gym app): a base per pay period or per day checked in, optionally reduced for
 * expected work days they were absent. Periods start on cycleStart and repeat
 * monthly on that day of the month, or every cycleDays days.
 */
@Entity('staff_pay_setup')
export class StaffPaySetup {
  @PrimaryGeneratedColumn('increment')
  id: number;

  /** Desktop staff id */
  @Column({ type: 'int' })
  @Index('idx_staff_pay_setup_staff', { unique: true })
  staffLocalId: number;

  /** none | monthly | daily */
  @Column({ type: 'varchar', length: 10, default: 'none' })
  baseType: string;

  @Column({ type: 'double precision', default: 0 })
  baseAmount: number;

  /** monthly | days */
  @Column({ type: 'varchar', length: 10, default: 'monthly' })
  cycle: string;

  @Column({ type: 'int', default: 30 })
  cycleDays: number;

  /** First day of the first pay period, YYYY-MM-DD */
  @Column({ type: 'varchar', length: 10 })
  cycleStart: string;

  @Column({ type: 'boolean', default: false })
  deductAbsence: boolean;

  /** ISO weekdays (1 = Monday) they are expected at work */
  @Column({ type: 'int', array: true, default: '{1,2,3,4,5,6}' })
  workDays: number[];

  /** Off payroll: no new periods are calculated */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  updatedByName: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
