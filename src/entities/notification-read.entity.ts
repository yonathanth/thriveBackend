import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Notification } from './notification.entity';

/** That one admin has read one notification. */
@Entity('notification_read')
@Index('idx_notification_read_unique', ['notificationId', 'adminId'], { unique: true })
export class NotificationRead {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @ManyToOne(() => Notification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notificationId' })
  notification: Notification;

  @Column({ type: 'int' })
  notificationId: number;

  @Column({ type: 'int' })
  @Index('idx_notification_read_admin')
  adminId: number;

  @CreateDateColumn({ type: 'timestamptz' })
  readAt: Date;
}
