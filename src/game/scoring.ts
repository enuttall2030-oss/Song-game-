import { pointsForAttempt } from './snippetLadder';
import type { MatchSettings, PlayerSlot, RoundRecord } from './types';

export function scoreForCorrectGuess(round: RoundRecord, attempt: number): RoundRecord {
  return {
    ...round,
    attemptsUsed: attempt,
    outcome: 'correct',
    pointsAwardedToGuesser: pointsForAttempt(attempt),
    pointsAwardedToPicker: 0,
  };
}

export function scoreForExhaustedRound(round: RoundRecord, settings: MatchSettings): RoundRecord {
  // No picker in a solo match, so there is nobody to award the miss bonus to.
  const pickerEarns = !!round.picker && settings.pickerScoresOnFailure;
  return {
    ...round,
    attemptsUsed: round.attemptsUsed,
    outcome: 'exhausted',
    pointsAwardedToGuesser: 0,
    pointsAwardedToPicker: pickerEarns ? settings.pickerBonusPoints : 0,
  };
}

export function applyRoundToScores(
  scores: Record<PlayerSlot, number>,
  round: RoundRecord,
): Record<PlayerSlot, number> {
  const next = { ...scores, [round.guesser]: scores[round.guesser] + round.pointsAwardedToGuesser };
  if (round.picker) {
    next[round.picker] = next[round.picker] + round.pointsAwardedToPicker;
  }
  return next;
}

/** The highest score among the players actually in this match. */
export function topScore(scores: Record<PlayerSlot, number>, slots: PlayerSlot[]): number {
  return slots.reduce((best, slot) => Math.max(best, scores[slot]), Number.NEGATIVE_INFINITY);
}

/** Everyone level at the top — one player in a decided match, two or more in a tie. */
export function leaders(scores: Record<PlayerSlot, number>, slots: PlayerSlot[]): PlayerSlot[] {
  const best = topScore(scores, slots);
  return slots.filter((slot) => scores[slot] === best);
}

/**
 * A tie is only a tie when it's *for first place*: with 4 players, two of them level on last place
 * doesn't need breaking. A solo match can never tie.
 */
export function isTied(scores: Record<PlayerSlot, number>, slots: PlayerSlot[]): boolean {
  return slots.length > 1 && leaders(scores, slots).length > 1;
}

export function matchWinner(scores: Record<PlayerSlot, number>, slots: PlayerSlot[]): PlayerSlot | 'tie' {
  const front = leaders(scores, slots);
  return front.length === 1 ? front[0] : 'tie';
}

/** Players ordered for a scoreboard: highest score first, then by slot for a stable order. */
export function standings(
  scores: Record<PlayerSlot, number>,
  slots: PlayerSlot[],
): { slot: PlayerSlot; score: number }[] {
  return slots
    .map((slot) => ({ slot, score: scores[slot] }))
    .sort((a, b) => b.score - a.score || slots.indexOf(a.slot) - slots.indexOf(b.slot));
}
