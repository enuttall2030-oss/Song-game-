import { describe, expect, it } from 'vitest';
import { createInitialState, gameReducer } from '../game/reducer';
import {
  currentRound,
  pickBatchProgress,
  selectablePickerTracks,
  tracksForActiveRound,
} from '../game/selectors';
import { DEFAULT_MATCH_SETTINGS, type GameState, type GameTrack, type PlayerSlot } from '../game/types';

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

/** Drives the reducer through setup (both players connected + playlists loaded) for reuse. */
function setUpMatch(settings = DEFAULT_MATCH_SETTINGS): GameState {
  let state = createInitialState();
  state = gameReducer(state, { type: 'START_MATCH', settings });
  state = gameReducer(state, { type: 'PLAYER_CONNECTED', slot: 'P1', spotifyUserId: 'u1', displayName: 'Alice' });
  state = gameReducer(state, { type: 'PLAYLIST_SELECTED', slot: 'P1', tracks: tracks('p1', 12) });
  state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
  state = gameReducer(state, { type: 'PLAYER_CONNECTED', slot: 'P2', spotifyUserId: 'u2', displayName: 'Bob' });
  state = gameReducer(state, { type: 'PLAYLIST_SELECTED', slot: 'P2', tracks: tracks('p2', 12) });
  return state;
}

/**
 * Fills every pending pick in the current block, for both players, leaving the state at the
 * handoff to the first Guesser — what two people do at the table before play starts.
 */
function fillPickingBatch(state: GameState): GameState {
  let s = state;
  // Accepts either entry point: waiting at the handoff into a block, or already picking.
  while ((s.phase.name === 'handoff' && s.phase.reason === 'startPickBatch') || s.phase.name === 'pickBatch') {
    if (s.phase.name === 'handoff') s = gameReducer(s, { type: 'HANDOFF_ACKNOWLEDGED' });
    while (s.phase.name === 'pickBatch') {
      s = gameReducer(s, { type: 'PICKER_SELECTED_TRACK', trackId: selectablePickerTracks(s)[0].id });
    }
  }
  return s;
}

describe('setup flow', () => {
  it('walks Home -> Connect P1 -> Playlist P1 -> Handoff -> Connect P2 -> Playlist P2 -> Waiting Room', () => {
    let state = createInitialState();
    expect(state.phase).toEqual({ name: 'home' });

    state = gameReducer(state, { type: 'START_MATCH', settings: DEFAULT_MATCH_SETTINGS });
    expect(state.phase).toEqual({ name: 'connect', slot: 'P1' });

    state = gameReducer(state, { type: 'PLAYER_CONNECTED', slot: 'P1', spotifyUserId: 'u1', displayName: 'Alice' });
    expect(state.phase).toEqual({ name: 'playlistPick', slot: 'P1' });

    state = gameReducer(state, { type: 'PLAYLIST_SELECTED', slot: 'P1', tracks: tracks('p1', 12) });
    expect(state.phase).toEqual({ name: 'handoff', toSlot: 'P2', reason: 'connectNext' });

    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
    expect(state.phase).toEqual({ name: 'connect', slot: 'P2' });

    state = gameReducer(state, { type: 'PLAYER_CONNECTED', slot: 'P2', spotifyUserId: 'u2', displayName: 'Bob' });
    state = gameReducer(state, { type: 'PLAYLIST_SELECTED', slot: 'P2', tracks: tracks('p2', 12) });
    expect(state.phase).toEqual({ name: 'waitingRoom' });
    expect(state.rounds).toHaveLength(DEFAULT_MATCH_SETTINGS.roundsPerPlayer * DEFAULT_MATCH_SETTINGS.playerCount);
  });

  it('rejects a playlist below the minimum playable-track count and stays put', () => {
    let state = createInitialState();
    state = gameReducer(state, { type: 'START_MATCH', settings: DEFAULT_MATCH_SETTINGS });
    state = gameReducer(state, { type: 'PLAYER_CONNECTED', slot: 'P1', spotifyUserId: 'u1', displayName: 'Alice' });
    state = gameReducer(state, { type: 'PLAYLIST_SELECTED', slot: 'P1', tracks: tracks('p1', 3) });

    expect(state.phase).toEqual({ name: 'playlistPick', slot: 'P1' });
    expect(state.errorMessage).toMatch(/at least 10/);
  });
});

