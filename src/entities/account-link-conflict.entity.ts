import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A synced member or staff record that could not be given a login automatically,
 * left for an admin to sort out instead of guessing.
 */
@Entity('account_link_conflict')
@Index(
  'idx_account_link_conflict_key',
  ['kind', 'sourceType', 'sourceLocalId'],
  { unique: true },
)
export class AccountLinkConflict {
  @PrimaryGeneratedColumn('increment')
  id: number;

  /** shared_phone | admin_phone | phone_taken | invalid_phone */
  @Column({ type: 'varchar', length: 30 })
  kind: string;

  /** member | staff */
  @Column({ type: 'varchar', length: 10 })
  sourceType: string;

  @Column({ type: 'int' })
  sourceLocalId: number;

  /** Phone as the desktop sent it. */
  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  detail: string | null;

  /** open | resolved */
  @Column({ type: 'varchar', length: 20, default: 'open' })
  @Index('idx_account_link_conflict_status')
  status: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
