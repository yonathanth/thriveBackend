import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
} from 'class-validator';

export class TransactionSyncDto {
  @IsNotEmpty()
  @IsInt()
  id: number; // localId from SQLite

  @IsNotEmpty()
  @IsString()
  transactionType: string;

  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @IsNotEmpty()
  @IsDateString()
  transactionDate: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsOptional()
  @IsInt()
  memberId?: number | null;

  @IsOptional()
  @IsInt()
  serviceId?: number | null;

  @IsOptional()
  @IsInt()
  paymentMethodId?: number | null;

  @IsOptional()
  @IsInt()
  incomeCategoryId?: number | null;

  @IsNotEmpty()
  @IsString()
  paymentStatus: string;

  @IsOptional()
  @IsDateString()
  subscriptionPeriodStart?: string | null;

  @IsOptional()
  @IsDateString()
  subscriptionPeriodEnd?: string | null;

  @IsOptional()
  @IsInt()
  expenseCategoryId?: number | null;

  @IsOptional()
  @IsString()
  vendor?: string | null;

  @IsOptional()
  @IsString()
  receiptUrl?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsInt()
  referenceTransactionId?: number | null;

  @IsOptional()
  @IsNumber()
  originalAmount?: number | null;

  @IsOptional()
  @IsNumber()
  discountAmount?: number | null;

  @IsOptional()
  @IsInt()
  discountId?: number | null;

  @IsOptional()
  @IsString()
  discountCode?: string | null;

  @IsOptional()
  @IsInt()
  additionalServiceId?: number | null;

  @IsOptional()
  @IsInt()
  usageServiceId?: number | null;

  @IsOptional()
  @IsInt()
  memberGroupId?: number | null;
}




