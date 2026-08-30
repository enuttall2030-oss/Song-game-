import type { GameTrack } from '../game/types';

export interface PlaylistFilterResult {
  playableTracks: GameTrack[];
  totalCount: number;
  meetsMinimum: boolean;
}

/**
 * Not every Spotify track can be matched to a preview clip in Apple's catalogue, so playlists must
 * be filtered down to only tracks with a resolved preview URL *before* a Picker ever sees the
 * list — that's what structurally prevents a Picker from choosing an unplayable song.
 */
export function filterPlayableTracks(
  tracks: GameTrack[],
  minPlayableTracks: number,
): PlaylistFilterResult {
  const playableTracks = tracks.filter((t) => !!t.previewUrl);
  return {
    playableTracks,
    totalCount: tracks.length,
    meetsMinimum: playableTracks.length >= minPlayableTracks,
  };
}
