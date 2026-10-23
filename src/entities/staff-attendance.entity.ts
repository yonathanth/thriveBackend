import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Staff } from './staff.entity';

@Entity('staff_attendance')
export class StaffAttendance {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int', unique: true, nullable: false })
  @Index('idx_staff_attendance_local_id', { unique: true })
  localId: number;

  @Column({ type: 'int' })
  staffLocalId: number;

  @ManyToOne(() => Staff, { nullable: false })
  @JoinColumn({ name: 'staffId' })
  staff: Staff;

  @Column({ type: 'int' })
  @Index('idx_staff_attendance_staff_id')
  staffId: number;

  @Column({ type: 'timestamptz' })
  @Index('idx_staff_attendance_scanned_at')
  scannedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  /** Set when the desktop deleted the record; TypeORM hides these rows from every query. */
  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
