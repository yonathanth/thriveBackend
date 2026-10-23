import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Every website login: admins, managers, trainers and members. The table keeps its
 * original name so existing admin rows, notification read-state and push
 * subscriptions (keyed by admin id) keep working.
 *
 * Website-owned: sync never writes here. Manager, trainer and member accounts are
 * provisioned from synced staff and members and linked by their desktop ids;
 * admins are website-only and never linked to desktop records.
 */
@Entity('admin')
export class Admin {
  @PrimaryGeneratedColumn('increment')
  id: number;

  /** Set for admins who sign in by email; phone-only accounts leave it empty. */
  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  @Index('idx_admin_email', { unique: true })
  email: string | null;

  /** bcrypt hash. */
  @Column({ type: 'varchar', length: 255 })
  password: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** admin | manager | trainer | member */
  @Column({ type: 'varchar', length: 50, default: 'admin' })
  role: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  /** Login phone, normalised to +2519XXXXXXXX / +2517XXXXXXXX. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  @Index('idx_admin_phone', { unique: true, where: '"phone" IS NOT NULL' })
  phone: string | null;

  /** Linked desktop staff (managers, trainers). */
  @Column({ type: 'int', nullable: true })
  @Index('idx_admin_staff_local_id', { unique: true, where: '"staffLocalId" IS NOT NULL' })
  staffLocalId: number | null;

  /** Linked desktop member. */
  @Column({ type: 'int', nullable: true })
  @Index('idx_admin_member_local_id', { unique: true, where: '"memberLocalId" IS NOT NULL' })
  memberLocalId: number | null;

  /** The password is a temporary one (default or set by another admin) and must be replaced. */
  @Column({ type: 'boolean', default: false })
  mustChangePassword: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  passwordChangedAt: Date | null;

  /** Bumped on password change/reset or deactivation; older tokens stop working. */
  @Column({ type: 'int', default: 0 })
  tokenVersion: number;

  @Column({ type: 'int', default: 0 })
  failedLoginAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  /** web (created on the website) | desktop_sync (provisioned from synced data) */
  @Column({ type: 'varchar', length: 20, default: 'web' })
  source: string;

  @Column({ type: 'int', nullable: true })
  createdById: number | null;

  /** Why sync turned the account off (deleted, suspended, ...); null when an admin did. */
  @Column({ type: 'varchar', length: 50, nullable: true })
  deactivatedReason: string | null;

  /** Website-only contact details the account holder may edit. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  contactEmail: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  telegramUsername: string | null;
}
