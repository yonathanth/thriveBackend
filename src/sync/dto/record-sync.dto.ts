import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** A desktop table name: lower snake_case. */
const ENTITY_NAME = /^[a-z][a-z0-9_]{0,63}$/;

/** One row of a desktop table without a dedicated entity, stored in sync_record. */
export class RecordSyncDto {
  @ApiProperty({ example: 'member_additional_subscription' })
  @Matches(ENTITY_NAME)
  entity: string;

  @ApiProperty({ example: 12, description: 'Local ID from desktop app' })
  @IsInt()
  id: number;

  @ApiProperty({
    example: { member_id: 5, additional_service_id: 2, status: 'active' },
    description: 'Every column of the desktop row, under its snake_case name',
  })
  @IsObject()
  data: Record<string, unknown>;
}

/** A desktop row that was deleted after it had been synced. */
export class DeletionSyncDto {
  @ApiProperty({ example: 40, description: 'Desktop deletion-queue id, echoed back when applied' })
  @IsInt()
  queueId: number;

  @ApiProperty({ example: 'member' })
  @Matches(ENTITY_NAME)
  entity: string;

  @ApiProperty({
    example: 5,
    description: 'Local ID of the deleted row (the cloud id for potential_customer)',
  })
  @IsInt()
  id: number;
}

/**
 * Something that happened on the desktop the admins should be told about (protocol 3).
 * Types this API does not know are acknowledged and skipped, so a newer desktop never
 * fails a sync by sending one.
 */
export class EventSyncDto {
  @ApiProperty({ example: '9f86d081884c7d659a2feaa0c55ad015', description: 'Random id; the same event is stored once' })
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  uid: string;

  @ApiProperty({ example: 'payment', description: 'payment | package_changed | start_date_changed' })
  @Matches(/^[a-z_]{1,40}$/)
  type: string;

  @ApiProperty({ example: 9, required: false, description: 'Desktop member id' })
  @IsOptional()
  @IsInt()
  memberId?: number | null;

  @ApiProperty({ example: 120, required: false, description: 'Desktop transaction id' })
  @IsOptional()
  @IsInt()
  transactionId?: number | null;

  @ApiProperty({ example: '2026-10-08T09:00:00Z' })
  @IsString()
  @MaxLength(40)
  occurredAt: string;

  @ApiProperty({ example: { member_name: 'Abebe', amount: 1000 } })
  @IsObject()
  data: Record<string, unknown>;
}

/** What the desktop did with a lead it pulled from the website. */
export class ProspectStatusSyncDto {
  @ApiProperty({ example: 7, description: 'potential_customer.id in the cloud' })
  @IsInt()
  cloudId: number;

  @ApiProperty({ example: 'converted', enum: ['pending', 'converted', 'ignored'] })
  @IsIn(['pending', 'converted', 'ignored'])
  status: 'pending' | 'converted' | 'ignored';

  @ApiProperty({ example: 31, required: false, description: 'Desktop member id it became' })
  @IsOptional()
  @IsInt()
  convertedToMemberId?: number | null;
}
