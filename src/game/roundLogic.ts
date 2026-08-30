import { slotsForCount, type PlayerSlot, type RoundRecord } from './types';

/**
 * Builds the full round schedule up front. Every player guesses `roundsPerPlayer` times, and each
 * round's song is chosen by the *next* player in the rotation — so with 3+ players everyone picks
 * exactly as often as they guess, and with 2 players it collapses to the original "you pick for
 * each other" alternation. A solo match has no picker at all: the game picks the songs.
 */
export function buildRoundOrder(roundsPerPlayer: number, playerCount: number): RoundRecord[] {
  const slots = slotsForCount(playerCount);
  const totalRounds = roundsPerPlayer * slots.length;
  const rounds: RoundRecord[] = [];

  for (let i = 0; i < totalRounds; i++) {
    const guesser = slots[i % slots.length];
    const picker = slots.length > 1 ? slots[(i + 1) % slots.length] : undefined;
    rounds.push({
      roundNumber: i + 1,
      guesser,
      picker,
      attemptsUsed: 0,
      outcome: 'pending',
      pointsAwardedToGuesser: 0,
      pointsAwardedToPicker: 0,
    });
  }
  return rounds;
}

const TRAILING_BUFFER_SEC = 0.5;

/**
 * Picks a random start offset within a preview clip, reserving `reserveSec` (the longest possible
 * snippet length) plus a trailing buffer so playback never runs past the end of the clip. Falls
 * back to offset 0 for anomalously short previews where there isn't enough room to reserve.
 */
export function pickRandomStartOffset(
  previewDurationSec: number,
  reserveSec: number,
  random: () => number = Math.random,
): number {
  const maxStart = previewDurationSec - reserveSec - TRAILING_BUFFER_SEC;
  if (maxStart <= 0) return 0;
  return random() * maxStart;
}

/**
 * The slice of rounds picked in one sitting: `picksPerBatch` rounds for each player, i.e. twice
 * that many consecutive rounds. Batches are aligned to fixed boundaries from round 0, so the
 * current batch is derivable from `currentRoundIndex` alone with no extra state to keep in sync.
 * The last batch of an odd-sized match is simply short.
 */
export function batchRange(
  totalRounds: number,
  currentRoundIndex: number,
  picksPerBatch: number,
  playerCount: number,
): { start: number; end: number } {
  const span = Math.max(1, picksPerBatch) * Math.max(1, playerCount);
  const start = Math.floor(currentRoundIndex / span) * span;
  return { start, end: Math.min(totalRounds, start + span) };
}

/** Rounds in the current batch that `picker` still owes a song for, in play order. */
export function pendingPicksInBatch(
  rounds: RoundRecord[],
  currentRoundIndex: number,
  picksPerBatch: number,
  playerCount: number,
  picker: PlayerSlot,
): RoundRecord[] {
  const { start, end } = batchRange(rounds.length, currentRoundIndex, picksPerBatch, playerCount);
  return rounds.slice(start, end).filter((r) => r.picker === picker && !r.pickedTrackId);
}
