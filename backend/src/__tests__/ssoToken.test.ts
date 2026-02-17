import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { generateSsoToken, decodeSsoToken, verifySsoToken } from '../utils/sso';

describe('SSO Token', () => {
  const secret = 'test-secret-key-12345';
  const payload = { username: 'testuser', groups: ['lab', 'gpu'], is_admin: false };

  it('generates valid HMAC-SHA256 signature', () => {
    const token = generateSsoToken(payload, secret);
    const [b64, sig] = token.split('.');
    const payloadStr = Buffer.from(b64!, 'base64url').toString();
    const expected = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
    expect(sig).toBe(expected);
  });

  it('payload contains username, groups, is_admin, exp', () => {
    const token = generateSsoToken(payload, secret);
    const decoded = decodeSsoToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.payload.username).toBe('testuser');
    expect(decoded!.payload.groups).toEqual(['lab', 'gpu']);
    expect(decoded!.payload.is_admin).toBe(false);
    expect(typeof decoded!.payload.exp).toBe('number');
  });

  it('exp is ~30 seconds in the future by default', () => {
    const before = Date.now();
    const token = generateSsoToken(payload, secret);
    const after = Date.now();
    const decoded = decodeSsoToken(token);
    expect(decoded!.payload.exp).toBeGreaterThanOrEqual(before + 29000);
    expect(decoded!.payload.exp).toBeLessThanOrEqual(after + 31000);
  });

  it('different secrets produce different signatures', () => {
    const token1 = generateSsoToken(payload, 'secret-a');
    const token2 = generateSsoToken(payload, 'secret-b');
    const sig1 = token1.split('.')[1];
    const sig2 = token2.split('.')[1];
    expect(sig1).not.toBe(sig2);
  });

  it('verifySsoToken validates correctly', () => {
    const token = generateSsoToken(payload, secret);
    const result = verifySsoToken(token, secret);
    expect(result).not.toBeNull();
    expect(result!.username).toBe('testuser');
  });

  it('verifySsoToken rejects wrong secret', () => {
    const token = generateSsoToken(payload, secret);
    const result = verifySsoToken(token, 'wrong-secret');
    expect(result).toBeNull();
  });

  it('verifySsoToken rejects expired token', () => {
    const token = generateSsoToken(payload, secret, -1000); // already expired
    const result = verifySsoToken(token, secret);
    expect(result).toBeNull();
  });
});
