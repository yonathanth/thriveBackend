import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

/** One line of the desktop's stock ledger. Rows are only ever added there. */
@Entity('stock_movement')
export class StockMovement {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  @Index('idx_stock_movement_local_id', { unique: true })
  localId: number;

  @Column({ type: 'int' })
  @Index('idx_stock_movement_item')
  itemLocalId: number;

  @Column({ type: 'varchar', length: 30 })
  type: string;

  @Column({ type: 'int' })
  qtyBase: number;

  /** 'outside' | 'store' | 'pending' | 'holder' | 'sold' */
  @Column({ type: 'varchar', length: 20 })
  fromBucket: string;

  @Column({ type: 'int', nullable: true })
  fromUserLocalId: number | null;

  @Column({ type: 'varchar', length: 20 })
  toBucket: string;

  @Column({ type: 'int', nullable: true })
  toUserLocalId: number | null;

  @Column({ type: 'int', nullable: true })
  assignmentLocalId: number | null;

  @Column({ type: 'int', nullable: true })
  countLocalId: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  unitPrice: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amount: number | null;

  @Column({ type: 'int', nullable: true })
  transactionLocalId: number | null;

  @Column({ type: 'int', nullable: true })
  actorUserLocalId: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  actorUsername: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  @Index('idx_stock_movement_at')
  desktopCreatedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
