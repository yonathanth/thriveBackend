import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { renderOutreach, SmsOutreachService } from './sms-outreach.service';
import { SmsService } from './sms.service';

const candidate = (id: number, days = 8) => ({
  id,
  fullName: ` Abebe ${id} `,
  phoneNumber: `09${id}`,
  serviceName: 'Monthly',
  days,
});

describe('renderOutreach', () => {
  it('fills the placeholders, or uses the default message', () => {
    expect(renderOutreach('Hi {name}, {days} days on {service}', 'absent', candidate(1))).toBe(
      'Hi Abebe 1, 8 days on Monthly',
    );
    expect(renderOutreach('  ', 'absent', candidate(1))).toContain("haven't seen you at the gym for 8 days");
    expect(renderOutreach(undefined, 'inactive', candidate(1))).toContain('since your membership ended');
  });
});

describe('SmsOutreachService', () => {
  function setup(rows: ReturnType<typeof candidate>[]) {
    const query = jest.fn().mockResolvedValue(rows.map(r => ({ ...r, days: String(r.days) })));
    const sendPersonalizedBulk = jest.fn(async (recipients: unknown[], _campaign?: string) => ({ campaignId: 'c1', count: recipients.length }));
    const service = new SmsOutreachService(
      { query } as unknown as DataSource,
      { sendPersonalizedBulk } as unknown as SmsService,
      { get: () => undefined } as unknown as ConfigService,
    );
    return { service, query, sendPersonalizedBulk };
  }

  it('counts days in the gym timezone and from the given threshold', async () => {
    const { service, query } = setup([candidate(1)]);
    const list = await service.candidates('absent', 7);
    expect(list[0].days).toBe(8);
    expect(query.mock.calls[0][1]).toEqual(['Africa/Addis_Ababa', 7, null]);
    await service.candidates('inactive');
    expect(query.mock.calls[1][1]).toEqual(['Africa/Addis_Ababa', 0, null]);
    await service.candidates('inactive', 3, 90);
    expect(query.mock.calls[2][1]).toEqual(['Africa/Addis_Ababa', 3, 90]);
    await expect(service.candidates('absent', -1)).rejects.toThrow();
    await expect(service.candidates('inactive', 90, 3)).rejects.toThrow('ends before it starts');
  });

  it('texts only chosen members still on the list, in batches', async () => {
    const rows = Array.from({ length: 150 }, (_, i) => candidate(i + 1));
    const { service, sendPersonalizedBulk } = setup(rows);
    const chosen = [...rows.map(r => r.id), 999];
    const result = await service.send('absent', chosen, 3, 'Hi {name}');
    expect(result).toEqual({ sent: 150, skipped: 1, campaignIds: ['c1', 'c1'] });
    expect(sendPersonalizedBulk).toHaveBeenCalledTimes(2);
    expect(sendPersonalizedBulk.mock.calls[0][0][0]).toEqual({ phone: '091', message: 'Hi Abebe 1' });
    expect(sendPersonalizedBulk.mock.calls[0][1]).toBe('absent-members');
  });
});
