/* eslint-disable @typescript-eslint/no-unsafe-argument -- partial service fakes */
import { NotFoundException } from '@nestjs/common';
import { PortalService } from './portal.service';
import type { AuthUser } from '../auth/roles.guard';

const trainer: AuthUser = {
  id: 7,
  email: null,
  name: 'T',
  role: 'trainer',
  mustChangePassword: false,
  staffLocalId: 42,
  memberLocalId: null,
};

describe('PortalService scoping', () => {
  const members = { findOne: jest.fn() };
  const service = new PortalService(
    members as any,
    { findAndCount: jest.fn().mockResolvedValue([[], 0]) } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => members.findOne.mockReset());

  it('looks members up only among the trainer’s own assignments', async () => {
    members.findOne.mockResolvedValue({ id: 5 });
    await service.assignedMemberAttendance(trainer, 5, {});
    expect(members.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5, trainerStaffLocalId: 42 } }),
    );
  });

  it('answers 404 for a member assigned to someone else', async () => {
    members.findOne.mockResolvedValue(null);
    await expect(service.assignedMember(trainer, 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses trainer data to an account with no staff link', async () => {
    await expect(
      service.todayCheckIns({ ...trainer, staffLocalId: null }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('loads a member’s own membership by the account link only', async () => {
    members.findOne.mockResolvedValue(null);
    await expect(
      service.myAttendance(
        { ...trainer, role: 'member', staffLocalId: null, memberLocalId: 3 },
        {},
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(members.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { localId: 3 } }),
    );
  });
});