describe('picking blocks', () => {
  it('has each player pick five songs up front, one handoff each instead of two per round', () => {
    let state = setUpMatch();
    state = gameReducer(state, { type: 'READY_UP' });
    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });

    // P2 picks all five of P1's songs without the device changing hands.
    for (let i = 0; i < 5; i++) {
      expect(state.phase).toEqual({ name: 'pickBatch', picker: 'P2' });
      expect(pickBatchProgress(state)).toMatchObject({ done: i, total: 5 });
      state = gameReducer(state, { type: 'PICKER_SELECTED_TRACK', trackId: `p1-${i}` });
    }

    // Only now does it pass to P1 to pick theirs.
    expect(state.phase).toEqual({ name: 'handoff', toSlot: 'P1', reason: 'startPickBatch' });
    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
    for (let i = 0; i < 5; i++) {
      expect(state.phase).toEqual({ name: 'pickBatch', picker: 'P1' });
      state = gameReducer(state, { type: 'PICKER_SELECTED_TRACK', trackId: `p2-${i}` });
    }

    // Every round now has a song, and play starts with round 1's guesser.
    expect(state.phase).toEqual({ name: 'handoff', toSlot: 'P1', reason: 'startGuesserPhase' });
    expect(state.rounds.every((r) => !!r.pickedTrackId)).toBe(true);
  });

  it("fills the picker's rounds in play order", () => {
    let state = setUpMatch();
    state = gameReducer(state, { type: 'READY_UP' });
    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
    state = gameReducer(state, { type: 'PICKER_SELECTED_TRACK', trackId: 'p1-7' });
    state = gameReducer(state, { type: 'PICKER_SELECTED_TRACK', trackId: 'p1-3' });

    // P2 picks rounds 1, 3, 5… — the first song chosen is the first one heard.
    expect(state.rounds[0].pickedTrackId).toBe('p1-7');
    expect(state.rounds[2].pickedTrackId).toBe('p1-3');
    expect(state.rounds[1].pickedTrackId).toBeUndefined();
  });

  it('keeps a hint with the round it was written for', () => {
    let state = setUpMatch();
    state = gameReducer(state, { type: 'READY_UP' });
    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
    state = gameReducer(state, { type: 'PICKER_SELECTED_TRACK', trackId: 'p1-0' });
    state = gameReducer(state, { type: 'PICKER_SELECTED_TRACK', trackId: 'p1-1', hint: 'second one' });

    expect(state.rounds[0].hint).toBeUndefined();
    expect(state.rounds[2].hint).toBe('second one');
  });

  it('cannot pick the same song twice within a block', () => {
    let state = setUpMatch();
    state = gameReducer(state, { type: 'READY_UP' });
    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
    state = gameReducer(state, { type: 'PICKER_SELECTED_TRACK', trackId: 'p1-0' });

    expect(state.usedTrackIds.has('p1-0')).toBe(true);
    expect(selectablePickerTracks(state).some((t) => t.id === 'p1-0')).toBe(false);
  });

  it('shows each picker their opponent\'s playlist, both halves of the block', () => {
    let state = setUpMatch();
    state = gameReducer(state, { type: 'READY_UP' });
    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
    expect(selectablePickerTracks(state).every((t) => t.id.startsWith('p1-'))).toBe(true);

    for (let i = 0; i < 5; i++) {
      state = gameReducer(state, { type: 'PICKER_SELECTED_TRACK', trackId: `p1-${i}` });
    }
    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });

    // P1 is picking now: they must see P2's playlist, even though the current round's guesser is P1.
    expect(state.phase).toEqual({ name: 'pickBatch', picker: 'P1' });
    expect(currentRound(state)?.guesser).toBe('P1');
    expect(selectablePickerTracks(state).every((t) => t.id.startsWith('p2-'))).toBe(true);
  });

  it('starts a fresh block once the picked songs run out mid-match', () => {
    // 7 rounds each = 14 rounds: a full block of 5+5, then a short block of 2+2.
    let state = setUpMatch({ ...DEFAULT_MATCH_SETTINGS, roundsPerPlayer: 7 });
    state = gameReducer(state, { type: 'READY_UP' });
    state = fillPickingBatch(state);

    expect(state.rounds.slice(0, 10).every((r) => !!r.pickedTrackId)).toBe(true);
    expect(state.rounds.slice(10).every((r) => !r.pickedTrackId)).toBe(true);

    // Play the first block out.
    for (let i = 0; i < 10; i++) {
      state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
      state = gameReducer(state, { type: 'GUESSER_GAVE_UP' });
      state = gameReducer(state, { type: 'REVEAL_NEXT' });
    }

    // Round 11 has no song, so a new block starts with that round's picker.
    expect(state.currentRoundIndex).toBe(10);
    expect(state.phase).toEqual({ name: 'handoff', toSlot: 'P2', reason: 'startPickBatch' });
    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
    expect(pickBatchProgress(state)).toMatchObject({ done: 0, total: 2 });

    state = fillPickingBatch(state);
    expect(state.rounds.every((r) => !!r.pickedTrackId)).toBe(true);
    expect(state.phase).toEqual({ name: 'handoff', toSlot: 'P1', reason: 'startGuesserPhase' });
  });
});

