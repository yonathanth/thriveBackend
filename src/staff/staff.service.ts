import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Staff } from '../entities/staff.entity';
import { StaffAttendance } from '../entities/staff-attendance.entity';
import { StaffQueryDto } from './dto/staff-query.dto';
import { PaginatedResponseDto, createPaginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(Staff)
    private staffRepository: Repository<Staff>,
    @InjectRepository(StaffAttendance)
    private staffAttendanceRepository: Repository<StaffAttendance>,
  ) {}

  async findAll(query: StaffQueryDto): Promise<PaginatedResponseDto<Staff>> {
    const { page = 1, limit = 20, search } = query;
    const qb = this.staffRepository.createQueryBuilder('staff');
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        '(staff.fullName ILIKE :term OR staff.phoneNumber ILIKE :term OR staff.role ILIKE :term)',
        { term },
      );
    }
    qb.orderBy('staff.fullName', 'ASC');
    const total = await qb.getCount();
    const data = await qb.skip((page - 1) * limit).take(limit).getMany();
    return createPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number): Promise<Staff | null> {
    return this.staffRepository.findOne({ where: { id } });
  }

  async findAttendanceByStaff(
    staffId: number,
    fromDate: string,
    toDate: string,
  ): Promise<StaffAttendance[]> {
    const staff = await this.staffRepository.findOne({ where: { id: staffId } });
    if (!staff) return [];
    const from = new Date(fromDate);
    const to = new Date(toDate);
    to.setUTCHours(23, 59, 59, 999);
    return this.staffAttendanceRepository.find({
      where: {
        staffId,
        scannedAt: Between(from, to),
      },
      relations: ['staff'],
      order: { scannedAt: 'ASC' },
    });
  }

  async findByDate(date: string): Promise<StaffAttendance[]> {
    const dateObj = new Date(date);
    const dateStart = new Date(Date.UTC(
      dateObj.getUTCFullYear(),
      dateObj.getUTCMonth(),
      dateObj.getUTCDate(),
      0, 0, 0, 0,
    ));
    const dateEnd = new Date(Date.UTC(
      dateObj.getUTCFullYear(),
      dateObj.getUTCMonth(),
      dateObj.getUTCDate(),
      23, 59, 59, 999,
    ));
    return this.staffAttendanceRepository.find({
      where: {
        scannedAt: Between(dateStart, dateEnd),
      },
      relations: ['staff'],
      order: { scannedAt: 'ASC' },
    });
  }
}
