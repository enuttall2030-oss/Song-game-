import { isGuessCorrect } from '../match/fuzzyMatch';
import { filterPlayableTracks } from '../match/playlistFilter';
import type { GameAction } from './actions';
import { buildRoundOrder, pendingPicksInBatch } from './roundLogic';
import { applyRoundToScores, isTied, leaders, scoreForCorrectGuess, scoreForExhaustedRound } from './scoring';
import { isFinalAttempt } from './snippetLadder';
import {
  ALL_PLAYER_SLOTS,
  DEFAULT_MATCH_SETTINGS,
  slotsForCount,
  type GameState,
  type PlayerSlot,
  type RoundRecord,
} from './types';

export function createInitialState(): GameState {
  return {
    phase: { name: 'home' },
    settings: DEFAULT_MATCH_SETTINGS,
    players: {},
    playlists: {},
    rounds: [],
    currentRoundIndex: 0,
    scores: zeroScores(),
    usedTrackIds: new Set(),
    suddenDeathRounds: [],
    suddenDeathQueue: [],
  };
}

function zeroScores(): Record<PlayerSlot, number> {
  return ALL_PLAYER_SLOTS.reduce(
    (acc, slot) => ({ ...acc, [slot]: 0 }),
    {} as Record<PlayerSlot, number>,
  );
}

function matchSlots(state: GameState): PlayerSlot[] {
  return slotsForCount(state.settings.playerCount);
}

function isSolo(state: GameState): boolean {
  return state.settings.playerCount <= 1;
}

function isInSuddenDeath(state: GameState): boolean {
  return state.suddenDeathRounds.at(-1)?.outcome === 'pending';
}

/** The round currently being played: the live sudden-death record, else the current indexed round. */
function activeRound(state: GameState): RoundRecord | undefined {
  return isInSuddenDeath(state) ? state.suddenDeathRounds.at(-1) : state.rounds[state.currentRoundIndex];
}

function withActiveRound(state: GameState, updated: RoundRecord): GameState {
  if (isInSuddenDeath(state)) {
    return { ...state, suddenDeathRounds: [...state.suddenDeathRounds.slice(0, -1), updated] };
  }
  const rounds = state.rounds.map((r, i) => (i === state.currentRoundIndex ? updated : r));
  return { ...state, rounds };
}

/**
 * Where to go when round `roundIndex` is about to start. A round whose song was chosen during an
 * earlier picking block goes straight to its Guesser; reaching a round with no song means the
 * previous block is spent, so a fresh one starts with that round's Picker. Solo skips all of it —
 * there is nobody to hand the device to, and the song is drawn on the guessing screen itself.
 */
function startOfRoundPhase(state: GameState, roundIndex: number): GameState['phase'] {
  const round = state.rounds[roundIndex];
  if (isSolo(state)) {
    return { name: 'guesserPhase', roundNumber: round.roundNumber };
  }
  if (round.pickedTrackId) {
    return { name: 'handoff', toSlot: round.guesser, reason: 'startGuesserPhase' };
  }
  return { name: 'handoff', toSlot: round.picker!, reason: 'startPickBatch' };
}

/**
 * After a pick lands: keep the same Picker while they still owe songs, otherwise pass to the next
 * player in the rotation who still owes some, and only once the whole block is filled does play
 * begin. This is the point of batching — one handoff per player per block, not two per round.
 */
