import { generateKeyPairSync, createPublicKey, verify } from 'crypto';
import { SantimPayClient } from './santimpay.client';
import { santimPayPhone } from './online-payments.service';

describe('SantimPayClient', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  beforeEach(() => {
    // As it would sit on one line in .env
    process.env.SANTIMPAY_PRIVATE_KEY = priv.replace(/\n/g, '\\n');
    process.env.SANTIMPAY_MERCHANT_ID = 'MERCHANT';
    process.env.SANTIMPAY_PUBLIC_KEY = pub;
  });

  it('signs an ES256 JWT that verifies with the matching public key', () => {
    const client = new SantimPayClient();
    const token = (client as unknown as { token(p: object): string }).token({ amount: 100 });
    const [h, b, s] = token.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'ES256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(b, 'base64url').toString())).toEqual({ amount: 100 });
    const ok = verify(
      'sha256',
      Buffer.from(`${h}.${b}`),
      { key: createPublicKey(pub), dsaEncoding: 'ieee-p1363' },
      Buffer.from(s, 'base64url'),
    );
    expect(ok).toBe(true);
    // The callback check accepts a token from the key pair, and refuses a tampered one.
    expect(client.callbackSignatureValid(token)).toBe(true);
    expect(client.callbackSignatureValid(`${h}.${b}x.${s}`)).toBe(false);
    expect(client.callbackSignatureValid(undefined)).toBe(false);
  });

  it('is off until the merchant id and key are set', () => {
    delete process.env.SANTIMPAY_MERCHANT_ID;
    expect(new SantimPayClient().enabled).toBe(false);
  });
});

describe('santimPayPhone', () => {
  it('writes Ethiopian numbers as +251…', () => {
    expect(santimPayPhone('0911 223344')).toBe('+251911223344');
    expect(santimPayPhone('911223344')).toBe('+251911223344');
    expect(santimPayPhone('+251711223344')).toBe('+251711223344');
    expect(santimPayPhone('12345')).toBeNull();
  });
});
