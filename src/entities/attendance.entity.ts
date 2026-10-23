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
import { Member } from './member.entity';

@Entity('attendance')
export class Attendance {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int', unique: true, nullable: false })
  @Index('idx_attendance_local_id', { unique: true })
  localId: number;

  @Column({ type: 'int' })
  memberLocalId: number;

  @ManyToOne(() => Member, { nullable: false })
  @JoinColumn({ name: 'memberId' })
  member: Member;

  @Column({ type: 'int' })
  @Index('idx_attendance_member_id')
  memberId: number;

  @Column({ type: 'timestamptz' })
  @Index('idx_attendance_date')
  date: Date;

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




