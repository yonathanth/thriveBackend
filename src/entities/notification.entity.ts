import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Something that happened at the gym the admins are told about: a payment, a member's
 * package or start date changing. Created from desktop events; read state is per
 * admin (NotificationRead).
 */
@Entity('notification')
@Index('idx_notification_occurred_at', ['occurredAt'])
export class Notification {
  @PrimaryGeneratedColumn('increment')
  id: number;

  /** The desktop event's uid: the same event delivered twice is stored once. */
  @Column({ type: 'varchar', length: 64 })
  @Index('idx_notification_event_uid', { unique: true })
  eventUid: string;

  /** payment | package_changed | start_date_changed */
  @Column({ type: 'varchar', length: 40 })
  @Index('idx_notification_type')
  type: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  /** Desktop member id; the cloud member is looked up when shown, as it may sync later. */
  @Column({ type: 'int', nullable: true })
  memberLocalId: number | null;

  @Column({ type: 'int', nullable: true })
  transactionLocalId: number | null;

  /** The desktop's event data, kept for detail views and later rewording. */
  @Column({ type: 'jsonb' })
  data: Record<string, unknown>;

  /** When it happened at the gym (not when it synced). */
  @Column({ type: 'timestamptz' })
  occurredAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
