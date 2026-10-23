import { IsNotEmpty, IsString, IsEmail, IsOptional, MaxLength, IsNumber, IsInt, Min, Max } from 'class-validator';

export class CreatePotentialCustomerDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  fullName: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  phoneNumber: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsNumber()
  @IsInt()
  serviceId?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  age?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  height?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  telegramUsername?: string;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  objective?: string;
}

