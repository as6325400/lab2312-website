import { describe, it, expect } from 'vitest';

// Test the pure logic of invite token validation and registration
// without needing a running Express server or database.

describe('Invite Token Validation Logic', () => {
  function validateInvite(invite: { expires_at: string; used_count: number; max_uses: number } | null): {
    valid: boolean;
    error?: string;
    status?: number;
  } {
    if (!invite) return { valid: false, error: 'Invalid token', status: 404 };
    const now = new Date().toISOString();
    if (invite.expires_at < now) return { valid: false, error: 'Token expired', status: 410 };
    if (invite.used_count >= invite.max_uses) return { valid: false, error: 'Token usage limit reached', status: 410 };
    return { valid: true };
  }

  it('returns valid for a good invite', () => {
    const invite = {
      expires_at: new Date(Date.now() + 86400000).toISOString(), // tomorrow
      used_count: 0,
      max_uses: 5,
    };
    expect(validateInvite(invite).valid).toBe(true);
  });

  it('returns 404 for null invite', () => {
    const result = validateInvite(null);
    expect(result.valid).toBe(false);
    expect(result.status).toBe(404);
  });

  it('returns 410 for expired invite', () => {
    const invite = {
      expires_at: new Date(Date.now() - 86400000).toISOString(), // yesterday
      used_count: 0,
      max_uses: 5,
    };
    const result = validateInvite(invite);
    expect(result.valid).toBe(false);
    expect(result.status).toBe(410);
    expect(result.error).toContain('expired');
  });

  it('returns 410 when usage limit reached', () => {
    const invite = {
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      used_count: 5,
      max_uses: 5,
    };
    const result = validateInvite(invite);
    expect(result.valid).toBe(false);
    expect(result.status).toBe(410);
    expect(result.error).toContain('limit');
  });

  it('valid when used_count < max_uses', () => {
    const invite = {
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      used_count: 4,
      max_uses: 5,
    };
    expect(validateInvite(invite).valid).toBe(true);
  });
});

describe('Registration Input Validation', () => {
  function validateRegistration(body: {
    token?: string;
    name?: string;
    email?: string;
    username?: string;
  }): string | null {
    if (!body.token || !body.name || !body.email || !body.username) {
      return 'token, name, email, and username are required';
    }
    return null;
  }

  it('accepts complete input', () => {
    expect(
      validateRegistration({ token: 'abc', name: 'Alice', email: 'a@b.com', username: 'alice' })
    ).toBeNull();
  });

  it('rejects missing token', () => {
    expect(
      validateRegistration({ name: 'Alice', email: 'a@b.com', username: 'alice' })
    ).not.toBeNull();
  });

  it('rejects missing name', () => {
    expect(
      validateRegistration({ token: 'abc', email: 'a@b.com', username: 'alice' })
    ).not.toBeNull();
  });

  it('rejects missing email', () => {
    expect(
      validateRegistration({ token: 'abc', name: 'Alice', username: 'alice' })
    ).not.toBeNull();
  });

  it('rejects missing username', () => {
    expect(
      validateRegistration({ token: 'abc', name: 'Alice', email: 'a@b.com' })
    ).not.toBeNull();
  });

  it('rejects all empty', () => {
    expect(validateRegistration({})).not.toBeNull();
  });
});
