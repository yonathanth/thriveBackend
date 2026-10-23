import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

/**
 * A holder's report of what they had left. What they held less what is left is what
 * they sold; the money is the income transaction whose stockCountLocalId points here.
 */
@Entity('stock_count')
export class StockCount {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  @Index('idx_stock_count_local_id', { unique: true })
  localId: number;

  @Column({ type: 'int' })
  @Index('idx_stock_count_item')
  itemLocalId: number;

  @Column({ type: 'int' })
  holderUserLocalId: number;

  @Column({ type: 'int' })
  expectedQtyBase: number;

  @Column({ type: 'int' })
  remainingQtyBase: number;

  @Column({ type: 'int' })
  soldQtyBase: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  packPrice: number | null;

  @Column({ type: 'int', nullable: true })
  unitsPerPack: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  amount: number;

  @Column({ type: 'int', nullable: true })
  paymentMethodLocalId: number | null;

  @Column({ type: 'int', nullable: true })
  @Index('idx_stock_count_transaction')
  transactionLocalId: number | null;

  @Column({ type: 'int', nullable: true })
  reportedByLocalId: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  @Index('idx_stock_count_reported_at')
  desktopCreatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  voidedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  voidedByLocalId: number | null;

  @Column({ type: 'text', nullable: true })
  voidReason: string | null;

  @Column({ type: 'int', nullable: true })
  @Index('idx_stock_count_void_transaction')
  voidTransactionLocalId: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
