import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Member } from './member.entity';

@Entity('sms_message')
export class SmsMessage {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  @Index('idx_sms_message_id')
  messageId: string | null;

  @Column({ type: 'int', nullable: true })
  @Index('idx_sms_member_id')
  memberId: number | null;

  @ManyToOne(() => Member, { nullable: true })
  @JoinColumn({ name: 'memberId' })
  member: Member | null;

  @Column({ type: 'varchar', length: 50 })
  phoneNumber: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 50, default: 'queued' })
  @Index('idx_sms_status')
  status: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  campaignId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index('idx_sms_created_at')
  createdAt: Date;
}







