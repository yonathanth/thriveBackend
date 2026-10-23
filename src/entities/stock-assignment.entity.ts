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
 * Stock handed to an account, from the store ('assign') or another holder
 * ('transfer'). Pending until the recipient accepts or rejects it on the desktop.
 */
@Entity('stock_assignment')
export class StockAssignment {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  @Index('idx_stock_assignment_local_id', { unique: true })
  localId: number;

  @Column({ type: 'int' })
  itemLocalId: number;

  @Column({ type: 'varchar', length: 20 })
  kind: string;

  @Column({ type: 'int' })
  qtyBase: number;

  @Column({ type: 'int', default: 0 })
  enteredPacks: number;

  @Column({ type: 'int', default: 0 })
  enteredUnits: number;

  @Column({ type: 'int', nullable: true })
  fromUserLocalId: number | null;

  @Column({ type: 'int' })
  toUserLocalId: number;

  @Column({ type: 'int', nullable: true })
  createdByLocalId: number | null;

  /** pending | accepted | rejected | cancelled */
  @Column({ type: 'varchar', length: 20 })
  @Index('idx_stock_assignment_status')
  status: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  desktopCreatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  respondedByLocalId: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
