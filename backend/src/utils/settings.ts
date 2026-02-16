import { getDb } from '../db/schema';

// In-memory cache: key -> { value, fetchedAt }
const cache = new Map<string, { value: string; fetchedAt: number }>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export function getSetting(key: string, defaultValue: string): string {
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.value;
  }

  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;

  const value = row?.value ?? defaultValue;
  cache.set(key, { value, fetchedAt: now });
  return value;
}

export function invalidateSettingCache(key: string): void {
  cache.delete(key);
}

export function getNumericSetting(key: string, defaultValue: number): number {
  const raw = getSetting(key, String(defaultValue));
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) || parsed <= 0 ? defaultValue : parsed;
}
