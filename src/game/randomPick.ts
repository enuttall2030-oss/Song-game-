import type { GameTrack } from './types';

/**
 * Picks a song at random for the Picker. `excludeId` is what makes the "pick another" button
 * actually feel like a re-roll: without it, a random draw from a small pool can hand back the same
 * song it just offered. Excluding the current suggestion guarantees a genuinely different one
 * whenever the pool has more than one song left.
 */
export function pickRandomTrack(
  tracks: GameTrack[],
  excludeId?: string,
  rng: () => number = Math.random,
): GameTrack | undefined {
  const pool = tracks.filter((t) => t.id !== excludeId);
  const source = pool.length > 0 ? pool : tracks;
  if (source.length === 0) return undefined;
  return source[Math.floor(rng() * source.length)];
}