function afterPickHandoff(state: GameState, rounds: RoundRecord[], picker: PlayerSlot): GameState['phase'] {
  const { currentRoundIndex, settings } = state;
  const slots = matchSlots(state);
  const pending = (slot: PlayerSlot) =>
    pendingPicksInBatch(rounds, currentRoundIndex, settings.picksPerBatch, settings.playerCount, slot);

  if (pending(picker).length > 0) {
    return { name: 'pickBatch', picker };
  }

  const from = slots.indexOf(picker);
  for (let step = 1; step < slots.length; step++) {
    const candidate = slots[(from + step) % slots.length];
    if (pending(candidate).length > 0) {
      return { name: 'handoff', toSlot: candidate, reason: 'startPickBatch' };
    }
  }

  return { name: 'handoff', toSlot: rounds[currentRoundIndex].guesser, reason: 'startGuesserPhase' };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_MATCH': {
      return {
        ...createInitialState(),
        settings: action.settings,
        phase: { name: 'connect', slot: 'P1' },
      };
    }

    case 'PLAYER_CONNECTED': {
      return {
        ...state,
        players: {
          ...state.players,
          [action.slot]: {
            slot: action.slot,
            spotifyUserId: action.spotifyUserId,
            displayName: action.displayName,
          },
        },
        phase: { name: 'playlistPick', slot: action.slot },
      };
    }

    case 'SAME_ACCOUNT_DETECTED': {
      return {
        ...state,
        errorMessage:
          'That Spotify account is already in this match. Log out at accounts.spotify.com/logout or use a private window, then connect a different account.',
      };
    }

    case 'AUTH_ERROR': {
      return { ...state, errorMessage: action.message };
    }

    case 'PLAYLIST_SELECTED': {
      const { playableTracks, meetsMinimum } = filterPlayableTracks(
        action.tracks,
        state.settings.minPlayableTracks,
      );

      if (!meetsMinimum) {
        return {
          ...state,
          errorMessage: `Only ${playableTracks.length} of the ${action.tracks.length} tracks checked in this playlist have a matching preview clip — need at least ${state.settings.minPlayableTracks}. Pick a different playlist.`,
        };
      }

      const playlists = { ...state.playlists, [action.slot]: playableTracks };
      const cleared = { ...state, playlists, errorMessage: undefined };

      const slots = matchSlots(state);
      const nextSlot = slots[slots.indexOf(action.slot) + 1];
      if (nextSlot) {
        return { ...cleared, phase: { name: 'handoff', toSlot: nextSlot, reason: 'connectNext' } };
      }

      // Everyone is in: build the round schedule and head to the waiting room.
      const rounds = buildRoundOrder(state.settings.roundsPerPlayer, state.settings.playerCount);
      return { ...cleared, rounds, currentRoundIndex: 0, phase: { name: 'waitingRoom' } };
    }

    case 'DISMISS_ERROR': {
      return { ...state, errorMessage: undefined };
    }

    case 'HANDOFF_ACKNOWLEDGED': {
      if (state.phase.name !== 'handoff') return state;
      const { toSlot, reason } = state.phase;
      if (reason === 'connectNext') {
        return { ...state, phase: { name: 'connect', slot: toSlot } };
      }
      if (reason === 'startPickBatch') {
        return { ...state, phase: { name: 'pickBatch', picker: toSlot } };
      }
      // startGuesserPhase
      const round = state.rounds[state.currentRoundIndex];
      return { ...state, phase: { name: 'guesserPhase', roundNumber: round.roundNumber } };
    }

    case 'READY_UP': {
      if (state.phase.name !== 'waitingRoom' || state.rounds.length === 0) return state;
      return { ...state, phase: startOfRoundPhase(state, state.currentRoundIndex) };
    }

    case 'PICKER_SELECTED_TRACK': {
      if (state.phase.name !== 'pickBatch') return state;
      const picker = state.phase.picker;

      // Songs fill the picker's rounds in play order, so the first song they choose is the one
      // their opponent hears first.
      const [target] = pendingPicksInBatch(
        state.rounds,
        state.currentRoundIndex,
        state.settings.picksPerBatch,
        state.settings.playerCount,
        picker,
      );
      if (!target) return state;

      const rounds = state.rounds.map((r) =>
        r.roundNumber === target.roundNumber ? { ...r, pickedTrackId: action.trackId, hint: action.hint } : r,
      );

      return {
        ...state,
        rounds,
        usedTrackIds: new Set(state.usedTrackIds).add(action.trackId),
        phase: afterPickHandoff(state, rounds, picker),
      };
    }

    case 'SOLO_TRACK_ASSIGNED': {
      // Solo has no Picker, so the guessing screen draws a random unused song and reports it here.
      const round = state.rounds[state.currentRoundIndex];
      if (!isSolo(state) || !round || round.pickedTrackId) return state;
      const rounds = state.rounds.map((r, i) =>
        i === state.currentRoundIndex ? { ...r, pickedTrackId: action.trackId } : r,
      );
      return { ...state, rounds, usedTrackIds: new Set(state.usedTrackIds).add(action.trackId) };
    }

    case 'SNIPPET_OFFSET_LOCKED': {
      const round = activeRound(state);
      if (!round || round.snippetStartOffsetSec !== undefined) return state;
      return withActiveRound(state, { ...round, snippetStartOffsetSec: action.offsetSec });
    }

    case 'GUESSER_GUESS_SUBMITTED':
    case 'GUESSER_SKIPPED': {
      const round = activeRound(state);
      if (!round || !round.pickedTrackId) return state;

      const track = allMatchTracks(state).find((t) => t.id === round.pickedTrackId);
      const attempt = round.attemptsUsed + 1;

      const guessedCorrectly =
        action.type === 'GUESSER_GUESS_SUBMITTED' && !!track && isGuessCorrect(action.guessText, track.title);

      if (guessedCorrectly) {
        return finalizeRound(state, scoreForCorrectGuess(round, attempt));
      }

      if (isFinalAttempt(attempt)) {
        return finalizeRound(state, scoreForExhaustedRound({ ...round, attemptsUsed: attempt }, state.settings));
      }

      return withActiveRound(state, { ...round, attemptsUsed: attempt });
    }

    case 'GUESSER_GAVE_UP': {
      const round = activeRound(state);
      if (!round || !round.pickedTrackId) return state;
      return finalizeRound(state, scoreForExhaustedRound(round, state.settings));
    }

    case 'REVEAL_NEXT': {
      if (state.phase.name !== 'reveal') return state;
      const nextIndex = state.currentRoundIndex + 1;

      if (nextIndex < state.rounds.length) {
        const advanced = { ...state, currentRoundIndex: nextIndex };
        return { ...advanced, phase: startOfRoundPhase(advanced, nextIndex) };
      }

      return { ...state, ...endOfMatchPhase(state) };
    }

    case 'SUDDEN_DEATH_TRACK_SELECTED': {
      if (state.phase.name !== 'suddenDeath') return state;
      const [guesser, ...restOfQueue] = state.suddenDeathQueue;
      if (!guesser) return state;

      const suddenDeathRound: RoundRecord = {
        roundNumber: state.rounds.length + state.suddenDeathRounds.length + 1,
        guesser,
        pickedTrackId: action.track.id,
        attemptsUsed: 0,
        outcome: 'pending',
        pointsAwardedToGuesser: 0,
        pointsAwardedToPicker: 0,
      };
      return {
        ...state,
        suddenDeathRounds: [...state.suddenDeathRounds, suddenDeathRound],
        suddenDeathQueue: restOfQueue,
        usedTrackIds: new Set(state.usedTrackIds).add(action.track.id),
        phase: { name: 'guesserPhase', roundNumber: suddenDeathRound.roundNumber },
      };
    }

    case 'REMATCH_SAME_PLAYLISTS': {
      return {
        ...state,
        rounds: buildRoundOrder(state.settings.roundsPerPlayer, state.settings.playerCount),
        currentRoundIndex: 0,
        scores: zeroScores(),
        usedTrackIds: new Set(),
        suddenDeathRounds: [],
        suddenDeathQueue: [],
        phase: { name: 'waitingRoom' },
      };
    }

    case 'NEW_MATCH': {
      return createInitialState();
    }

    default:
      return state;
  }
}

