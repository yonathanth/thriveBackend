import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

@Entity('staff')
export class Staff {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int', unique: true, nullable: false })
  @Index('idx_staff_local_id', { unique: true })
  localId: number;

  @Column({ type: 'varchar', length: 255 })
  fullName: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phoneNumber: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  role: string | null;

  /** active | suspended | terminated */
  @Column({ type: 'varchar', length: 20, nullable: true })
  status: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  accessValidTo: Date | null;

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
