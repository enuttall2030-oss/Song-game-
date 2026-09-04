import type { GameTrack } from '../game/types';
import { ItunesLookupError, fetchItunesPreviewUrl } from './itunesPreview';
import { readCachedPreview, writeCachedPreview } from './previewCache';
import { createAdaptiveRateLimiter } from './rateLimiter';

/**
 * The most of a playlist's tracks we are willing to look up. Apple's Search API is rate limited,
 * so scanning a 500-track playlist track-by-track would take an hour — a random sample of this
 * size is far more than the handful of rounds a match actually consumes.
 */
export const PREVIEW_SAMPLE_SIZE = 60;
/** Concurrent lookups. Pacing, not concurrency, is what keeps us under Apple's limit. */
export const PREVIEW_CONCURRENCY = 3;
/**
 * Stop looking as soon as this many playable tracks exist. Apple allows only ~20 requests a
 * minute, so every avoidable lookup is ~3 seconds of someone staring at a progress line; there is
 * no reason to price 60 tracks when a match needs a pool of about fifteen.
 */
export const PREVIEW_TARGET_MATCHES = 15;

export interface PreviewResolution {
  /** The sampled tracks, each with `previewUrl` filled in where Apple had a matching clip. */
  tracks: GameTrack[];
  attempted: number;
  matched: number;
  /** True if any lookup was throttled — a low `matched` count then means "try again", not "no previews". */
  rateLimited: boolean;
  /**
   * Lookups that errored outright rather than answering "no match". A blocked origin or a dropped
   * connection produces these, and if most attempts land here the playlist is not the problem —
   * without this the UI could only report "few previews found" and wrongly blame the songs.
   */
  failed: number;
}

export interface PreviewProgress {
  /** Tracks resolved so far, from cache or network. */
  checked: number;
  /** Tracks we may still have to check. */
  total: number;
  /** Playable tracks found so far. */
  matched: number;
  /** How many playable tracks we are aiming for before stopping early. */
  target: number;
}

export interface ResolvePreviewsOptions {
  sampleSize?: number;
  concurrency?: number;
  targetMatches?: number;
  onProgress?: (progress: PreviewProgress) => void;
  rng?: () => number;
  lookup?: (title: string, artist: string) => Promise<string | undefined>;
  /**
   * Pacing gate. Defaults to one that runs unthrottled until Apple objects, then slows down;
   * tests inject a no-op so a backed-off scan doesn't make the suite take minutes.
   */
  limiter?: { acquire: () => Promise<void>; slowDown: () => void };
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

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  shouldStop: () => boolean = () => false,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      if (shouldStop()) return;
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
 *
 * Cached tracks are swept first and cost nothing, so re-picking a playlist is close to instant;
 * only the unknown ones go to the network, and only until there are enough playable songs to fill
 * a match. Those lookups run at full speed and drop to a paced crawl the moment Apple throttles
 * one, so the common case stays quick and the throttled case still finishes.
 */
export async function resolvePreviewsForTracks(
  tracks: GameTrack[],
  options: ResolvePreviewsOptions = {},
): Promise<PreviewResolution> {
  const {
    sampleSize = PREVIEW_SAMPLE_SIZE,
    concurrency = PREVIEW_CONCURRENCY,
    targetMatches = PREVIEW_TARGET_MATCHES,
    onProgress,
    rng,
    lookup = (title, artist) => fetchItunesPreviewUrl(title, artist),
    limiter = createAdaptiveRateLimiter(),
  } = options;

  const sampled = sampleTracks(tracks, sampleSize, rng);
  const resolved = new Map<string, string>();
  let checked = 0;
  let rateLimited = false;
  let failed = 0;

  const report = () =>
    onProgress?.({ checked, total: sampled.length, matched: resolved.size, target: targetMatches });

  report();

  // Pass 1: everything already known, for free. A rematch or a re-pick never touches the network.
  const needLookup: GameTrack[] = [];
  for (const track of sampled) {
    const cached = readCachedPreview(track.id);
    if (!cached) {
      needLookup.push(track);
      continue;
    }
    if (cached.url) resolved.set(track.id, cached.url);
    checked++;
  }
  report();

  // Pass 2: the unknowns, paced, and only while we still need more playable songs.
  const enough = () => resolved.size >= targetMatches;

  if (!enough()) {
    await runPool(
      needLookup,
      concurrency,
      async (track) => {
        // Re-check inside the worker: a slot reserved before the target was met can otherwise
        // fire a request nobody needs any more.
        if (enough()) return;
        await limiter.acquire();
        if (enough()) return;

        try {
          const url = await lookup(track.title, track.artist);
          writeCachedPreview(track.id, url ?? '');
          if (url) resolved.set(track.id, url);
        } catch (err) {
          // One failed lookup must not fail the whole playlist scan — it just makes that track
          // unplayable. Throttling is remembered so the UI can say so instead of blaming the playlist.
          failed++;
          if (err instanceof ItunesLookupError && err.rateLimited) {
            rateLimited = true;
            // Apple has objected: pace every remaining lookup rather than compounding the burst.
            limiter.slowDown();
          }
        }

        checked++;
        report();
      },
      enough,
    );
  }

  const withPreviews = sampled.map((track) => ({ ...track, previewUrl: resolved.get(track.id) ?? '' }));

  return {
    tracks: withPreviews,
    attempted: checked,
    matched: resolved.size,
    rateLimited,
    failed,
  };
}
