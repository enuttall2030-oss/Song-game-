import type { GameTrack } from '../game/types';
import { normalizeTitle } from './fuzzyMatch';

/**
 * Ranks a playlist's tracks for the guess autocomplete dropdown: prefix matches first, then
 * substring matches, both alphabetical within their group. Scoped to the current playlist only,
 * per spec section 5 — never the whole Spotify catalog.
 */
export function suggestTracks(query: string, tracks: GameTrack[], limit = 8): GameTrack[] {
  const normalizedQuery = normalizeTitle(query);
  if (normalizedQuery.length === 0) return [];

  const prefixMatches: GameTrack[] = [];
  const substringMatches: GameTrack[] = [];

  for (const track of tracks) {
    const normalizedTitle = normalizeTitle(track.title);
    if (normalizedTitle.startsWith(normalizedQuery)) {
      prefixMatches.push(track);
    } else if (normalizedTitle.includes(normalizedQuery)) {
      substringMatches.push(track);
    }
  }

  const byTitle = (a: GameTrack, b: GameTrack) => a.title.localeCompare(b.title);
  return [...prefixMatches.sort(byTitle), ...substringMatches.sort(byTitle)].slice(0, limit);
}
