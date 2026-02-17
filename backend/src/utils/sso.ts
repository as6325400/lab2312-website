import crypto from 'crypto';

export interface SsoPayload {
  username: string;
  groups: string[];
  is_admin: boolean;
  exp: number;
}

export function generateSsoToken(
  payload: { username: string; groups: string[]; is_admin: boolean },
  secret: string,
  ttlMs = 30000,
): string {
  const full: SsoPayload = {
    ...payload,
    exp: Date.now() + ttlMs,
  };

  const payloadStr = JSON.stringify(full);
  const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
  return Buffer.from(payloadStr).toString('base64url') + '.' + signature;
}

export function decodeSsoToken(token: string): { payload: SsoPayload; signature: string } | null {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return null;

  try {
    const payloadB64 = token.slice(0, dotIndex);
    const signature = token.slice(dotIndex + 1);
    const payload: SsoPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    return { payload, signature };
  } catch {
    return null;
  }
}

export function verifySsoToken(token: string, secret: string): SsoPayload | null {
  const decoded = decodeSsoToken(token);
  if (!decoded) return null;

  const payloadStr = Buffer.from(token.slice(0, token.indexOf('.')), 'base64url').toString();
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');

  if (expectedSig !== decoded.signature) return null;
  if (decoded.payload.exp < Date.now()) return null;

  return decoded.payload;
}
