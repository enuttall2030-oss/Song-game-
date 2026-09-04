import { describe, expect, it } from 'vitest';
import type { GameAction } from '../game/actions';
import { createInitialState, gameReducer } from '../game/reducer';
import { buildRoundOrder } from '../game/roundLogic';
import type { GameState, GameTrack } from '../game/types';

function track(id: string): GameTrack {
  return { id, title: `Song ${id}`, artist: 'A Band', albumArtUrl: '', previewUrl: `p-${id}`, popularity: 50 };
}

function tracks(count: number, prefix: string): GameTrack[] {
  return Array.from({ length: count }, (_, i) => track(`${prefix}${i}`));
}

/** A finished match sitting on a dead-level scoreboard, i.e. about to enter sudden death. */
function tiedMatch(playerCount: number, score: number): GameState {
  const base = createInitialState();
  const slots = ['P1', 'P2', 'P3', 'P4', 'P5'].slice(0, playerCount) as GameState['rounds'][number]['guesser'][];
  const rounds = buildRoundOrder(1, playerCount).map((r) => ({ ...r, outcome: 'correct' as const }));
  return {
    ...base,
    settings: { ...base.settings, playerCount, roundsPerPlayer: 1 },
    players: Object.fromEntries(
      slots.map((slot) => [slot, { slot, spotifyUserId: `u-${slot}`, displayName: String(slot) }]),
    ),
    playlists: Object.fromEntries(slots.map((slot, i) => [slot, tracks(6, `${i}`)])),
    rounds,
    currentRoundIndex: rounds.length - 1,
    scores: { ...base.scores, ...Object.fromEntries(slots.map((slot) => [slot, score])) },
    phase: { name: 'reveal', roundNumber: rounds.length },
  };
}

const run = (state: GameState, actions: GameAction[]): GameState => actions.reduce(gameReducer, state);

/** Plays out one full tie-break cycle in which every tied player misses. */
function missOneCycle(state: GameState): GameState {
  let next = state;
  let guard = 0;
  while (next.phase.name === 'suddenDeath' && guard++ < 10) {
    const drawn = next.playlists[next.suddenDeathQueue[0]!]?.[0] ?? track('fallback');
    next = run(next, [
      { type: 'SUDDEN_DEATH_TRACK_SELECTED', track: drawn },
      { type: 'GUESSER_GAVE_UP' },
    ]);
  }
  return next;
}

describe('sudden death termination', () => {
  // The bug this guards: a cycle where nobody scores leaves the standings untouched, so the
  // reducer started an identical cycle, forever. Observed live running past round 28 with no way
  // out of the app but closing the tab.
  it('stops after a cycle in which every tied player missed, rather than looping forever', () => {
    const entered = gameReducer(tiedMatch(2, 75), { type: 'REVEAL_NEXT' });
    expect(entered.phase.name).toBe('suddenDeath');

    const after = missOneCycle(entered);

    expect(after.phase.name).toBe('finalResults');
    expect(after.suddenDeathQueue).toEqual([]);
    expect(after.suddenDeathRounds).toHaveLength(2);
  });

  it('terminates with three tied players who all miss', () => {
    const entered = gameReducer(tiedMatch(3, 50), { type: 'REVEAL_NEXT' });

    const after = missOneCycle(entered);

    expect(after.phase.name).toBe('finalResults');
    expect(after.suddenDeathRounds).toHaveLength(3);
    // Still level: the tie stands rather than being broken arbitrarily.
    expect(after.scores.P1).toBe(after.scores.P2);
    expect(after.scores.P2).toBe(after.scores.P3);
  });

  it('still runs another cycle when someone did score but the lead is shared again', () => {
    // Both players score the same amount, so the tie survives a *productive* cycle — that is
    // worth replaying, because the players are still making progress.
    let state = gameReducer(tiedMatch(2, 75), { type: 'REVEAL_NEXT' });
    for (const slot of ['P1', 'P2'] as const) {
      const drawn = state.playlists[state.suddenDeathQueue[0]!]![0];
      state = run(state, [
        { type: 'SUDDEN_DEATH_TRACK_SELECTED', track: drawn },
        { type: 'GUESSER_GUESS_SUBMITTED', guessText: drawn.title },
      ]);
      expect(slot).toBeTruthy();
    }

    expect(state.phase.name).toBe('suddenDeath');
    expect(state.suddenDeathQueue).toHaveLength(2);
  });

  it('ends the match the moment a cycle actually breaks the tie', () => {
    let state = gameReducer(tiedMatch(2, 75), { type: 'REVEAL_NEXT' });

    // P1 gets it, P2 does not.
    const first = state.playlists[state.suddenDeathQueue[0]!]![0];
    state = run(state, [
      { type: 'SUDDEN_DEATH_TRACK_SELECTED', track: first },
      { type: 'GUESSER_GUESS_SUBMITTED', guessText: first.title },
    ]);
    const second = state.playlists[state.suddenDeathQueue[0]!]![1];
    state = run(state, [
      { type: 'SUDDEN_DEATH_TRACK_SELECTED', track: second },
      { type: 'GUESSER_GAVE_UP' },
    ]);

    expect(state.phase.name).toBe('finalResults');
    expect(state.scores.P1).toBeGreaterThan(state.scores.P2);
  });
});
