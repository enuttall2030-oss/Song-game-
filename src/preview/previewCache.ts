/**
 * Preview lookups are the slow, rate-limited part of picking a playlist, and the same tracks
 * recur constantly (re-picking a playlist, a rematch, both players sharing songs). Results are
 * cached in localStorage keyed by Spotify track id — including *misses*, which are just as
 * expensive to re-derive, on a shorter TTL in case Apple's catalogue gains the track later.
 */
const KEY_PREFIX = 'pr.preview.v1.';
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  /** Empty string means "looked up, no match" — a cached miss, not a cached hit. */
  url: string;
  at: number;
}

export type CachedPreview = { url: string } | undefined;

function key(trackId: string): string {
  return `${KEY_PREFIX}${trackId}`;
}

export function readCachedPreview(trackId: string, now = Date.now()): CachedPreview {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key(trackId));
  } catch {
    return undefined;
  }
  if (!raw) return undefined;

  try {
    const entry = JSON.parse(raw) as CacheEntry;
    if (typeof entry.url !== 'string' || typeof entry.at !== 'number') return undefined;
    const ttl = entry.url ? HIT_TTL_MS : MISS_TTL_MS;
    if (now - entry.at > ttl) return undefined;
    return { url: entry.url };
  } catch {
    return undefined;
  }
}

export function writeCachedPreview(trackId: string, url: string, now = Date.now()): void {
  try {
    localStorage.setItem(key(trackId), JSON.stringify({ url, at: now } satisfies CacheEntry));
  } catch {
    // Quota or private-browsing failure: the cache is an optimization, never a requirement.
  }
}