describe('turn loop', () => {
  it('routes the Picker to the Guesser\'s own playlist, not their own', () => {
    let state = setUpMatch();
    state = gameReducer(state, { type: 'READY_UP' });

    // Round 1: P1 guesses, P2 picks -> P2 picks first, from P1's playlist.
    expect(state.phase).toEqual({ name: 'handoff', toSlot: 'P2', reason: 'startPickBatch' });
    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
    expect(state.phase).toEqual({ name: 'pickBatch', picker: 'P2' });
    expect(currentRound(state)).toMatchObject({ guesser: 'P1', picker: 'P2' });
    expect(selectablePickerTracks(state).every((t) => t.id.startsWith('p1-'))).toBe(true);
  });

  it('a correct guess on attempt 1 awards 75 points and moves to reveal', () => {
    let state = setUpMatch();
    state = gameReducer(state, { type: 'READY_UP' });
    state = fillPickingBatch(state);

    expect(state.phase).toEqual({ name: 'handoff', toSlot: 'P1', reason: 'startGuesserPhase' });
    expect(state.usedTrackIds.has('p1-0')).toBe(true);

    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' }); // -> guesserPhase round 1
    expect(state.phase).toEqual({ name: 'guesserPhase', roundNumber: 1 });

    state = gameReducer(state, { type: 'GUESSER_GUESS_SUBMITTED', guessText: 'p1 song 0' });
    expect(state.phase).toEqual({ name: 'reveal', roundNumber: 1 });
    expect(state.scores.P1).toBe(75);
    expect(state.scores.P2).toBe(0);
  });

  it('escalates through the attempt ladder on wrong guesses, then awards fewer points', () => {
    let state = setUpMatch();
    state = gameReducer(state, { type: 'READY_UP' });
    state = fillPickingBatch(state);
    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });

    state = gameReducer(state, { type: 'GUESSER_GUESS_SUBMITTED', guessText: 'totally wrong title' });
    expect(currentRound(state)?.attemptsUsed).toBe(1);
    expect(state.phase).toEqual({ name: 'guesserPhase', roundNumber: 1 });

    state = gameReducer(state, { type: 'GUESSER_SKIPPED' });
    expect(currentRound(state)?.attemptsUsed).toBe(2);

    state = gameReducer(state, { type: 'GUESSER_GUESS_SUBMITTED', guessText: 'p1 song 0' });
    expect(state.scores.P1).toBe(30); // correct on attempt 3
  });

  it('awards the picker bonus and 0 to the guesser when all 5 attempts fail', () => {
    let state = setUpMatch();
    state = gameReducer(state, { type: 'READY_UP' });
    state = fillPickingBatch(state);
    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });

    for (let i = 0; i < 5; i++) {
      state = gameReducer(state, { type: 'GUESSER_SKIPPED' });
    }

    expect(state.phase).toEqual({ name: 'reveal', roundNumber: 1 });
    expect(state.scores.P1).toBe(0);
    expect(state.scores.P2).toBe(10); // picker bonus
    expect(currentRound(state)?.outcome).toBe('exhausted');
  });

  it('goes straight to the next Guesser after a reveal, with no picking step in between', () => {
    let state = setUpMatch();
    state = gameReducer(state, { type: 'READY_UP' });
    state = fillPickingBatch(state);
    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
    state = gameReducer(state, { type: 'GUESSER_GUESS_SUBMITTED', guessText: 'p1 song 0' });

    state = gameReducer(state, { type: 'REVEAL_NEXT' });
    expect(state.phase).toEqual({ name: 'handoff', toSlot: 'P2', reason: 'startGuesserPhase' });
    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
    expect(state.phase).toEqual({ name: 'guesserPhase', roundNumber: 2 });
    expect(currentRound(state)).toMatchObject({ guesser: 'P2', picker: 'P1' });
  });
});

