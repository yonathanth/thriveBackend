import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

@Entity('service')
export class Service {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int', unique: true, nullable: false })
  @Index('idx_service_local_id', { unique: true })
  localId: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'int' })
  period: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'varchar', length: 100 })
  category: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', nullable: true })
  maxUsageCount: number | null;

  @Column({ type: 'varchar', length: 50 })
  usageType: string;

  @Column({ type: 'varchar', length: 50 })
  status: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  color: string | null;

  @Column({ type: 'int', nullable: true })
  freezeMaxDays: number | null;

  @Column({ type: 'int', nullable: true })
  freezeMinDays: number | null;

  @Column({ type: 'int', nullable: true })
  freezeMaxCount: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  freezeRuleMode: string | null;

  /** Set for group plans: how many members share one subscription. */
  @Column({ type: 'int', nullable: true })
  groupSize: number | null;

  @Column({ type: 'text', nullable: true })
  groupPricing: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  /** Set when the desktop deleted the record; TypeORM hides these rows from every query. */
  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}




