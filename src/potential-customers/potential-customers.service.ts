import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PotentialCustomer } from '../entities/potential-customer.entity';
import { Service } from '../entities/service.entity';
import { CreatePotentialCustomerDto } from './dto/create-potential-customer.dto';
import { PotentialCustomerResponseDto } from './dto/potential-customer-response.dto';

@Injectable()
export class PotentialCustomersService {
  constructor(
    @InjectRepository(PotentialCustomer)
    private readonly potentialCustomerRepository: Repository<PotentialCustomer>,
    @InjectRepository(Service)
    private readonly serviceRepository: Repository<Service>,
  ) {}

  /**
   * The website sends the gym app's plan id (what the public catalog lists); the
   * column refers to this database's service row. Unknown ids are left empty.
   */
  private async serviceRowId(localId: number | undefined): Promise<number | null> {
    if (!localId) return null;
    const service = await this.serviceRepository.findOne({ where: { localId } });
    return service?.id ?? null;
  }

  async create(
    createDto: CreatePotentialCustomerDto,
  ): Promise<PotentialCustomerResponseDto> {
    const potentialCustomer = this.potentialCustomerRepository.create({
      fullName: createDto.fullName,
      phoneNumber: createDto.phoneNumber,
      email: createDto.email || null,
      serviceId: await this.serviceRowId(createDto.serviceId),
      notes: createDto.notes || null,
      age: createDto.age ?? null,
      height: createDto.height || null,
      telegramUsername: createDto.telegramUsername || null,
      remark: createDto.remark || null,
      objective: createDto.objective || null,
      status: 'pending',
    });

    const saved = await this.potentialCustomerRepository.save(potentialCustomer);
    const withPlan = await this.potentialCustomerRepository.findOne({
      where: { id: saved.id },
      relations: ['service'],
    });
    return this.toResponseDto(withPlan ?? saved);
  }

  async findAll(
    status?: 'pending' | 'converted' | 'ignored',
    limit?: number,
    offset?: number,
  ): Promise<{ data: PotentialCustomerResponseDto[]; total: number }> {
    const queryBuilder = this.potentialCustomerRepository
      .createQueryBuilder('pc')
      .leftJoinAndSelect('pc.service', 'service');

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
      relations: ['service'],
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
      // The gym app's plan id, which is what it and the website's catalog use.
      serviceId: potentialCustomer.service?.localId ?? null,
      serviceName: potentialCustomer.service?.name ?? null,
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

