import { describe, expect, it } from 'vitest';
import { createInitialState, gameReducer } from '../game/reducer';
import {
  isSoloMatch,
  pickBatchProgress,
  selectablePickerTracks,
  soloUnusedPool,
  scoreboard,
  currentRound,
} from '../game/selectors';
import { DEFAULT_MATCH_SETTINGS, slotsForCount, type GameState, type GameTrack, type MatchSettings } from '../game/types';

function tracks(prefix: string, count: number): GameTrack[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    title: `${prefix} Song ${i}`,
    artist: 'Artist',
    albumArtUrl: '',
    previewUrl: `https://preview/${prefix}-${i}`,
    popularity: 50,
  }));
}

/** Connects every player in the match and loads each a playlist, ending in the waiting room. */
function setUpMatch(overrides: Partial<MatchSettings> = {}): GameState {
  const settings = { ...DEFAULT_MATCH_SETTINGS, ...overrides };
  let state = gameReducer(createInitialState(), { type: 'START_MATCH', settings });

  slotsForCount(settings.playerCount).forEach((slot, index) => {
    if (index > 0) state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
    state = gameReducer(state, {
      type: 'PLAYER_CONNECTED',
      slot,
      spotifyUserId: `u-${slot}`,
      displayName: `Player ${index + 1}`,
    });
    state = gameReducer(state, { type: 'PLAYLIST_SELECTED', slot, tracks: tracks(slot.toLowerCase(), 20) });
  });

  return state;
}

function fillPickingBatch(state: GameState): GameState {
  let s = state;
  while ((s.phase.name === 'handoff' && s.phase.reason === 'startPickBatch') || s.phase.name === 'pickBatch') {
    if (s.phase.name === 'handoff') s = gameReducer(s, { type: 'HANDOFF_ACKNOWLEDGED' });
    while (s.phase.name === 'pickBatch') {
      s = gameReducer(s, { type: 'PICKER_SELECTED_TRACK', trackId: selectablePickerTracks(s)[0].id });
    }
  }
  return s;
}

describe('setup with more than two players', () => {
  it('walks every player through connect + playlist before starting', () => {
    let state = gameReducer(createInitialState(), {
      type: 'START_MATCH',
      settings: { ...DEFAULT_MATCH_SETTINGS, playerCount: 4 },
    });

    for (const slot of ['P1', 'P2', 'P3', 'P4'] as const) {
      if (slot !== 'P1') {
        expect(state.phase).toEqual({ name: 'handoff', toSlot: slot, reason: 'connectNext' });
        state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
      }
      expect(state.phase).toEqual({ name: 'connect', slot });
      state = gameReducer(state, { type: 'PLAYER_CONNECTED', slot, spotifyUserId: `u-${slot}`, displayName: slot });
      state = gameReducer(state, { type: 'PLAYLIST_SELECTED', slot, tracks: tracks(slot, 20) });
    }

    expect(state.phase).toEqual({ name: 'waitingRoom' });
    expect(state.rounds).toHaveLength(DEFAULT_MATCH_SETTINGS.roundsPerPlayer * 4);
  });
});

describe('picking blocks with five players', () => {
  it('passes around the whole table once, each picking for the player before them', () => {
    let state = setUpMatch({ playerCount: 5, roundsPerPlayer: 5 });
    state = gameReducer(state, { type: 'READY_UP' });

    const pickOrder: string[] = [];
    while (state.phase.name === 'handoff' && state.phase.reason === 'startPickBatch') {
      pickOrder.push(state.phase.toSlot);
      state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
      expect(pickBatchProgress(state).total).toBe(5);
      while (state.phase.name === 'pickBatch') {
        state = gameReducer(state, { type: 'PICKER_SELECTED_TRACK', trackId: selectablePickerTracks(state)[0].id });
      }
    }

    // One handoff each, in rotation order starting with round 1's picker.
    expect(pickOrder).toEqual(['P2', 'P3', 'P4', 'P5', 'P1']);
    expect(state.rounds.every((r) => !!r.pickedTrackId)).toBe(true);
    expect(state.phase).toEqual({ name: 'handoff', toSlot: 'P1', reason: 'startGuesserPhase' });
  });

  it('shows each picker the playlist of the player they are picking for', () => {
    let state = setUpMatch({ playerCount: 3 });
    state = gameReducer(state, { type: 'READY_UP' });
    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });

    // P2 picks for P1, so P2 browses P1's playlist — never their own.
    expect(state.phase).toEqual({ name: 'pickBatch', picker: 'P2' });
    expect(pickBatchProgress(state).guesser).toBe('P1');
    expect(selectablePickerTracks(state).every((t) => t.id.startsWith('p1-'))).toBe(true);
  });

  it('scores each player independently through a full 3-player match', () => {
    let state = setUpMatch({ playerCount: 3, roundsPerPlayer: 1 });
    state = gameReducer(state, { type: 'READY_UP' });
    state = fillPickingBatch(state);

    // P1 nails it, P2 gives up, P3 nails it.
    for (const outcome of ['correct', 'giveUp', 'correct'] as const) {
      state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
      const round = currentRound(state)!;
      const track = state.playlists[round.guesser]!.find((t) => t.id === round.pickedTrackId)!;
      state =
        outcome === 'correct'
          ? gameReducer(state, { type: 'GUESSER_GUESS_SUBMITTED', guessText: track.title })
          : gameReducer(state, { type: 'GUESSER_GAVE_UP' });
      state = gameReducer(state, { type: 'REVEAL_NEXT' });
    }

    expect(state.phase).toEqual({ name: 'finalResults' });
    // P1 and P3 guessed on attempt 1 (+75). P2 missed, so P2's picker (P3) takes the +10 bonus.
    expect(state.scores).toMatchObject({ P1: 75, P2: 0, P3: 85 });
    expect(scoreboard(state).map((r) => r.slot)).toEqual(['P3', 'P1', 'P2']);
  });
});

