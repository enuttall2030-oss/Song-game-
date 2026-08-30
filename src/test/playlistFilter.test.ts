import { describe, expect, it } from 'vitest';
import { filterPlayableTracks } from '../match/playlistFilter';
import type { GameTrack } from '../game/types';

function track(id: string, previewUrl: string | null): GameTrack {
  return {
    id,
    title: `Track ${id}`,
    artist: 'Artist',
    albumArtUrl: '',
    previewUrl: previewUrl ?? '',
    popularity: 50,
  };
}

describe('filterPlayableTracks', () => {
  it('keeps only tracks with a non-empty preview_url', () => {
    const tracks = [track('1', 'https://p/1'), track('2', null), track('3', 'https://p/3')];
    const result = filterPlayableTracks(tracks, 2);
    expect(result.playableTracks.map((t) => t.id)).toEqual(['1', '3']);
    expect(result.totalCount).toBe(3);
  });

  it('reports meetsMinimum correctly at the boundary', () => {
    const tracks = [track('1', 'x'), track('2', 'x'), track('3', null)];
    expect(filterPlayableTracks(tracks, 2).meetsMinimum).toBe(true);
    expect(filterPlayableTracks(tracks, 3).meetsMinimum).toBe(false);
  });

  it('handles an empty playlist', () => {
    const result = filterPlayableTracks([], 10);
    expect(result.playableTracks).toEqual([]);
    expect(result.meetsMinimum).toBe(false);
  });
});
