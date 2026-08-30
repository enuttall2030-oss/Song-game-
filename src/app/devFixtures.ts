import type { GameTrack } from '../game/types';
import { generateToneDataUri } from '../utils/generateToneWav';

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
 */
export function buildFixturePlaylist(seedPrefix: string): GameTrack[] {
  return SONG_NAMES.map((name, i) => ({
    id: `${seedPrefix}-${i}`,
    title: `${name} (${seedPrefix})`,
    artist: `${seedPrefix}'s Band`,
    albumArtUrl: '',
    previewUrl: generateToneDataUri(20, 220 + i * 15),
    popularity: 30 + i * 5,
  }));
}

/** Stand-in names for a fixture match, one per slot. */
export const FIXTURE_NAMES = ['Alice', 'Bob', 'Cleo', 'Dev', 'Eze'];
