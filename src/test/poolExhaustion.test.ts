import { describe, expect, it } from 'vitest';
import { pickRandomTrack } from '../game/randomPick';
import { createInitialState } from '../game/reducer';
import { buildRoundOrder } from '../game/roundLogic';
import { combinedUnusedPool, selectablePickerTracks, soloUnusedPool } from '../game/selectors';
import type { GameState, GameTrack } from '../game/types';

function track(id: string): GameTrack {
  return { id, title: `Song ${id}`, artist: 'A Band', albumArtUrl: '', previewUrl: `p-${id}`, popularity: 50 };
}

function tracks(count: number, prefix: string): GameTrack[] {
  return Array.from({ length: count }, (_, i) => track(`${prefix}${i}`));
}

/**
 * A match deeper than its playlists: `minPlayableTracks` accepts a 10-song playlist while the
 * settings allow 20 rounds per player, so the used-song pool runs dry mid-match. Every one of
 * these pools feeds a random draw, and a draw that comes back empty used to leave the screen
 * showing "Drawing a song…" forever with no button to press.
 */
function exhaustedState(overrides: Partial<GameState> = {}): GameState {
  const base = createInitialState();
  const p1 = tracks(3, 'a');
  const p2 = tracks(3, 'b');
  return {
    ...base,
    settings: { ...base.settings, playerCount: 2, roundsPerPlayer: 5 },
    playlists: { P1: p1, P2: p2 },
    rounds: buildRoundOrder(5, 2),
    // Everything already heard.
    usedTrackIds: new Set([...p1, ...p2].map((t) => t.id)),
    ...overrides,
  };
}

describe('song pools once every song has been used', () => {
  it('falls back to the full solo playlist rather than nothing', () => {
    const state = exhaustedState({ settings: { ...createInitialState().settings, playerCount: 1 } });

    const pool = soloUnusedPool(state);

    expect(pool).toHaveLength(3);
    expect(pickRandomTrack(pool)).toBeDefined();
  });

  it('falls back to every match track for a sudden-death draw', () => {
    const pool = combinedUnusedPool(exhaustedState());

    expect(pool).toHaveLength(6);
    expect(pickRandomTrack(pool)).toBeDefined();
  });

  it('still offers the Picker something to pick', () => {
    const state = exhaustedState({ phase: { name: 'pickBatch', picker: 'P2' } });

    const pool = selectablePickerTracks(state);

    expect(pool.length).toBeGreaterThan(0);
    expect(pickRandomTrack(pool)).toBeDefined();
  });

  it('leaves an empty playlist empty — a fallback cannot invent songs', () => {
    const state = exhaustedState({ playlists: {} });

    expect(soloUnusedPool(state)).toEqual([]);
    expect(combinedUnusedPool(state)).toEqual([]);
  });
});

describe('song pools while unused songs remain', () => {
  it('still excludes what has already been heard', () => {
    const base = createInitialState();
    const p1 = tracks(3, 'a');
    const state: GameState = {
      ...base,
      settings: { ...base.settings, playerCount: 1 },
      playlists: { P1: p1 },
      usedTrackIds: new Set(['a0']),
    };

    expect(soloUnusedPool(state).map((t) => t.id)).toEqual(['a1', 'a2']);
  });

  it('keeps a Picker from re-offering a song already used this match', () => {
    const base = createInitialState();
    const state: GameState = {
      ...base,
      settings: { ...base.settings, playerCount: 2 },
      playlists: { P1: tracks(4, 'a'), P2: tracks(4, 'b') },
      rounds: buildRoundOrder(2, 2),
      usedTrackIds: new Set(['a0', 'a1']),
      phase: { name: 'pickBatch', picker: 'P2' },
    };

    // P2 picks for P1, so the pool is P1's playlist minus what P1 has already heard.
    expect(selectablePickerTracks(state).map((t) => t.id)).toEqual(['a2', 'a3']);
  });
});
