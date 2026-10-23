import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { SyncPayloadDto } from './sync-payload.dto';

describe('SyncPayloadDto', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const basePayload = {
    timestamp: '2026-05-16T09:03:42.527Z',
    services: [],
    members: [],
    attendance: [],
    transactions: [],
    healthMetrics: [],
  };

  it('accepts paymentMethods in the sync payload', async () => {
    await expect(
      validationPipe.transform(
        {
          ...basePayload,
          paymentMethods: [
            {
              id: 1,
              name: 'Cash',
              description: 'Cash drawer',
              isActive: true,
            },
          ],
        },
        {
          type: 'body',
          metatype: SyncPayloadDto,
        },
      ),
    ).resolves.toMatchObject({
      paymentMethods: [
        {
          id: 1,
          name: 'Cash',
          description: 'Cash drawer',
          isActive: true,
        },
      ],
    });
  });

  it('validates nested paymentMethods entries', async () => {
    try {
      await validationPipe.transform(
        {
          ...basePayload,
          paymentMethods: [
            {
              id: 1,
              name: 'Cash',
            },
          ],
        },
        {
          type: 'body',
          metatype: SyncPayloadDto,
        },
      );
      fail('Expected validation to reject invalid paymentMethods');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestException);

      if (error instanceof BadRequestException) {
        const response = error.getResponse();
        const messages =
          typeof response === 'object' &&
          response !== null &&
          'message' in response &&
          Array.isArray(response.message)
            ? response.message
            : [];

        expect(messages).toEqual(
          expect.arrayContaining([
            expect.stringContaining('isActive must be a boolean value'),
          ]),
        );
      }
    }
  });
});
