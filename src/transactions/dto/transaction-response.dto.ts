import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransactionResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 5, description: 'Local ID from desktop app' })
  localId: number;

  @ApiProperty({ example: 'income' })
  transactionType: string;

  @ApiProperty({ example: 1500.00 })
  amount: number;

  @ApiProperty({ example: '2026-01-12T00:00:00.000Z' })
  transactionDate: string;

  @ApiProperty({ example: 'Monthly membership payment' })
  description: string;

  @ApiPropertyOptional({ example: 1 })
  memberId: number | null;

  @ApiPropertyOptional({ description: 'Member details if loaded' })
  member?: {
    id: number;
    fullName: string;
  };

  @ApiPropertyOptional({ example: 1 })
  serviceId: number | null;

  @ApiPropertyOptional({ description: 'Service details if loaded' })
  service?: {
    id: number;
    name: string;
  };

  @ApiProperty({ example: 'paid' })
  paymentStatus: string;

  @ApiPropertyOptional({ example: '2026-01-12T00:00:00.000Z' })
  subscriptionPeriodStart: string | null;

  @ApiPropertyOptional({ example: '2026-02-12T00:00:00.000Z' })
  subscriptionPeriodEnd: string | null;

  @ApiProperty({ example: '2026-01-12T00:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-01-12T00:00:00.000Z' })
  updatedAt: string;
}

export class TransactionWebDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 3316 })
  memberId: number;

  @ApiProperty({ example: 2200.00 })
  amount: number;

  @ApiProperty({
    example: 'income',
    enum: ['income', 'expense', 'positive_return', 'negative_return'],
    description: 'Transaction type from desktop app',
  })
  type: 'income' | 'expense' | 'positive_return' | 'negative_return';

  @ApiProperty({ example: 'Exercise' })
  category: string;

  @ApiProperty({ example: 'Renewal payment for Full Package 1 Month -Women' })
  description?: string;

  @ApiPropertyOptional({ example: 'Cash' })
  paymentMethod?: string;

  @ApiProperty({ example: 'paid', enum: ['paid', 'pending', 'cancelled', 'refunded'] })
  paymentStatus: string;

  @ApiProperty({
    example: 'membership',
    enum: ['membership', 'addon', 'drop_in', 'other'],
    description: 'What the payment was for',
  })
  source: 'membership' | 'addon' | 'drop_in' | 'other';

  @ApiPropertyOptional({ example: 'Sauna', description: 'Membership, add-on or drop-in name' })
  sourceName?: string;

  @ApiPropertyOptional({ example: 2500, description: 'Price before discount' })
  originalAmount?: number;

  @ApiPropertyOptional({ example: 300 })
  discountAmount?: number;

  @ApiPropertyOptional({ example: 'NEWYEAR' })
  discountCode?: string;

  @ApiProperty({ example: '2026-01-17T10:04:51.660Z' })
  transactionDate: string;

  @ApiPropertyOptional({
    description: 'Member details if loaded',
    example: { id: 3316, fullName: 'John Doe' },
  })
  member?: {
    id: number;
    fullName: string;
  };

  @ApiProperty({ example: '2026-01-17T10:05:33.113Z' })
  createdAt: string;

  @ApiPropertyOptional({
    description: 'Who took the payment in the desktop app, when it said (single transaction only)',
    example: { username: 'nardo', role: 'admin', auditId: 120 },
  })
  recordedBy?: { username: string; role: string | null; auditId: number | null } | null;
}

export class TransactionStatsDto {
  @ApiProperty({ example: 500, description: 'Total number of transactions' })
  total: number;

  @ApiProperty({
    example: 150000.00,
    description: 'Total inflows (income + positive_return)',
  })
  totalIncome: number;

  @ApiProperty({
    example: 25000.00,
    description: 'Total outflows (expense + negative_return)',
  })
  totalOutflows: number;

  @ApiProperty({
    example: 125000.00,
    description: 'Net profit (totalIncome - totalOutflows)',
  })
  netProfit: number;

  @ApiProperty({ example: 45000.00, description: 'Inflows this month (UTC)' })
  thisMonthIncome: number;

  @ApiProperty({ example: 8000.00, description: 'Outflows this month (UTC)' })
  thisMonthOutflows: number;

  @ApiProperty({ example: 42000.00, description: 'Inflows last month (UTC)' })
  lastMonthIncome: number;

  @ApiProperty({ example: 7500.00, description: 'Outflows last month (UTC)' })
  lastMonthOutflows: number;

  @ApiProperty({
    example: [
      { date: '2026-01-12', income: 5000, outflows: 500 },
      { date: '2026-01-11', income: 3500, outflows: 0 },
    ],
    description: 'Financial summary for the last 7 days (UTC dates)',
  })
  last7Days: { date: string; income: number; outflows: number }[];
}









