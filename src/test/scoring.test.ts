import { describe, expect, it } from 'vitest';
import { buildRoundOrder } from '../game/roundLogic';
import {
  applyRoundToScores,
  isTied,
  matchWinner,
  standings,
  scoreForCorrectGuess,
  scoreForExhaustedRound,
} from '../game/scoring';
import { DEFAULT_MATCH_SETTINGS, type PlayerSlot } from '../game/types';

const TWO: PlayerSlot[] = ['P1', 'P2'];
const zero = (): Record<PlayerSlot, number> => ({ P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 });

describe('scoreForCorrectGuess', () => {
  it('awards points per the attempt ladder and marks the round correct', () => {
    const round = buildRoundOrder(1, 2)[0];
    const scored = scoreForCorrectGuess(round, 1);
    expect(scored.outcome).toBe('correct');
    expect(scored.attemptsUsed).toBe(1);
    expect(scored.pointsAwardedToGuesser).toBe(75);
    expect(scored.pointsAwardedToPicker).toBe(0);
  });

  it('awards fewer points for later attempts', () => {
    const round = buildRoundOrder(1, 2)[0];
    expect(scoreForCorrectGuess(round, 5).pointsAwardedToGuesser).toBe(10);
  });
});

describe('scoreForExhaustedRound', () => {
  it('awards the picker bonus when the house rule is on', () => {
    const round = buildRoundOrder(1, 2)[0];
    const scored = scoreForExhaustedRound({ ...round, attemptsUsed: 5 }, DEFAULT_MATCH_SETTINGS);
    expect(scored.outcome).toBe('exhausted');
    expect(scored.pointsAwardedToGuesser).toBe(0);
    expect(scored.pointsAwardedToPicker).toBe(10);
  });

  it('awards nothing to the picker when the house rule is off', () => {
    const round = buildRoundOrder(1, 2)[0];
    const settings = { ...DEFAULT_MATCH_SETTINGS, pickerScoresOnFailure: false };
    const scored = scoreForExhaustedRound({ ...round, attemptsUsed: 5 }, settings);
    expect(scored.pointsAwardedToPicker).toBe(0);
  });
});

describe('applyRoundToScores', () => {
  it('credits the guesser and picker independently by slot', () => {
    const round = { ...buildRoundOrder(1, 2)[0], pointsAwardedToGuesser: 50, pointsAwardedToPicker: 0 };
    const result = applyRoundToScores(zero(), round);
    expect(result).toMatchObject({ P1: 50, P2: 0 });
  });

  it('accumulates across multiple rounds', () => {
    const roundA = { ...buildRoundOrder(2, 2)[0], pointsAwardedToGuesser: 50, pointsAwardedToPicker: 0 };
    const roundB = { ...buildRoundOrder(2, 2)[1], pointsAwardedToGuesser: 0, pointsAwardedToPicker: 10 };
    let scores = zero();
    scores = applyRoundToScores(scores, roundA);
    scores = applyRoundToScores(scores, roundB);
    // roundA: P1 guesses (+50). roundB: P2 guesses/P1 picks, picker bonus goes to P1 (+10).
    expect(scores).toMatchObject({ P1: 60, P2: 0 });
  });
});

describe('isTied / matchWinner', () => {
  const scores = (partial: Partial<Record<PlayerSlot, number>>): Record<PlayerSlot, number> => ({
    ...zero(),
    ...partial,
  });

  it('detects a tie between two players', () => {
    expect(isTied(scores({ P1: 30, P2: 30 }), TWO)).toBe(true);
    expect(isTied(scores({ P1: 30, P2: 20 }), TWO)).toBe(false);
  });

  it('picks the higher score as winner', () => {
    expect(matchWinner(scores({ P1: 40, P2: 30 }), TWO)).toBe('P1');
    expect(matchWinner(scores({ P1: 20, P2: 30 }), TWO)).toBe('P2');
    expect(matchWinner(scores({ P1: 30, P2: 30 }), TWO)).toBe('tie');
  });

  it('only counts a tie for the lead, not one further down the table', () => {
    const four: PlayerSlot[] = ['P1', 'P2', 'P3', 'P4'];
    // P3 and P4 are level, but P1 is clear at the top: nothing to break.
    expect(isTied(scores({ P1: 90, P2: 50, P3: 20, P4: 20 }), four)).toBe(false);
    expect(matchWinner(scores({ P1: 90, P2: 50, P3: 20, P4: 20 }), four)).toBe('P1');

    expect(isTied(scores({ P1: 90, P2: 90, P3: 20, P4: 10 }), four)).toBe(true);
    expect(matchWinner(scores({ P1: 90, P2: 90, P3: 20, P4: 10 }), four)).toBe('tie');
  });

  it('never calls a solo match tied', () => {
    expect(isTied(scores({ P1: 0 }), ['P1'])).toBe(false);
    expect(matchWinner(scores({ P1: 0 }), ['P1'])).toBe('P1');
  });

  it('ranks the scoreboard highest first', () => {
    const four: PlayerSlot[] = ['P1', 'P2', 'P3', 'P4'];
    const rows = standings(scores({ P1: 10, P2: 90, P3: 50, P4: 90 }), four);
    expect(rows.map((r) => r.slot)).toEqual(['P2', 'P4', 'P3', 'P1']);
  });
});
