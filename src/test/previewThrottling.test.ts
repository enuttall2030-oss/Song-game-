import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameTrack } from '../game/types';
import { resolvePreviewsForTracks } from '../preview/resolvePreviews';
import { ITUNES_MIN_REQUEST_INTERVAL_MS, createRateLimiter } from '../preview/rateLimiter';

function track(id: string): GameTrack {
  return { id, title: `Song ${id}`, artist: 'Artist', albumArtUrl: '', previewUrl: '', popularity: 50 };
}

const tracks = (count: number) => Array.from({ length: count }, (_, i) => track(String(i)));
const noPacing = { acquireSlot: async () => {} };

beforeEach(() => {
  localStorage.clear();
});

describe('createRateLimiter', () => {
  it('lets the first caller straight through', async () => {
    const sleep = vi.fn(async () => {});
    const acquire = createRateLimiter(3_000, { now: () => 1_000, sleep });

    await acquire();

    expect(sleep).not.toHaveBeenCalled();
  });

  // Concurrency limits how many requests are in flight; it says nothing about how many are sent
  // per minute, which is the only thing Apple's throttle measures. Each caller therefore has to
  // reserve its own slot up front rather than all waking at the same moment.
  it('spaces concurrent callers one interval apart', async () => {
    const waits: number[] = [];
    const acquire = createRateLimiter(3_000, { now: () => 1_000, sleep: async (ms) => void waits.push(ms) });

    await Promise.all([acquire(), acquire(), acquire(), acquire()]);

    expect(waits).toEqual([0, 3_000, 6_000, 9_000].filter((w) => w > 0));
  });

  it('does not make a caller wait for a slot that has already passed', async () => {
    let clock = 0;
    const sleep = vi.fn(async () => {});
    const acquire = createRateLimiter(3_000, { now: () => clock, sleep });

    await acquire();
    clock = 10_000; // long gap: the reserved slot is in the past
    await acquire();

    expect(sleep).not.toHaveBeenCalled();
  });

  it('paces under Apple\'s ~20-per-minute ceiling', () => {
    expect(60_000 / ITUNES_MIN_REQUEST_INTERVAL_MS).toBeLessThan(20);
  });
});

describe('resolvePreviewsForTracks stops early', () => {
  // Every avoidable lookup is ~3 seconds of pacing, so pricing 60 tracks to fill a pool of 15 was
  // both slow and the thing that got us throttled in the first place.
  it('stops looking once it has enough playable tracks', async () => {
    const lookup = vi.fn(async (title: string) => `https://a/${title}`);

    const result = await resolvePreviewsForTracks(tracks(60), { lookup, targetMatches: 12, concurrency: 1, ...noPacing });

    expect(result.matched).toBe(12);
    expect(lookup).toHaveBeenCalledTimes(12);
  });

  it('keeps going past the target count when lookups keep missing', async () => {
    // Only every third track resolves, so reaching 5 matches needs ~15 lookups.
    const lookup = vi.fn(async (title: string) => {
      const n = Number(title.replace('Song ', ''));
      return n % 3 === 0 ? `https://a/${title}` : undefined;
    });

    const result = await resolvePreviewsForTracks(tracks(60), {
      lookup,
      targetMatches: 5,
      concurrency: 1,
      rng: () => 0.999, // keep the sample in playlist order so the 1-in-3 pattern is predictable
      ...noPacing,
    });

    expect(result.matched).toBe(5);
    expect(lookup.mock.calls.length).toBeGreaterThan(5);
  });

  it('never sends a request once the target is already met', async () => {
    const acquireSlot = vi.fn(async () => {});
    const lookup = vi.fn(async (title: string) => `https://a/${title}`);

    await resolvePreviewsForTracks(tracks(40), { lookup, targetMatches: 6, concurrency: 3, acquireSlot });

    // A few slots may be reserved by workers already past the check, but nowhere near all 40.
    expect(acquireSlot.mock.calls.length).toBeLessThan(12);
  });

  it('reports the target it is aiming for, so the UI can show real progress', async () => {
    const onProgress = vi.fn();

    await resolvePreviewsForTracks(tracks(30), {
      lookup: async (title) => `https://a/${title}`,
      targetMatches: 4,
      concurrency: 1,
      onProgress,
      ...noPacing,
    });

    const last = onProgress.mock.calls.at(-1)![0];
    expect(last.target).toBe(4);
    expect(last.matched).toBe(4);
  });
});

describe('resolvePreviewsForTracks reports why lookups came back empty', () => {
  // A blocked origin or a dead connection makes every lookup throw. That is indistinguishable
  // from "no previews exist" by match count alone, which is how a network problem ended up being
  // reported to the user as a bad playlist.
  it('counts outright failures separately from honest no-matches', async () => {
    const result = await resolvePreviewsForTracks(tracks(6), {
      lookup: async () => {
        throw new TypeError('Failed to fetch');
      },
      targetMatches: 6,
      concurrency: 1,
      ...noPacing,
    });

    expect(result.matched).toBe(0);
    expect(result.failed).toBe(6);
    expect(result.rateLimited).toBe(false); // a network error is not evidence of throttling
  });

  it('reports no failures when the catalogue simply has no match', async () => {
    const result = await resolvePreviewsForTracks(tracks(4), {
      lookup: async () => undefined,
      targetMatches: 4,
      concurrency: 1,
      ...noPacing,
    });

    expect(result.matched).toBe(0);
    expect(result.failed).toBe(0);
  });
});

describe('resolvePreviewsForTracks cache fast path', () => {
  // A re-pick after a throttled scan must not spend the rate budget again on clips it already
  // has, otherwise the advice "wait a minute and pick it again" would never actually work.
  it('spends no rate-limit slots on tracks already cached', async () => {
    const lookup = vi.fn(async (title: string) => `https://a/${title}`);
    await resolvePreviewsForTracks(tracks(8), { lookup, targetMatches: 8, concurrency: 1, ...noPacing });
    expect(lookup).toHaveBeenCalledTimes(8);

    const acquireSlot = vi.fn(async () => {});
    const second = await resolvePreviewsForTracks(tracks(8), { lookup, targetMatches: 8, concurrency: 1, acquireSlot });

    expect(acquireSlot).not.toHaveBeenCalled();
    expect(lookup).toHaveBeenCalledTimes(8);
    expect(second.matched).toBe(8);
  });
});
