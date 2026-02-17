import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock getDb
const mockGet = vi.fn();
vi.mock('../db/schema', () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(() => ({ get: mockGet })),
  })),
}));

import { getSetting, invalidateSettingCache, getNumericSetting } from '../utils/settings';

describe('Settings Cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clear cache by invalidating known keys
    invalidateSettingCache('test_key');
    invalidateSettingCache('numeric_key');
    mockGet.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches from DB on first call', () => {
    mockGet.mockReturnValue({ value: 'hello' });
    const result = getSetting('test_key', 'default');
    expect(result).toBe('hello');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('uses cache on second call within TTL', () => {
    mockGet.mockReturnValue({ value: 'hello' });
    getSetting('test_key', 'default');
    const result = getSetting('test_key', 'default');
    expect(result).toBe('hello');
    expect(mockGet).toHaveBeenCalledTimes(1); // only 1 DB call
  });

  it('refetches from DB after TTL expires', () => {
    mockGet.mockReturnValue({ value: 'hello' });
    getSetting('test_key', 'default');
    expect(mockGet).toHaveBeenCalledTimes(1);

    // Advance past TTL (60 seconds)
    vi.advanceTimersByTime(61_000);
    mockGet.mockReturnValue({ value: 'updated' });
    const result = getSetting('test_key', 'default');
    expect(result).toBe('updated');
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('returns defaultValue when DB has no data', () => {
    mockGet.mockReturnValue(undefined);
    const result = getSetting('test_key', 'fallback');
    expect(result).toBe('fallback');
  });

  it('invalidateSettingCache forces refetch', () => {
    mockGet.mockReturnValue({ value: 'original' });
    getSetting('test_key', 'default');
    expect(mockGet).toHaveBeenCalledTimes(1);

    invalidateSettingCache('test_key');
    mockGet.mockReturnValue({ value: 'new_value' });
    const result = getSetting('test_key', 'default');
    expect(result).toBe('new_value');
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('getNumericSetting parses valid number', () => {
    mockGet.mockReturnValue({ value: '30' });
    invalidateSettingCache('numeric_key');
    const result = getNumericSetting('numeric_key', 10);
    expect(result).toBe(30);
  });

  it('getNumericSetting returns default for non-numeric value', () => {
    mockGet.mockReturnValue({ value: 'abc' });
    invalidateSettingCache('numeric_key');
    const result = getNumericSetting('numeric_key', 10);
    expect(result).toBe(10);
  });

  it('getNumericSetting returns default for zero or negative', () => {
    mockGet.mockReturnValue({ value: '0' });
    invalidateSettingCache('numeric_key');
    expect(getNumericSetting('numeric_key', 10)).toBe(10);

    invalidateSettingCache('numeric_key');
    mockGet.mockReturnValue({ value: '-5' });
    expect(getNumericSetting('numeric_key', 10)).toBe(10);
  });
});
