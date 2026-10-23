import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Something to tell someone. Desk notifications (no recipient) are about the gym and
 * go to admins and managers: a payment, a member's package or start date changing,
 * memberships about to end. Personal ones go to one account of any role: a message
 * from staff, a member's membership ending, a trainer's daily client list. Read state
 * is per account (NotificationRead).
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

  /** See DESK_TYPES and PERSONAL_TYPES in notification-access.ts */
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

  /** The one account it is for; null for desk notifications (admins and managers). */
  @Column({ type: 'int', nullable: true })
  @Index('idx_notification_recipient')
  recipientId: number | null;

  /** When it happened at the gym (not when it synced). */
  @Column({ type: 'timestamptz' })
  occurredAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
