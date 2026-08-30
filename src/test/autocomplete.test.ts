import { describe, expect, it } from 'vitest';
import { suggestTracks } from '../match/autocomplete';
import type { GameTrack } from '../game/types';

function track(title: string): GameTrack {
  return { id: title, title, artist: 'Artist', albumArtUrl: '', previewUrl: 'x', popularity: 50 };
}

const playlist = [track('Yellow'), track('Yesterday'), track('Fix You'), track('Clocks')];

describe('suggestTracks', () => {
  it('returns nothing for an empty query', () => {
    expect(suggestTracks('', playlist)).toEqual([]);
  });

  it('ranks prefix matches before substring matches', () => {
    const results = suggestTracks('ye', playlist);
    expect(results.map((t) => t.title)).toEqual(['Yellow', 'Yesterday']);
  });

  it('finds substring matches when no prefix matches exist', () => {
    const results = suggestTracks('ix', playlist);
    expect(results.map((t) => t.title)).toEqual(['Fix You']);
  });

  it('is case- and punctuation-insensitive', () => {
    expect(suggestTracks('YELLOW', playlist).map((t) => t.title)).toEqual(['Yellow']);
  });

  it('never returns tracks outside the given playlist', () => {
    const results = suggestTracks('e', playlist);
    for (const t of results) {
      expect(playlist).toContainEqual(t);
    }
  });

  it('respects the limit', () => {
    const bigPlaylist = Array.from({ length: 20 }, (_, i) => track(`Yellow ${i}`));
    expect(suggestTracks('yellow', bigPlaylist, 5)).toHaveLength(5);
  });
});
