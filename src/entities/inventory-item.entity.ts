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
 * Something the gym stocks: a product it sells (water, by the bottle or pack) or an
 * asset it owns (a treadmill). Synced from the desktop, which owns it.
 */
@Entity('inventory_item')
export class InventoryItem {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  @Index('idx_inventory_item_local_id', { unique: true })
  localId: number;

  /** 'sellable' or 'asset'. */
  @Column({ type: 'varchar', length: 20 })
  kind: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sku: string | null;

  /** The base unit every quantity is counted in, e.g. 'bottle'. */
  @Column({ type: 'varchar', length: 50 })
  unitName: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  packName: string | null;

  @Column({ type: 'int', nullable: true })
  unitsPerPack: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  packPrice: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  assetLocation: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  assetCondition: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  assetSerial: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  desktopCreatedAt: Date | null;

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
