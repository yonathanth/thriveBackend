import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import {
  OutreachCandidate,
  renderOutreach,
  SmsOutreachService,
} from './sms-outreach.service';
import { SmsService } from './sms.service';

const candidate = (id: number, days = 8): OutreachCandidate => ({
  id,
  fullName: ` Abebe ${id} `,
  phoneNumber: `09${id}`,
  serviceName: 'Monthly',
  status: 'active',
  expiryDate: '2026-10-26',
  daysLeft: 3,
  days,
});

describe('renderOutreach', () => {
  it('fills the placeholders, or uses the default message', () => {
    expect(
      renderOutreach(
        'Hi {name}, {days} days on {service}',
        'absent',
        candidate(1),
      ),
    ).toBe('Hi Abebe 1, 8 days on Monthly');
    expect(
      renderOutreach(
        '{name}: ends {expiry_date}, {days_left} left',
        'expiring',
        candidate(1),
      ),
    ).toBe('Abebe 1: ends 2026-10-26, 3 left');
    expect(renderOutreach('  ', 'absent', candidate(1))).toContain(
      "haven't seen you at the gym for 8 days",
    );
    expect(renderOutreach(undefined, 'inactive', candidate(1))).toContain(
      'since your membership ended',
    );
  });
});

describe('SmsOutreachService', () => {
  function setup(rows: OutreachCandidate[]) {
    const query = jest
      .fn()
      .mockResolvedValue(rows.map((r) => ({ ...r, days: String(r.days) })));
    const sendBatch = jest.fn(async (recipients: unknown[]) => ({
      sent: recipients.length,
      failed: 0,
      firstError: null,
    }));
    const service = new SmsOutreachService(
      { query } as unknown as DataSource,
      { sendBatch } as unknown as SmsService,
      { get: () => undefined } as unknown as ConfigService,
    );
    return { service, query, sendBatch };
  }

  it('counts days in the gym timezone, with each list its own default range', async () => {
    const { service, query } = setup([candidate(1)]);
    const list = await service.candidates('absent', 7);
    expect(list[0].days).toBe(8);
    expect(query.mock.calls[0][1]).toEqual(['Africa/Addis_Ababa', 7, null]);
    await service.candidates('inactive');
    expect(query.mock.calls[1][1]).toEqual(['Africa/Addis_Ababa', 0, null]);
    await service.candidates('inactive', 3, 90);
    expect(query.mock.calls[2][1]).toEqual(['Africa/Addis_Ababa', 3, 90]);
    await service.candidates('expiring');
    expect(query.mock.calls[3][1]).toEqual(['Africa/Addis_Ababa', 0, 7]);
    await service.candidates('all');
    expect(query.mock.calls[4][1]).toEqual(['Africa/Addis_Ababa', null, null]);
    await expect(service.candidates('absent', -1)).rejects.toThrow();
    await expect(service.candidates('inactive', 90, 3)).rejects.toThrow(
      'ends before it starts',
    );
    await expect(service.candidates('nobody' as never)).rejects.toThrow(
      'kind must be one of',
    );
  });

  it('texts only chosen members still on the list, each with their own message', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => candidate(i + 1));
    const { service, sendBatch } = setup(rows);
    const result = await service.send('absent', [1, 2, 3, 999], 3, 'Hi {name}');
    expect(result).toEqual({
      sent: 3,
      failed: 0,
      firstError: null,
      skipped: 1,
    });
    expect(sendBatch.mock.calls[0][0][0]).toEqual({
      phone: '091',
      message: 'Hi Abebe 1',
      memberId: 1,
    });
  });
});
