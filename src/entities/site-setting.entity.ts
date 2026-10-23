import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** A website-only setting, by key. Never synced from or to the desktop. */
@Entity('site_setting')
export class SiteSetting {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'text', nullable: true })
  value: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
