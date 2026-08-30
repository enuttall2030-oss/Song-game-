import { describe, expect, it } from 'vitest';
import { pickRandomTrack } from '../game/randomPick';
import type { GameTrack } from '../game/types';

const track = (id: string): GameTrack => ({
  id,
  title: `Song ${id}`,
  artist: 'Artist',
  albumArtUrl: '',
  previewUrl: 'https://a/x',
  popularity: 50,
});

const pool = (n: number) => Array.from({ length: n }, (_, i) => track(String(i)));

describe('pickRandomTrack', () => {
  it('returns a song from the pool', () => {
    const picked = pickRandomTrack(pool(10));
    expect(pool(10).some((t) => t.id === picked?.id)).toBe(true);
  });

  it('never re-offers the song currently on the table', () => {
    // "Pick another" must actually produce another one, however the rng lands.
    for (let i = 0; i < 50; i++) {
      expect(pickRandomTrack(pool(4), '2')?.id).not.toBe('2');
    }
  });

  it('re-offers the only song rather than returning nothing', () => {
    expect(pickRandomTrack([track('solo')], 'solo')?.id).toBe('solo');
  });

  it('returns undefined when there is nothing to pick', () => {
    expect(pickRandomTrack([])).toBeUndefined();
  });

  it('can reach every song in the pool', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pickRandomTrack(pool(8))!.id);
    expect(seen.size).toBe(8);
  });
});