describe('solo matches', () => {
  it('skips connecting anyone else and starts guessing immediately', () => {
    let state = setUpMatch({ playerCount: 1, roundsPerPlayer: 3 });

    expect(isSoloMatch(state)).toBe(true);
    expect(state.phase).toEqual({ name: 'waitingRoom' });
    expect(state.rounds).toHaveLength(3);
    expect(state.rounds.every((r) => r.picker === undefined)).toBe(true);

    // No picking block and no handoff — there is nobody to pass the device to.
    state = gameReducer(state, { type: 'READY_UP' });
    expect(state.phase).toEqual({ name: 'guesserPhase', roundNumber: 1 });
  });

  it('takes its song from the pool the screen draws, and never reuses one', () => {
    let state = setUpMatch({ playerCount: 1, roundsPerPlayer: 3 });
    state = gameReducer(state, { type: 'READY_UP' });

    const used: string[] = [];
    for (let round = 0; round < 3; round++) {
      const pool = soloUnusedPool(state);
      expect(pool.every((t) => !used.includes(t.id))).toBe(true);

      const drawn = pool[0];
      state = gameReducer(state, { type: 'SOLO_TRACK_ASSIGNED', trackId: drawn.id });
      used.push(drawn.id);
      expect(currentRound(state)?.pickedTrackId).toBe(drawn.id);

      state = gameReducer(state, { type: 'GUESSER_GUESS_SUBMITTED', guessText: drawn.title });
      expect(state.phase).toEqual({ name: 'reveal', roundNumber: round + 1 });
      if (round < 2) state = gameReducer(state, { type: 'REVEAL_NEXT' });
    }

    expect(new Set(used).size).toBe(3);
    expect(state.scores.P1).toBe(225); // three attempt-1 guesses at 75
  });

  it('awards nobody the miss bonus, since there is no picker', () => {
    let state = setUpMatch({ playerCount: 1, roundsPerPlayer: 1 });
    state = gameReducer(state, { type: 'READY_UP' });
    state = gameReducer(state, { type: 'SOLO_TRACK_ASSIGNED', trackId: soloUnusedPool(state)[0].id });
    state = gameReducer(state, { type: 'GUESSER_GAVE_UP' });

    expect(currentRound(state)?.pointsAwardedToPicker).toBe(0);
    expect(state.scores.P1).toBe(0);
  });

  it('ends at final results rather than sudden death, however it finishes', () => {
    let state = setUpMatch({ playerCount: 1, roundsPerPlayer: 1 });
    state = gameReducer(state, { type: 'READY_UP' });
    state = gameReducer(state, { type: 'SOLO_TRACK_ASSIGNED', trackId: soloUnusedPool(state)[0].id });
    state = gameReducer(state, { type: 'GUESSER_GAVE_UP' });
    state = gameReducer(state, { type: 'REVEAL_NEXT' });

    expect(state.phase).toEqual({ name: 'finalResults' });
  });

  it('ignores a solo draw in a multiplayer match', () => {
    let state = setUpMatch({ playerCount: 2 });
    state = gameReducer(state, { type: 'READY_UP' });
    const before = state;
    state = gameReducer(state, { type: 'SOLO_TRACK_ASSIGNED', trackId: 'p1-0' });
    expect(state).toBe(before);
  });
});