/** Every track in play this match. Sudden-death songs can come from any player's playlist. */
function allMatchTracks(state: GameState) {
  return matchSlots(state).flatMap((slot) => state.playlists[slot] ?? []);
}

/**
 * The match is over: hand it to sudden death if the *lead* is shared, otherwise final results.
 * Every tied leader gets a sudden-death round before the tie is judged again.
 */
function endOfMatchPhase(state: GameState): Pick<GameState, 'phase' | 'suddenDeathQueue'> {
  const slots = matchSlots(state);
  if (isTied(state.scores, slots)) {
    return { phase: { name: 'suddenDeath' }, suddenDeathQueue: leaders(state.scores, slots) };
  }
  return { phase: { name: 'finalResults' }, suddenDeathQueue: [] };
}

/** Shared tail end of a round: applies points, decides whether we're in the sudden-death branch. */
function finalizeRound(state: GameState, finishedRound: RoundRecord): GameState {
  if (isInSuddenDeath(state)) {
    const scores = applyRoundToScores(state.scores, finishedRound);
    const settled = {
      ...state,
      scores,
      suddenDeathRounds: [...state.suddenDeathRounds.slice(0, -1), finishedRound],
    };

    // Everyone tied for the lead plays a round before the tie is re-judged; if they're still level
    // after that, another cycle runs rather than declaring a draw.
    if (settled.suddenDeathQueue.length > 0) {
      return { ...settled, phase: { name: 'suddenDeath' } };
    }
    return { ...settled, ...endOfMatchPhase(settled) };
  }

  const rounds = state.rounds.map((r, i) => (i === state.currentRoundIndex ? finishedRound : r));
  return {
    ...state,
    rounds,
    scores: applyRoundToScores(state.scores, finishedRound),
    phase: { name: 'reveal', roundNumber: finishedRound.roundNumber },
  };
}
