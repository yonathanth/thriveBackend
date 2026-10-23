/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- loose repository fakes */
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { ProgressService, Viewer } from './progress.service';

const member = { id: 50, localId: 5, fullName: 'Abebe', trainerStaffLocalId: 9, gender: 'M', age: 30 };
const photo = (id: number, trainer: boolean, staff: boolean) => ({
  id,
  memberLocalId: 5,
  healthMetricId: 1,
  filePath: `progress/5/${id}.jpg`,
  thumbPath: `progress/5/${id}.thumb.jpg`,
  mimeType: 'image/jpeg',
  visibleToTrainer: trainer,
  visibleToStaff: staff,
  createdAt: new Date('2026-10-01'),
});

function setup(photos = [photo(1, false, false), photo(2, true, false), photo(3, false, true)]) {
  const repo = (rows: any[]) =>
    ({
      findOne: jest.fn(async ({ where }: any) => rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null),
      find: jest.fn(async () => rows),
      count: jest.fn(async () => 0),
      save: jest.fn(async (x: any) => ({ ...x, id: 99 })),
      create: jest.fn((x: any) => x),
    }) as unknown as Repository<any>;
  const service = new ProgressService(
    repo([member]),
    repo([{ id: 1, memberLocalId: 5, measuredAt: new Date('2026-10-01'), weight: 160 }]),
    repo([]),
    repo(photos),
    repo([]),
    repo([]),
    { get: () => mkdtempSync(path.join(tmpdir(), 'progress-')) } as unknown as ConfigService,
  );
  return service;
}

const as = (role: string, extra: Partial<Viewer> = {}) =>
  ({ id: 1, name: 'X', role, email: null, mustChangePassword: false, staffLocalId: null, memberLocalId: null, ...extra }) as Viewer;

describe('ProgressService access', () => {
  it('shows each viewer only the photos shared with them', async () => {
    const service = setup();
    const ids = async (v: Viewer, id: number | 'me') => (await service.progress(v, id)).photos.map((p) => p.id);
    expect(await ids(as('member', { memberLocalId: 5 }), 'me')).toEqual([1, 2, 3]);
    expect(await ids(as('trainer', { staffLocalId: 9 }), 50)).toEqual([2]);
    expect(await ids(as('manager'), 50)).toEqual([3]);
  });

  it('keeps trainers to their own clients and members to themselves', async () => {
    const service = setup();
    await expect(service.progress(as('trainer', { staffLocalId: 4 }), 50)).rejects.toThrow('Member not found');
    await expect(service.progress(as('member', { memberLocalId: 6 }), 'me')).rejects.toThrow('Member not found');
    await expect(service.photoFile(as('trainer', { staffLocalId: 9 }), 1, 'full')).rejects.toThrow('Photo not found');
  });

  it('accepts only real JPEG or WebP photos', async () => {
    const service = setup();
    const fake = Buffer.from('<svg>not an image</svg>').toString('base64');
    await expect(
      service.addPhoto(as('member', { memberLocalId: 5 }), {
        healthMetricId: 1,
        image: fake,
        thumb: fake,
        visibleToTrainer: false,
        visibleToStaff: false,
      }),
    ).rejects.toThrow('Only JPEG or WebP');
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
    await expect(
      service.addPhoto(as('member', { memberLocalId: 5 }), {
        healthMetricId: 1,
        image: `data:image/jpeg;base64,${jpeg}`,
        thumb: jpeg,
        visibleToTrainer: true,
        visibleToStaff: false,
      }),
    ).resolves.toEqual({ id: 99 });
  });

  it('lets only trainers and staff set the check schedule, to the offered intervals', async () => {
    const service = setup();
    await expect(service.setSchedule(as('member', { memberLocalId: 5 }), 50, 14)).rejects.toThrow();
    await expect(service.setSchedule(as('trainer', { staffLocalId: 9 }), 50, 10)).rejects.toThrow('Choose every');
  });
});
