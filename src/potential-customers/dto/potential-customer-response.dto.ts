export class PotentialCustomerResponseDto {
  id: number;
  fullName: string;
  phoneNumber: string;
  email: string | null;
  registeredAt: Date;
  status: 'pending' | 'converted' | 'ignored';
  convertedAt: Date | null;
  convertedToMemberId: number | null;
  /** The gym app's plan id */
  serviceId: number | null;
  serviceName: string | null;
  notes: string | null;
  age: number | null;
  height: string | null;
  telegramUsername: string | null;
  remark: string | null;
  objective: string | null;
  createdAt: Date;
  updatedAt: Date;
}

