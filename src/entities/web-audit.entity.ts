import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Key actions staff take on the website (the desktop's own audit log is synced into
 * sync_record). Only admins, managers and trainers are recorded, never members.
 */
@Entity('web_audit')
@Index('idx_web_audit_created_at', ['createdAt'])
export class WebAudit {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int', nullable: true })
  actorId: number | null;

  @Column({ type: 'varchar', length: 255 })
  actorName: string;

  @Column({ type: 'varchar', length: 50 })
  actorRole: string;

  /** What part of the website, e.g. notifications */
  @Column({ type: 'varchar', length: 50 })
  @Index('idx_web_audit_area')
  area: string;

  /** e.g. send */
  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ type: 'text' })
  summary: string;

  @Column({ type: 'jsonb', nullable: true })
  detail: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
