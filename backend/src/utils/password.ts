import crypto from 'crypto';

const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const lower = 'abcdefghjkmnpqrstuvwxyz';
const digits = '23456789';
const symbols = '!@#$%&*';
const all = upper + lower + digits + symbols;

export function generatePassword(length = 16): string {
  // 確保至少各包含一個字元類型
  const required = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    symbols[crypto.randomInt(symbols.length)],
  ];
  const rest = Array.from({ length: length - required.length }, () => all[crypto.randomInt(all.length)]);
  // Fisher-Yates shuffle
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
