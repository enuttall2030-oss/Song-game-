import { describe, expect, it } from 'vitest';
import { buildRoundOrder, pickRandomStartOffset } from '../game/roundLogic';

describe('buildRoundOrder', () => {
  it('creates 2 rounds per player and alternates roles starting with P1 guessing', () => {
    const rounds = buildRoundOrder(3, 2);
    expect(rounds).toHaveLength(6);

    expect(rounds[0]).toMatchObject({ roundNumber: 1, guesser: 'P1', picker: 'P2' });
    expect(rounds[1]).toMatchObject({ roundNumber: 2, guesser: 'P2', picker: 'P1' });
    expect(rounds[2]).toMatchObject({ roundNumber: 3, guesser: 'P1', picker: 'P2' });
    expect(rounds[5]).toMatchObject({ roundNumber: 6, guesser: 'P2', picker: 'P1' });
  });

  it('every round starts pending with zero attempts and zero points', () => {
    const rounds = buildRoundOrder(1, 2);
    for (const round of rounds) {
      expect(round.attemptsUsed).toBe(0);
      expect(round.outcome).toBe('pending');
      expect(round.pointsAwardedToGuesser).toBe(0);
      expect(round.pointsAwardedToPicker).toBe(0);
    }
  });

  it('handles a single round per player', () => {
    expect(buildRoundOrder(1, 2)).toHaveLength(2);
  });
});

describe('buildRoundOrder with other player counts', () => {
  it('gives every player equal guessing turns, each picking for the player before them', () => {
    const rounds = buildRoundOrder(2, 3);
    expect(rounds).toHaveLength(6);
    expect(rounds.map((r) => r.guesser)).toEqual(['P1', 'P2', 'P3', 'P1', 'P2', 'P3']);
    expect(rounds.map((r) => r.picker)).toEqual(['P2', 'P3', 'P1', 'P2', 'P3', 'P1']);

    // Everyone picks exactly as often as they guess — nobody carries extra load.
    for (const slot of ['P1', 'P2', 'P3']) {
      expect(rounds.filter((r) => r.guesser === slot)).toHaveLength(2);
      expect(rounds.filter((r) => r.picker === slot)).toHaveLength(2);
    }
  });

  it('scales to five players', () => {
    const rounds = buildRoundOrder(3, 5);
    expect(rounds).toHaveLength(15);
    expect(new Set(rounds.map((r) => r.guesser)).size).toBe(5);
    expect(rounds.every((r) => r.picker !== r.guesser)).toBe(true);
  });

  it('gives a solo match no picker at all', () => {
    const rounds = buildRoundOrder(4, 1);
    expect(rounds).toHaveLength(4);
    expect(rounds.every((r) => r.guesser === 'P1')).toBe(true);
    expect(rounds.every((r) => r.picker === undefined)).toBe(true);
  });
});

describe('pickRandomStartOffset', () => {
  it('keeps the offset within [0, duration - reserve - buffer]', () => {
    const offset = pickRandomStartOffset(30, 10, () => 0.5);
    // maxStart = 30 - 10 - 0.5 = 19.5; at random()=0.5 -> 9.75
    expect(offset).toBeCloseTo(9.75);
  });

  it('returns 0 for a random() of 0 (start of the safe window)', () => {
    expect(pickRandomStartOffset(30, 10, () => 0)).toBe(0);
  });

  it('never leaves less than reserveSec + buffer remaining', () => {
    const duration = 22;
    const reserve = 10;
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      const offset = pickRandomStartOffset(duration, reserve, () => r);
      expect(offset + reserve).toBeLessThanOrEqual(duration);
    }
  });

  it('falls back to 0 when the preview is too short to reserve the full snippet', () => {
    expect(pickRandomStartOffset(8, 10, () => 0.9)).toBe(0);
  });
});
