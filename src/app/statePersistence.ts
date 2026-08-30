import type { GameState } from '../game/types';

/**
 * Connecting a player is a *full-page redirect* to accounts.spotify.com and back, which tears down
 * the whole React tree — so in-memory reducer state alone loses the match every time someone logs
 * in. Player 2's login would otherwise come back to an app that has forgotten Player 1's playlist
 * entirely. Persisted in sessionStorage: same tab across the redirect, gone when the tab closes
 * (a pass-and-play match shouldn't outlive its window).
 */
const STORAGE_KEY = 'pr.state.v3';

/**
 * Every phase the app can render. A saved match from an older build can name a phase this build
 * no longer has (the per-round `pickerPhase` became `pickBatch`, say) — restoring one leaves the
 * router with nothing to render and a blank screen, so an unknown phase discards the save instead.
 */
const KNOWN_PHASES = new Set([
  'home',
  'connect',
  'playlistPick',
  'handoff',
  'waitingRoom',
  'pickBatch',
  'guesserPhase',
  'reveal',
  'suddenDeath',
  'finalResults',
]);

/** Same shape as GameState, except the Set — which JSON has no representation for. */
type PersistedState = Omit<GameState, 'usedTrackIds'> & { usedTrackIds: string[] };

export function serializeState(state: GameState): string {
  const persisted: PersistedState = { ...state, usedTrackIds: [...state.usedTrackIds] };
  return JSON.stringify(persisted);
}

export function deserializeState(raw: string): GameState | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  // Anything unrecognizable (a stale schema from an older build, a hand-edited value) is discarded
  // rather than half-restored into a phase the reducer can't act on.
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const candidate = parsed as Partial<PersistedState>;
  if (!candidate.phase || typeof candidate.phase.name !== 'string') return undefined;
  if (!KNOWN_PHASES.has(candidate.phase.name)) return undefined;
  if (!candidate.settings || !Array.isArray(candidate.rounds) || !Array.isArray(candidate.usedTrackIds)) {
    return undefined;
  }
  if (!Array.isArray(candidate.suddenDeathRounds) || !Array.isArray(candidate.suddenDeathQueue)) {
    return undefined;
  }
  if (typeof candidate.settings.playerCount !== 'number') return undefined;

  return {
    ...(candidate as PersistedState),
    usedTrackIds: new Set(candidate.usedTrackIds),
  };
}

export function loadPersistedState(): GameState | undefined {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? deserializeState(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function savePersistedState(state: GameState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, serializeState(state));
  } catch {
    // Private-browsing/quota failure: the app still works within a single page load.
  }
}

export function clearPersistedState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}
