/**
 * Apple's Search API is unauthenticated and CORS-open, which is what lets this game run with no
 * backend — but it is throttled per IP at roughly 20 calls a minute, and it answers a breached
 * limit with **403**, not 429. Firing a playlist scan as fast as the network allows therefore gets
 * almost every lookup rejected, which used to surface as "not enough songs have a preview" and
 * blame the playlist for what was really our own request rate.
 *
 * So requests are spaced instead of merely limited in concurrency: concurrency caps how many are
 * in flight, which is not the same thing as how many are sent per minute.
 */

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface RateLimiterOptions {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Returns an `acquire()` that resolves when the caller may send its request. Each call reserves
 * the next free slot up front, so concurrent callers queue behind each other rather than all
 * waking at once — the property a plain "sleep between requests" loop fails to give you.
 */
export function createRateLimiter(minIntervalMs: number, { now = Date.now, sleep = defaultSleep }: RateLimiterOptions = {}) {
  let nextSlotAt = 0;

  return async function acquire(): Promise<void> {
    const current = now();
    const slot = Math.max(current, nextSlotAt);
    nextSlotAt = slot + minIntervalMs;
    const wait = slot - current;
    if (wait > 0) await sleep(wait);
  };
}

/**
 * ~19 requests/minute: under Apple's limit with a little headroom, since the penalty for guessing
 * high is a throttle that then blocks the whole scan for far longer than the time saved.
 */
export const ITUNES_MIN_REQUEST_INTERVAL_MS = 3_200;

export interface AdaptiveRateLimiter {
  acquire: () => Promise<void>;
  /** Called when the server has signalled a throttle; slows every subsequent request. */
  slowDown: () => void;
  /** Exposed for assertions and progress copy. */
  isSlowed: () => boolean;
}

/**
 * Unpaced until Apple actually objects, then paced for the rest of the scan.
 *
 * Fixed pacing was the wrong default: a scan needs only ~15 lookups, which already sits inside
 * Apple's allowance, so spending ~3 seconds per request made every cold scan take a minute to
 * insure against a throttle that usually never comes. Going fast and backing off on the first 403
 * costs one throttled lookup in the bad case and nothing at all in the good one.
 */
export function createAdaptiveRateLimiter(
  slowIntervalMs = ITUNES_MIN_REQUEST_INTERVAL_MS,
  options: RateLimiterOptions = {},
): AdaptiveRateLimiter {
  const paced = createRateLimiter(slowIntervalMs, options);
  let slowed = false;

  return {
    acquire: async () => {
      if (slowed) await paced();
    },
    slowDown: () => {
      slowed = true;
    },
    isSlowed: () => slowed,
  };
}
