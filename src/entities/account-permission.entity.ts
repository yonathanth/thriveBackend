import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Admin } from './admin.entity';

/**
 * One permission granted or denied to one website account, on top of its role
 * defaults (see auth/permissions.ts). Website-owned; the desktop never sees it.
 * Created by migrations/0016_account_permissions.sql.
 */
@Entity('account_permission')
@Index('idx_account_permission_account_key', ['accountId', 'permission'], {
  unique: true,
})
export class AccountPermission {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  accountId: number;

  @ManyToOne(() => Admin, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'accountId' })
  account?: Admin;

  @Column({ type: 'varchar', length: 80 })
  permission: string;

  /** 'grant' | 'deny' */
  @Column({ type: 'varchar', length: 5 })
  effect: string;

  @Column({ type: 'int', nullable: true })
  createdBy: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
