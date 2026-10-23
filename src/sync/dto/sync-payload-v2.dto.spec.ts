import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { SyncPayloadDto } from './sync-payload.dto';

describe('SyncPayloadDto (protocol 2)', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const basePayload = {
    timestamp: '2026-10-08T09:03:42.527Z',
    services: [],
    members: [],
    attendance: [],
    transactions: [],
    healthMetrics: [],
  };

  const validate = (body: object) =>
    validationPipe.transform(body, { type: 'body', metatype: SyncPayloadDto });

  it('keeps every column of a record, whatever its name', async () => {
    const result = await validate({
      ...basePayload,
      records: [
        {
          entity: 'member_additional_subscription',
          id: 4,
          data: { id: 4, member_id: 9, status: 'canceled', price_paid: 250.5, frozen: 0 },
        },
      ],
      deletions: [{ queueId: 1, entity: 'member', id: 9 }],
      prospectStatuses: [{ cloudId: 7, status: 'converted', convertedToMemberId: 9 }],
    });

    expect(result.records[0].data).toEqual({
      id: 4,
      member_id: 9,
      status: 'canceled',
      price_paid: 250.5,
      frozen: 0,
    });
    expect(result.deletions).toEqual([{ queueId: 1, entity: 'member', id: 9 }]);
    expect(result.prospectStatuses[0]).toMatchObject({ cloudId: 7, status: 'converted' });
  });

  it('accepts the newer transaction columns', async () => {
    const result = await validate({
      ...basePayload,
      transactions: [
        {
          id: 1,
          transactionType: 'income',
          amount: 900,
          transactionDate: '2026-10-08 09:00:00',
          description: 'Sauna',
          paymentStatus: 'paid',
          originalAmount: 1000,
          discountAmount: 100,
          discountId: 2,
          discountCode: 'TEN',
          additionalServiceId: 3,
          usageServiceId: null,
          memberGroupId: null,
        },
      ],
    });
    expect(result.transactions[0]).toMatchObject({ discountAmount: 100, additionalServiceId: 3 });
  });

  it('rejects a record entity that is not a table name', async () => {
    await expect(
      validate({
        ...basePayload,
        records: [{ entity: 'member; DROP TABLE member', id: 1, data: {} }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a lead status the website does not know', async () => {
    await expect(
      validate({
        ...basePayload,
        prospectStatuses: [{ cloudId: 1, status: 'maybe' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
