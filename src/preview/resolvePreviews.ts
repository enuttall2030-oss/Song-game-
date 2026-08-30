import type { GameTrack } from '../game/types';
import { ItunesLookupError, fetchItunesPreviewUrl } from './itunesPreview';
import { readCachedPreview, writeCachedPreview } from './previewCache';

/**
 * How many of a playlist's tracks we look up. Apple's Search API is rate limited, so scanning a
 * 500-track playlist track-by-track would take minutes and get throttled — a random sample of
 * this size is far more than the handful of rounds a match actually consumes.
 */
export const PREVIEW_SAMPLE_SIZE = 60;
/** Concurrent lookups. Kept low deliberately: the whole scan is one burst against a throttled API. */
export const PREVIEW_CONCURRENCY = 4;

export interface PreviewResolution {
  /** The sampled tracks, each with `previewUrl` filled in where Apple had a matching clip. */
  tracks: GameTrack[];
  attempted: number;
  matched: number;
  /** True if any lookup was throttled — a low `matched` count then means "try again", not "no previews". */
  rateLimited: boolean;
}

export interface ResolvePreviewsOptions {
  sampleSize?: number;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
  rng?: () => number;
  lookup?: (title: string, artist: string) => Promise<string | undefined>;
}

/** Fisher-Yates over a copy, so playlist order never biases which tracks get looked up. */
export function sampleTracks(tracks: GameTrack[], size: number, rng: () => number = Math.random): GameTrack[] {
  const shuffled = [...tracks];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, size);
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

/**
 * Fills in playable preview URLs for a Spotify playlist from Apple's catalogue. Spotify stopped
 * returning `preview_url` for apps registered after 2024-11-27, so Spotify supplies *which* songs
 * are in play and Apple supplies the audio; a track Apple can't match simply isn't playable and
 * gets filtered out downstream by `filterPlayableTracks`.
 */
export async function resolvePreviewsForTracks(
  tracks: GameTrack[],
  options: ResolvePreviewsOptions = {},
): Promise<PreviewResolution> {
  const {
    sampleSize = PREVIEW_SAMPLE_SIZE,
    concurrency = PREVIEW_CONCURRENCY,
    onProgress,
    rng,
    lookup = (title, artist) => fetchItunesPreviewUrl(title, artist),
  } = options;

  const sampled = sampleTracks(tracks, sampleSize, rng);
  const resolved = new Map<string, string>();
  let done = 0;
  let rateLimited = false;

  onProgress?.(0, sampled.length);

  await runPool(sampled, concurrency, async (track) => {
    const cached = readCachedPreview(track.id);
    if (cached) {
      if (cached.url) resolved.set(track.id, cached.url);
    } else {
      try {
        const url = await lookup(track.title, track.artist);
        writeCachedPreview(track.id, url ?? '');
        if (url) resolved.set(track.id, url);
      } catch (err) {
        // One failed lookup must not fail the whole playlist scan — it just makes that track
        // unplayable. Throttling is remembered so the UI can say so instead of blaming the playlist.
        if (err instanceof ItunesLookupError && err.rateLimited) rateLimited = true;
      }
    }

    done++;
    onProgress?.(done, sampled.length);
  });

  const withPreviews = sampled.map((track) => ({ ...track, previewUrl: resolved.get(track.id) ?? '' }));

  return {
    tracks: withPreviews,
    attempted: sampled.length,
    matched: resolved.size,
    rateLimited,
  };
}
