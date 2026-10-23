import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Member } from './member.entity';
import { Service } from './service.entity';

@Entity('potential_customer')
export class PotentialCustomer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  fullName: string;

  @Column({ type: 'varchar', length: 50 })
  phoneNumber: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  registeredAt: Date;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'pending',
  })
  status: 'pending' | 'converted' | 'ignored';

  @Column({ type: 'timestamp', nullable: true })
  convertedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  convertedToMemberId: number | null;

  @ManyToOne(() => Member, { nullable: true })
  @JoinColumn({ name: 'convertedToMemberId' })
  convertedToMember: Member | null;

  @Column({ type: 'int', nullable: true })
  serviceId: number | null;

  @ManyToOne(() => Service, { nullable: true })
  @JoinColumn({ name: 'serviceId' })
  service: Service | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'int', nullable: true })
  age: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  height: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  telegramUsername: string | null;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  objective: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