describe('match completion', () => {
  /** Plays the pre-picked song for the current round, guessed right on the first snippet. */
  function playCurrentRoundCorrectly(state: GameState): GameState {
    const s = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' }); // -> guesserPhase
    const round = currentRound(s)!;
    const track = tracksForActiveRound(s).find((t) => t.id === round.pickedTrackId)!;
    return gameReducer(s, { type: 'GUESSER_GUESS_SUBMITTED', guessText: track.title });
  }

  it('goes to final results once all rounds are played and scores are not tied', () => {
    let state = setUpMatch({ ...DEFAULT_MATCH_SETTINGS, roundsPerPlayer: 1 });
    state = gameReducer(state, { type: 'READY_UP' });
    state = fillPickingBatch(state);

    // Round 1: P1 guesses correctly on attempt 1 (+75 to P1).
    state = playCurrentRoundCorrectly(state);
    state = gameReducer(state, { type: 'REVEAL_NEXT' });

    // Round 2: P2 guesses, then gives up entirely (0 to P2, +10 picker bonus to P1).
    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
    for (let i = 0; i < 5; i++) state = gameReducer(state, { type: 'GUESSER_SKIPPED' });
    state = gameReducer(state, { type: 'REVEAL_NEXT' });

    expect(state.phase).toEqual({ name: 'finalResults' });
    expect(state.scores).toMatchObject({ P1: 85, P2: 0 });
  });

  it('goes to sudden death when the match ends tied', () => {
    let state = setUpMatch({ ...DEFAULT_MATCH_SETTINGS, roundsPerPlayer: 1, pickerScoresOnFailure: false });
    state = gameReducer(state, { type: 'READY_UP' });
    state = fillPickingBatch(state);

    // Both rounds: guessed correctly on the final attempt (10 pts each) -> tied 10-10.
    for (let round = 0; round < 2; round++) {
      state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
      const picked = currentRound(state)!.pickedTrackId;
      const track = tracksForActiveRound(state).find((t) => t.id === picked)!;
      for (let i = 0; i < 4; i++) state = gameReducer(state, { type: 'GUESSER_SKIPPED' });
      state = gameReducer(state, { type: 'GUESSER_GUESS_SUBMITTED', guessText: track.title });
      state = gameReducer(state, { type: 'REVEAL_NEXT' });
    }

    expect(state.scores).toMatchObject({ P1: 10, P2: 10 });
    expect(state.phase).toEqual({ name: 'suddenDeath' });
  });
});

