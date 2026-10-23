import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * A photo a member attached to one of their measurements. The member decides who
 * besides themselves may see it. Files live under UPLOAD_DIR, never public.
 */
@Entity('progress_photo')
export class ProgressPhoto {
  @PrimaryGeneratedColumn('increment')
  id: number;

  /** Desktop member id */
  @Column({ type: 'int' })
  @Index('idx_progress_photo_member')
  memberLocalId: number;

  /** Website health_metric id the photo belongs to */
  @Column({ type: 'int' })
  @Index('idx_progress_photo_metric')
  healthMetricId: number;

  /** Paths relative to UPLOAD_DIR */
  @Column({ type: 'varchar', length: 255 })
  filePath: string;

  @Column({ type: 'varchar', length: 255 })
  thumbPath: string;

  @Column({ type: 'varchar', length: 40 })
  mimeType: string;

  @Column({ type: 'int' })
  sizeBytes: number;

  /** Their currently assigned trainer may see it */
  @Column({ type: 'boolean', default: false })
  visibleToTrainer: boolean;

  /** Admins and managers may see it */
  @Column({ type: 'boolean', default: false })
  visibleToStaff: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/** A member's target for one measurement, in the units shown (kg for masses). */
@Entity('progress_goal')
@Index('idx_progress_goal_member_metric', ['memberLocalId', 'metric'], { unique: true })
export class ProgressGoal {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  memberLocalId: number;

  @Column({ type: 'varchar', length: 40 })
  metric: string;

  @Column({ type: 'double precision' })
  target: number;

  @Column({ type: 'int', nullable: true })
  setById: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  setByName: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** How often a member should come for a progress check, set by their trainer or staff. */
@Entity('progress_schedule')
export class ProgressSchedule {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int', unique: true })
  memberLocalId: number;

  @Column({ type: 'int' })
  intervalDays: number;

  @Column({ type: 'int', nullable: true })
  setById: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  setByName: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
