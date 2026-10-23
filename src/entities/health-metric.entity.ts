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

@Entity('health_metric')
export class HealthMetric {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int', unique: true, nullable: false })
  @Index('idx_health_metric_local_id', { unique: true })
  localId: number;

  @Column({ type: 'int', nullable: true })
  memberLocalId: number | null;

  @ManyToOne(() => Member, { nullable: true })
  @JoinColumn({ name: 'memberId' })
  member: Member | null;

  @Column({ type: 'int', nullable: true })
  @Index('idx_health_metric_member_id')
  memberId: number | null;

  @Column({ type: 'timestamptz' })
  measuredAt: Date;

  // Core metrics
  @Column({ type: 'float', nullable: true })
  weight: number | null;

  @Column({ type: 'float', nullable: true })
  bmi: number | null;

  @Column({ type: 'float', nullable: true })
  bodyFatPercent: number | null;

  @Column({ type: 'int', nullable: true })
  heartRate: number | null;

  // Body composition
  @Column({ type: 'float', nullable: true })
  muscleMass: number | null;

  @Column({ type: 'float', nullable: true })
  leanBodyMass: number | null;

  @Column({ type: 'float', nullable: true })
  boneMass: number | null;

  @Column({ type: 'float', nullable: true })
  skeletalMuscleMass: number | null;

  @Column({ type: 'int', nullable: true })
  visceralFat: number | null;

  @Column({ type: 'float', nullable: true })
  subcutaneousFatPercent: number | null;

  @Column({ type: 'float', nullable: true })
  proteinPercent: number | null;

  // Metabolic and other
  @Column({ type: 'int', nullable: true })
  bmr: number | null;

  @Column({ type: 'int', nullable: true })
  bodyAge: number | null;

  @Column({ type: 'text', nullable: true })
  bodyType: string | null;

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




