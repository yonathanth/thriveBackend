import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PotentialCustomer } from '../entities/potential-customer.entity';
import { CreatePotentialCustomerDto } from './dto/create-potential-customer.dto';
import { PotentialCustomerResponseDto } from './dto/potential-customer-response.dto';

@Injectable()
export class PotentialCustomersService {
  constructor(
    @InjectRepository(PotentialCustomer)
    private readonly potentialCustomerRepository: Repository<PotentialCustomer>,
  ) {}

  async create(
    createDto: CreatePotentialCustomerDto,
  ): Promise<PotentialCustomerResponseDto> {
    const potentialCustomer = this.potentialCustomerRepository.create({
      fullName: createDto.fullName,
      phoneNumber: createDto.phoneNumber,
      email: createDto.email || null,
      serviceId: createDto.serviceId || null,
      notes: createDto.notes || null,
      age: createDto.age ?? null,
      height: createDto.height || null,
      telegramUsername: createDto.telegramUsername || null,
      remark: createDto.remark || null,
      objective: createDto.objective || null,
      status: 'pending',
    });

    const saved = await this.potentialCustomerRepository.save(potentialCustomer);
    return this.toResponseDto(saved);
  }

  async findAll(
    status?: 'pending' | 'converted' | 'ignored',
    limit?: number,
    offset?: number,
  ): Promise<{ data: PotentialCustomerResponseDto[]; total: number }> {
    const queryBuilder = this.potentialCustomerRepository.createQueryBuilder('pc');

    if (status) {
      queryBuilder.where('pc.status = :status', { status });
    }

    const total = await queryBuilder.getCount();

    if (limit !== undefined) {
      queryBuilder.limit(limit);
    }
    if (offset !== undefined) {
      queryBuilder.offset(offset);
    }

    queryBuilder.orderBy('pc.registeredAt', 'DESC');

    const potentialCustomers = await queryBuilder.getMany();
    return {
      data: potentialCustomers.map((pc) => this.toResponseDto(pc)),
      total,
    };
  }

  async findUnconverted(
    limit?: number,
    offset?: number,
  ): Promise<{ data: PotentialCustomerResponseDto[]; total: number }> {
    return this.findAll('pending', limit, offset);
  }

  async markAsConverted(
    id: number,
    memberId: number,
  ): Promise<PotentialCustomerResponseDto> {
    const potentialCustomer = await this.potentialCustomerRepository.findOne({
      where: { id },
    });

    if (!potentialCustomer) {
      throw new NotFoundException(`Potential customer with ID ${id} not found`);
    }

    potentialCustomer.status = 'converted';
    potentialCustomer.convertedAt = new Date();
    potentialCustomer.convertedToMemberId = memberId;

    const saved = await this.potentialCustomerRepository.save(potentialCustomer);
    return this.toResponseDto(saved);
  }

  private toResponseDto(
    potentialCustomer: PotentialCustomer,
  ): PotentialCustomerResponseDto {
    return {
      id: potentialCustomer.id,
      fullName: potentialCustomer.fullName,
      phoneNumber: potentialCustomer.phoneNumber,
      email: potentialCustomer.email,
      registeredAt: potentialCustomer.registeredAt,
      status: potentialCustomer.status,
      convertedAt: potentialCustomer.convertedAt,
      convertedToMemberId: potentialCustomer.convertedToMemberId,
      serviceId: potentialCustomer.serviceId,
      notes: potentialCustomer.notes,
      age: potentialCustomer.age,
      height: potentialCustomer.height,
      telegramUsername: potentialCustomer.telegramUsername,
      remark: potentialCustomer.remark,
      objective: potentialCustomer.objective,
      createdAt: potentialCustomer.createdAt,
      updatedAt: potentialCustomer.updatedAt,
    };
  }
}

