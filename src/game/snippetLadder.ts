export interface AttemptRung {
  attempt: number;
  snippetSec: number;
  points: number;
}

/** Fixed escalation ladder from the spec: attempt 1 is the shortest/hardest snippet, worth the most. */
export const ATTEMPT_TABLE: readonly AttemptRung[] = [
  { attempt: 1, snippetSec: 0.1, points: 75 },
  { attempt: 2, snippetSec: 0.5, points: 50 },
  { attempt: 3, snippetSec: 2, points: 30 },
  { attempt: 4, snippetSec: 5, points: 20 },
  { attempt: 5, snippetSec: 10, points: 10 },
];

export const MAX_ATTEMPTS = ATTEMPT_TABLE.length;

export function snippetLengthForAttempt(attempt: number): number {
  const rung = ATTEMPT_TABLE.find((r) => r.attempt === attempt);
  if (!rung) throw new RangeError(`No snippet rung for attempt ${attempt}`);
  return rung.snippetSec;
}

export function pointsForAttempt(attempt: number): number {
  const rung = ATTEMPT_TABLE.find((r) => r.attempt === attempt);
  if (!rung) throw new RangeError(`No points rung for attempt ${attempt}`);
  return rung.points;
}

export function isFinalAttempt(attempt: number): boolean {
  return attempt >= MAX_ATTEMPTS;
}
