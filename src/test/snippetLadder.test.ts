import { describe, expect, it } from 'vitest';
import { ATTEMPT_TABLE, isFinalAttempt, pointsForAttempt, snippetLengthForAttempt } from '../game/snippetLadder';

describe('snippetLadder', () => {
  it('matches the spec ladder exactly', () => {
    expect(ATTEMPT_TABLE).toEqual([
      { attempt: 1, snippetSec: 0.1, points: 75 },
      { attempt: 2, snippetSec: 0.5, points: 50 },
      { attempt: 3, snippetSec: 2, points: 30 },
      { attempt: 4, snippetSec: 5, points: 20 },
      { attempt: 5, snippetSec: 10, points: 10 },
    ]);
  });

  it('returns the right snippet length and points per attempt', () => {
    expect(snippetLengthForAttempt(1)).toBe(0.1);
    expect(pointsForAttempt(1)).toBe(75);
    expect(snippetLengthForAttempt(5)).toBe(10);
    expect(pointsForAttempt(5)).toBe(10);
  });

  it('throws for an out-of-range attempt', () => {
    expect(() => snippetLengthForAttempt(6)).toThrow();
    expect(() => pointsForAttempt(0)).toThrow();
  });

  it('flags the final attempt correctly', () => {
    expect(isFinalAttempt(4)).toBe(false);
    expect(isFinalAttempt(5)).toBe(true);
    expect(isFinalAttempt(6)).toBe(true);
  });
});
