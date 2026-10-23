import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

/** How much of an item is in the store (no holder) or with one desktop account. */
@Entity('stock_balance')
export class StockBalance {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  @Index('idx_stock_balance_local_id', { unique: true })
  localId: number;

  @Column({ type: 'int' })
  @Index('idx_stock_balance_item')
  itemLocalId: number;

  /** Desktop app_user id; null is the store. */
  @Column({ type: 'int', nullable: true })
  holderUserLocalId: number | null;

  /** In base units. */
  @Column({ type: 'int' })
  qtyBase: number;

  @Column({ type: 'timestamptz', nullable: true })
  desktopUpdatedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