describe('sudden death', () => {
  /** A finished, tied match with the sudden-death queue already seeded, as REVEAL_NEXT leaves it. */
  function tiedMatch(scores: Partial<Record<PlayerSlot, number>>, queue: PlayerSlot[], playerCount = 2): GameState {
    const state = setUpMatch({ ...DEFAULT_MATCH_SETTINGS, roundsPerPlayer: 1, playerCount });
    return {
      ...state,
      phase: { name: 'suddenDeath' },
      scores: { ...state.scores, ...scores },
      suddenDeathQueue: queue,
    };
  }

  it('takes its guesser from the queue and skips straight to the guesser phase', () => {
    let state = tiedMatch({ P1: 10, P2: 10 }, ['P1', 'P2']);
    const track = state.playlists.P1![0];

    state = gameReducer(state, { type: 'SUDDEN_DEATH_TRACK_SELECTED', track });

    expect(state.phase).toEqual({ name: 'guesserPhase', roundNumber: state.rounds.length + 1 });
    expect(state.suddenDeathRounds.at(-1)).toMatchObject({ guesser: 'P1', pickedTrackId: track.id });
    expect(state.suddenDeathQueue).toEqual(['P2']); // P2 still owed a turn
  });

  it('gives every tied player a turn before judging the tie again', () => {
    let state = tiedMatch({ P1: 10, P2: 10 }, ['P1', 'P2']);

    // P1 nails it on the first snippet.
    const p1Track = state.playlists.P1![0];
    state = gameReducer(state, { type: 'SUDDEN_DEATH_TRACK_SELECTED', track: p1Track });
    state = gameReducer(state, { type: 'GUESSER_GUESS_SUBMITTED', guessText: p1Track.title });

    // Not over yet: P2 is still owed their turn, even though P1 is now ahead.
    expect(state.phase).toEqual({ name: 'suddenDeath' });
    expect(state.scores.P1).toBe(85);

    const p2Track = state.playlists.P2![1];
    state = gameReducer(state, { type: 'SUDDEN_DEATH_TRACK_SELECTED', track: p2Track });
    state = gameReducer(state, { type: 'GUESSER_GAVE_UP' });

    expect(state.phase).toEqual({ name: 'finalResults' });
    expect(state.scores.P1).toBe(85);
    expect(state.scores.P2).toBe(10);
  });

  it('runs another cycle when the tie-break is itself tied', () => {
    let state = tiedMatch({ P1: 10, P2: 10 }, ['P1', 'P2']);

    // Both players get their song, so the cycle scored but settled nothing: worth replaying,
    // because the players are demonstrably still able to break it.
    for (const slot of ['P1', 'P2'] as PlayerSlot[]) {
      const track = state.playlists[slot]![2];
      state = gameReducer(state, { type: 'SUDDEN_DEATH_TRACK_SELECTED', track });
      state = gameReducer(state, { type: 'GUESSER_GUESS_SUBMITTED', guessText: track.title });
    }

    // Still level, so a fresh cycle is queued rather than declaring a draw.
    expect(state.phase).toEqual({ name: 'suddenDeath' });
    expect(state.suddenDeathQueue).toEqual(['P1', 'P2']);
  });

  it('lets the tie stand once a whole cycle passes with nobody scoring', () => {
    // A cycle where everyone missed leaves the standings identical, so another cycle can only
    // replay it — the match used to become unfinishable, with no exit but closing the tab.
    let state = tiedMatch({ P1: 10, P2: 10 }, ['P1', 'P2']);

    for (const slot of ['P1', 'P2'] as PlayerSlot[]) {
      const track = state.playlists[slot]![2];
      state = gameReducer(state, { type: 'SUDDEN_DEATH_TRACK_SELECTED', track });
      state = gameReducer(state, { type: 'GUESSER_GAVE_UP' }); // 0 points either way
    }

    expect(state.phase).toEqual({ name: 'finalResults' });
    expect(state.suddenDeathQueue).toEqual([]);
    expect(state.scores.P1).toBe(state.scores.P2);
  });

  it('only calls up the players tied for the lead', () => {
    const state = tiedMatch({ P1: 90, P2: 90, P3: 20 }, [], 3);
    const decided = gameReducer(
      { ...state, phase: { name: 'reveal', roundNumber: 3 }, currentRoundIndex: state.rounds.length - 1 },
      { type: 'REVEAL_NEXT' },
    );
    expect(decided.phase).toEqual({ name: 'suddenDeath' });
    expect(decided.suddenDeathQueue).toEqual(['P1', 'P2']);
  });
});

describe('give up', () => {
  it('immediately ends the round at 0 points regardless of attempts remaining', () => {
    let state = setUpMatch();
    state = gameReducer(state, { type: 'READY_UP' });
    state = fillPickingBatch(state);
    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });

    state = gameReducer(state, { type: 'GUESSER_GAVE_UP' });

    expect(state.phase).toEqual({ name: 'reveal', roundNumber: 1 });
    expect(currentRound(state)?.outcome).toBe('exhausted');
    expect(currentRound(state)?.attemptsUsed).toBe(0);
    expect(state.scores.P1).toBe(0);
    expect(state.scores.P2).toBe(10);
  });
});

describe('auth errors', () => {
  it('AUTH_ERROR sets a user-visible error message', () => {
    const state = gameReducer(createInitialState(), { type: 'AUTH_ERROR', message: 'network blew up' });
    expect(state.errorMessage).toBe('network blew up');
  });
});

describe('rematch / new match', () => {
  it('REMATCH_SAME_PLAYLISTS keeps players/playlists but resets scores and rounds', () => {
    let state = setUpMatch();
    state = { ...state, scores: { ...state.scores, P1: 100, P2: 20 }, currentRoundIndex: 3 };
    state = gameReducer(state, { type: 'REMATCH_SAME_PLAYLISTS' });

    expect(state.scores).toMatchObject({ P1: 0, P2: 0 });
    expect(state.currentRoundIndex).toBe(0);
    expect(state.phase).toEqual({ name: 'waitingRoom' });
    expect(state.playlists.P1).toBeDefined();
  });

  it('NEW_MATCH resets everything back to home', () => {
    let state = setUpMatch();
    state = gameReducer(state, { type: 'NEW_MATCH' });
    expect(state.phase).toEqual({ name: 'home' });
    expect(state.players).toEqual({});
    expect(state.playlists).toEqual({});
  });
});
