import type { GameTrack } from '../game/types';
import { generateToneObjectUrl } from '../utils/generateToneWav';

const SONG_NAMES = [
  'Midnight Static',
  'Paper Cranes',
  'Low Tide',
  'Neon Hallway',
  'Slow Burn',
  'Glass Houses',
  'Coastline',
  'Afterglow',
  'Wildfire',
  'Blue Hour',
  'Concrete Jungle',
  'Second Wind',
];

/**
 * Locally-generated fixture playlists for dev/demo use, so the full turn loop (including real
 * audio playback timing) can be exercised in a browser without a live Spotify OAuth round trip.
 * Never shown outside `import.meta.env.DEV`.
 *
 * One dev-only wrinkle: these preview URLs are blob URLs, which belong to the document that
 * created them, so a persisted fixture match resumed after a page reload has dead audio. Real
 * matches are unaffected — Apple's preview URLs are ordinary https ones that survive the OAuth
 * redirect, which is the only full-page navigation a real match makes.
 */
export function buildFixturePlaylist(seedPrefix: string): GameTrack[] {
  return SONG_NAMES.map((name, i) => ({
    id: `${seedPrefix}-${i}`,
    title: `${name} (${seedPrefix})`,
    artist: `${seedPrefix}'s Band`,
    albumArtUrl: '',
    previewUrl: generateToneObjectUrl(20, 220 + i * 15),
    popularity: 30 + i * 5,
  }));
}

/** Stand-in names for a fixture match, one per slot. */
export const FIXTURE_NAMES = ['Alice', 'Bob', 'Cleo', 'Dev', 'Eze'];
