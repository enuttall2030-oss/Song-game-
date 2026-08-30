import type { PlayerSlot } from '../game/types';
import type { StoredToken } from './types';

/**
 * Tokens are keyed by player slot, never by a single "current session" — two players share one
 * browser sequentially, and each slot's token must stay independently addressable. In-memory is
 * the source of truth; sessionStorage is purely a reload-survival mirror (tab-scoped, cleared on
 * close), not a database.
 */
const memoryStore = new Map<PlayerSlot, StoredToken>();

function storageKey(slot: PlayerSlot): string {
  return `pr.auth.${slot}`;
}

export function setToken(slot: PlayerSlot, token: StoredToken): void {
  memoryStore.set(slot, token);
  try {
    sessionStorage.setItem(storageKey(slot), JSON.stringify(token));
  } catch {
    // sessionStorage can throw in private-browsing edge cases; in-memory store still works for this tab session.
  }
}

export function getToken(slot: PlayerSlot): StoredToken | undefined {
  const inMemory = memoryStore.get(slot);
  if (inMemory) return inMemory;

  try {
    const raw = sessionStorage.getItem(storageKey(slot));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as StoredToken;
    memoryStore.set(slot, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

export function clearToken(slot: PlayerSlot): void {
  memoryStore.delete(slot);
  try {
    sessionStorage.removeItem(storageKey(slot));
  } catch {
    // no-op
  }
}

export function isTokenExpired(token: StoredToken, skewMs = 30_000): boolean {
  return Date.now() + skewMs >= token.expiresAt;
}
