import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Website account actions (resets, admin creation, (de)activation). Website-owned and
 * separate from the desktop's synced audit_log.
 */
@Entity('account_audit')
export class AccountAudit {
  @PrimaryGeneratedColumn('increment')
  id: number;

  /** Account that acted; null for the system (sync provisioning). */
  @Column({ type: 'int', nullable: true })
  @Index('idx_account_audit_actor')
  actorId: number | null;

  /** password_reset | password_changed | admin_created | activated | deactivated | provisioned | login_locked */
  @Column({ type: 'varchar', length: 40 })
  action: string;

  @Column({ type: 'int', nullable: true })
  @Index('idx_account_audit_target')
  targetId: number | null;

  @Column({ type: 'jsonb', nullable: true })
  detail: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
