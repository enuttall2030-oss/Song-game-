import { standings } from './scoring';
import { batchRange, pendingPicksInBatch } from './roundLogic';
import { slotsForCount, type GameState, type GameTrack, type PlayerInfo, type PlayerSlot, type RoundRecord } from './types';

export function matchSlots(state: GameState): PlayerSlot[] {
  return slotsForCount(state.settings.playerCount);
}

export function isSoloMatch(state: GameState): boolean {
  return state.settings.playerCount <= 1;
}

export function currentRound(state: GameState): RoundRecord | undefined {
  return state.rounds[state.currentRoundIndex];
}

/**
 * The round actually being played right now: the live sudden-death record (they live outside
 * `rounds`/`currentRoundIndex`), otherwise the current indexed round. Screens should read this
 * rather than `currentRound` so sudden death "just works" without special-casing.
 */
export function activeRound(state: GameState): RoundRecord | undefined {
  const latestSuddenDeath = state.suddenDeathRounds.at(-1);
  if (latestSuddenDeath?.outcome === 'pending') return latestSuddenDeath;
  return currentRound(state);
}

/** Every track in play this match, across all players' playlists. */
export function allMatchTracks(state: GameState): GameTrack[] {
  return matchSlots(state).flatMap((slot) => state.playlists[slot] ?? []);
}

/**
 * What the Guesser is choosing between. Normally their own playlist — this is the single most
 * important thing to get right in the whole turn loop — but a sudden-death song can be drawn from
 * anyone's playlist, so the pool widens to match.
 */
export function tracksForActiveRound(state: GameState): GameTrack[] {
  const round = activeRound(state);
  if (!round) return [];
  const isSuddenDeath = state.suddenDeathRounds.at(-1)?.roundNumber === round.roundNumber;
  return isSuddenDeath ? allMatchTracks(state) : (state.playlists[round.guesser] ?? []);
}

/**
 * What the Picker can choose from right now: the playlist of whoever they're picking *for*, minus
 * anything already used this match — including songs chosen moments ago in this same block, so a
 * block can never contain a duplicate.
 */
export function selectablePickerTracks(state: GameState): GameTrack[] {
  if (state.phase.name !== 'pickBatch') {
    return tracksForActiveRound(state).filter((t) => !state.usedTrackIds.has(t.id));
  }
  const target = nextPickTarget(state);
  const pool = target ? (state.playlists[target.guesser] ?? []) : [];
  return pool.filter((t) => !state.usedTrackIds.has(t.id));
}

/** The round the Picker's next song will be played in. */
export function nextPickTarget(state: GameState): RoundRecord | undefined {
  if (state.phase.name !== 'pickBatch') return undefined;
  const { picksPerBatch, playerCount } = state.settings;
  return pendingPicksInBatch(
    state.rounds,
    state.currentRoundIndex,
    picksPerBatch,
    playerCount,
    state.phase.picker,
  )[0];
}

export interface PickBatchProgress {
  /** Songs already chosen by this picker in the current block. */
  done: number;
  /** Songs this picker owes in the current block. */
  total: number;
  /** The round number the song being chosen right now will be played in. */
  nextRoundNumber: number | undefined;
  /** Who will be guessing these songs. */
  guesser: PlayerSlot | undefined;
}

/** Drives the "song 2 of 5" counter on the picking screen. */
export function pickBatchProgress(state: GameState): PickBatchProgress {
  if (state.phase.name !== 'pickBatch') {
    return { done: 0, total: 0, nextRoundNumber: undefined, guesser: undefined };
  }
  const picker = state.phase.picker;
  const { picksPerBatch, playerCount } = state.settings;
  const { start, end } = batchRange(state.rounds.length, state.currentRoundIndex, picksPerBatch, playerCount);
  const total = state.rounds.slice(start, end).filter((r) => r.picker === picker).length;
  const pending = pendingPicksInBatch(state.rounds, state.currentRoundIndex, picksPerBatch, playerCount, picker);
  return {
    done: total - pending.length,
    total,
    nextRoundNumber: pending[0]?.roundNumber,
    guesser: pending[0]?.guesser,
  };
}

export function pickedTrack(state: GameState): GameTrack | undefined {
  const round = activeRound(state);
  if (!round?.pickedTrackId) return undefined;
  return tracksForActiveRound(state).find((t) => t.id === round.pickedTrackId);
}

export function isMatchOver(state: GameState): boolean {
  return state.currentRoundIndex >= state.rounds.length;
}

/** Unused songs from every playlist — the pool sudden death and solo rounds draw from. */
export function combinedUnusedPool(state: GameState): GameTrack[] {
  return allMatchTracks(state).filter((t) => !state.usedTrackIds.has(t.id));
}

/** The solo player draws from their own playlist; nobody else is here to pick for them. */
export function soloUnusedPool(state: GameState): GameTrack[] {
  return (state.playlists.P1 ?? []).filter((t) => !state.usedTrackIds.has(t.id));
}

export interface Standing {
  slot: PlayerSlot;
  score: number;
  player: PlayerInfo | undefined;
}

/** Scoreboard rows, highest first. */
export function scoreboard(state: GameState): Standing[] {
  return standings(state.scores, matchSlots(state)).map((row) => ({
    ...row,
    player: state.players[row.slot],
  }));
}
