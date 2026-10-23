import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** A browser (one device) an admin allowed to receive Web Push notifications. */
@Entity('push_subscription')
export class PushSubscription {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  @Index('idx_push_subscription_admin')
  adminId: number;

  /** The push service URL; one per browser, so a browser re-subscribing replaces its row. */
  @Column({ type: 'text' })
  @Index('idx_push_subscription_endpoint', { unique: true })
  endpoint: string;

  @Column({ type: 'varchar', length: 255 })
  p256dh: string;

  @Column({ type: 'varchar', length: 255 })
  auth: string;

  /** Notification types this device wants pushed. */
  @Column({ type: 'text', array: true, default: () => "'{payment,package_changed,start_date_changed}'" })
  types: string[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  /** Consecutive failed deliveries; reset on success. */
  @Column({ type: 'int', default: 0 })
  failureCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastSuccessAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
