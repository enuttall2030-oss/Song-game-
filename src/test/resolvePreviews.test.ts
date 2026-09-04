import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameTrack } from '../game/types';
import { ItunesLookupError } from '../preview/itunesPreview';
import { resolvePreviewsForTracks, sampleTracks } from '../preview/resolvePreviews';

function track(id: string): GameTrack {
  return { id, title: `Song ${id}`, artist: 'Artist', albumArtUrl: '', previewUrl: '', popularity: 50 };
}

const tracks = (count: number) => Array.from({ length: count }, (_, i) => track(String(i)));

/**
 * The production pacing gate spaces requests ~3.2s apart to stay under Apple's per-IP limit, so
 * every test that resolves previews injects this instead of waiting minutes for real time.
 */
const noPacing = { acquireSlot: async () => {} };

beforeEach(() => {
  localStorage.clear();
});

describe('sampleTracks', () => {
  it('caps the sample at the requested size', () => {
    expect(sampleTracks(tracks(200), 60).length).toBe(60);
  });

  it('returns everything when the playlist is smaller than the sample', () => {
    expect(sampleTracks(tracks(5), 60).map((t) => t.id).sort()).toEqual(['0', '1', '2', '3', '4']);
  });

  it('does not bias toward playlist order', () => {
    // rng always picking the low end still yields a permutation, never a prefix-only slice.
    const sampled = sampleTracks(tracks(10), 3, () => 0);
    expect(new Set(sampled.map((t) => t.id)).size).toBe(3);
  });
});

describe('resolvePreviewsForTracks', () => {
  it('fills in preview urls and reports how many matched', async () => {
    const lookup = vi.fn(async (title: string) => (title === 'Song 1' ? undefined : `https://a/${title}`));
    const result = await resolvePreviewsForTracks(tracks(3), { lookup, concurrency: 2, ...noPacing });

    expect(result.attempted).toBe(3);
    expect(result.matched).toBe(2);
    expect(result.rateLimited).toBe(false);
    expect(result.tracks.find((t) => t.id === '1')?.previewUrl).toBe('');
    expect(result.tracks.find((t) => t.id === '0')?.previewUrl).toBe('https://a/Song 0');
  });

  it('reports progress as playable clips are found', async () => {
    const onProgress = vi.fn();
    await resolvePreviewsForTracks(tracks(4), {
      lookup: async () => 'https://a/x',
      concurrency: 1,
      onProgress,
      ...noPacing,
    });
    expect(onProgress).toHaveBeenCalledWith({ checked: 0, total: 4, matched: 0, target: 15 });
    expect(onProgress).toHaveBeenLastCalledWith({ checked: 4, total: 4, matched: 4, target: 15 });
  });

  it('keeps scanning when individual lookups fail, and flags throttling', async () => {
    const lookup = vi.fn(async (title: string) => {
      if (title === 'Song 0') throw new ItunesLookupError('throttled', true);
      if (title === 'Song 1') throw new Error('network');
      return 'https://a/ok';
    });
    const result = await resolvePreviewsForTracks(tracks(3), { lookup, concurrency: 1, ...noPacing });

    expect(result.matched).toBe(1);
    expect(result.rateLimited).toBe(true);
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const lookup = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight--;
      return 'https://a/x';
    };
    await resolvePreviewsForTracks(tracks(20), { lookup, concurrency: 4, targetMatches: 100, ...noPacing });
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('reuses cached hits and cached misses instead of looking up again', async () => {
    const lookup = vi.fn(async (title: string) => (title === 'Song 1' ? undefined : `https://a/${title}`));
    await resolvePreviewsForTracks(tracks(2), { lookup, ...noPacing });
    expect(lookup).toHaveBeenCalledTimes(2);

    const second = await resolvePreviewsForTracks(tracks(2), { lookup, ...noPacing });
    expect(lookup).toHaveBeenCalledTimes(2); // no further network work
    expect(second.matched).toBe(1);
    expect(second.tracks.find((t) => t.id === '0')?.previewUrl).toBe('https://a/Song 0');
  });
});

describe('sampling is random and re-drawn every pick', () => {
  const playlist = tracks(237); // the size of a real playlist we tested against

  it('draws a different 60 each time the same playlist is picked', () => {
    const first = sampleTracks(playlist, 60).map((t) => t.id);
    const second = sampleTracks(playlist, 60).map((t) => t.id);
    // Identical draws of 60 from 237 are astronomically unlikely; identical *order* even more so.
    expect(first).not.toEqual(second);
    expect(new Set(first).size).toBe(60);
  });

  it('gives every track in the playlist a real chance of being drawn', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      for (const t of sampleTracks(playlist, 60)) seen.add(t.id);
    }
    // 40 draws of 60 from 237: a track never appearing would mean the sampler is positionally biased.
    expect(seen.size).toBe(237);
  });

  it('draws uniformly rather than favouring the start or end of the playlist', () => {
    const counts = new Map<string, number>();
    const trials = 300;
    for (let i = 0; i < trials; i++) {
      for (const t of sampleTracks(playlist, 60)) counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
    }
    const expected = trials * (60 / 237); // ~76
    const observed = [...counts.values()];
    expect(Math.min(...observed)).toBeGreaterThan(expected * 0.6);
    expect(Math.max(...observed)).toBeLessThan(expected * 1.4);
  });

  it('re-samples on each resolve call, not once per playlist', async () => {
    const seenPerRun: string[][] = [];
    for (let run = 0; run < 2; run++) {
      const result = await resolvePreviewsForTracks(playlist, {
        sampleSize: 60,
        lookup: async () => 'https://a/x',
        ...noPacing,
      });
      seenPerRun.push(result.tracks.map((t) => t.id).sort());
    }
    expect(seenPerRun[0]).not.toEqual(seenPerRun[1]);
  });
});
