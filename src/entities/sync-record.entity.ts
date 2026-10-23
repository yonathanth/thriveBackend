import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

/**
 * A row of a desktop table that has no dedicated entity here (add-ons, drop-ins,
 * discounts, groups, freeze and plan history, schedules, ...). The desktop sends
 * every column under its own snake_case name, so a new desktop table or column
 * reaches the cloud without an API release; only the screens that show it need
 * to know its shape.
 */
@Entity('sync_record')
@Index('idx_sync_record_entity_local_id', ['entity', 'localId'], { unique: true })
export class SyncRecord {
  @PrimaryGeneratedColumn('increment')
  id: number;

  /** Desktop table name, e.g. 'member_additional_subscription'. */
  @Column({ type: 'varchar', length: 64 })
  @Index('idx_sync_record_entity')
  entity: string;

  @Column({ type: 'int' })
  localId: number;

  /** Desktop member id when the row belongs to a member; lets member pages query by it. */
  @Column({ type: 'int', nullable: true })
  @Index('idx_sync_record_member_local_id')
  memberLocalId: number | null;

  @Column({ type: 'jsonb' })
  data: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
