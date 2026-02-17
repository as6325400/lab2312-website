import { describe, it, expect } from 'vitest';
import { generatePassword } from '../utils/password';

describe('generatePassword', () => {
  it('generates password of default length 16', () => {
    const pw = generatePassword();
    expect(pw.length).toBe(16);
  });

  it('generates password of custom length', () => {
    const pw = generatePassword(32);
    expect(pw.length).toBe(32);
  });

  it('contains at least 1 uppercase letter', () => {
    const pw = generatePassword();
    expect(/[A-Z]/.test(pw)).toBe(true);
  });

  it('contains at least 1 lowercase letter', () => {
    const pw = generatePassword();
    expect(/[a-z]/.test(pw)).toBe(true);
  });

  it('contains at least 1 digit', () => {
    const pw = generatePassword();
    expect(/[0-9]/.test(pw)).toBe(true);
  });

  it('contains at least 1 symbol', () => {
    const pw = generatePassword();
    expect(/[!@#$%&*]/.test(pw)).toBe(true);
  });

  it('does not contain ambiguous characters (0, O, o, I, l, 1)', () => {
    // Run multiple times to increase confidence
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword();
      expect(pw).not.toMatch(/[0OoIl1]/);
    }
  });

  it('generates different passwords each time (randomness)', () => {
    const passwords = new Set(Array.from({ length: 10 }, () => generatePassword()));
    // At least 9 out of 10 should be unique (extremely unlikely to have collisions)
    expect(passwords.size).toBeGreaterThanOrEqual(9);
  });
});
