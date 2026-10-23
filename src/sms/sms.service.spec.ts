import { explainError, mapStatus, normalizePhone } from './sms.service';

describe('normalizePhone', () => {
  it('turns Ethio Telecom numbers into 2519XXXXXXXX', () => {
    for (const n of [
      '0911234567',
      '911234567',
      '251911234567',
      '+251 91-123-4567',
      '(0911) 234 567',
    ]) {
      expect(normalizePhone(n)).toBe('251911234567');
    }
  });

  it('refuses Safaricom and malformed numbers', () => {
    expect(() => normalizePhone('0711234567')).toThrow('Safaricom');
    expect(() => normalizePhone('+251711234567')).toThrow('Safaricom');
    for (const n of ['', '12345', '0111234567', '09112345678']) {
      expect(() => normalizePhone(n)).toThrow('not an Ethiopian mobile number');
    }
  });
});

describe('explainError', () => {
  it('explains SMS Ethiopia error codes and HTTP statuses', () => {
    expect(
      explainError(
        400,
        JSON.stringify({
          error_message: "You don't have enough package. Error Code :: 10005",
        }),
      ),
    ).toMatch(/^Out of SMS/);
    expect(
      explainError(
        400,
        JSON.stringify({ error_message: 'x Error Code :: 10007' }),
      ),
    ).toContain('verified');
    expect(
      explainError(400, JSON.stringify({ msisdn: 'msisdn is mandatory' })),
    ).toBe('msisdn is mandatory');
    expect(explainError(401, '')).toContain('API key');
    expect(explainError(503, '')).toContain('HTTP 503');
  });

  it('maps delivery states', () => {
    expect(mapStatus('DELIVERED')).toBe('delivered');
    expect(mapStatus('ACCEPTED')).toBe('queued');
    expect(mapStatus('SENT')).toBe('sent');
    expect(mapStatus('UNDELIVERED')).toBe('failed');
  });
});
