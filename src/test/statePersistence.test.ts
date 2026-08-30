import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState, gameReducer } from '../game/reducer';
import { DEFAULT_MATCH_SETTINGS, type GameTrack } from '../game/types';
import { clearPersistedState, deserializeState, loadPersistedState, savePersistedState } from '../app/statePersistence';

function track(id: string): GameTrack {
  return { id, title: `Song ${id}`, artist: 'Artist', albumArtUrl: '', previewUrl: 'https://a/x', popularity: 50 };
}

const playlist = () => Array.from({ length: 12 }, (_, i) => track(String(i)));

beforeEach(() => {
  clearPersistedState();
});

describe('state persistence', () => {
  it('round-trips a mid-match state, Set included', () => {
    let state = gameReducer(createInitialState(), { type: 'START_MATCH', settings: DEFAULT_MATCH_SETTINGS });
    state = gameReducer(state, { type: 'PLAYER_CONNECTED', slot: 'P1', spotifyUserId: 'u1', displayName: 'Alice' });
    state = gameReducer(state, { type: 'PLAYLIST_SELECTED', slot: 'P1', tracks: playlist() });
    state = { ...state, usedTrackIds: new Set(['0', '3']) };

    savePersistedState(state);
    const restored = loadPersistedState();

    expect(restored).toBeDefined();
    expect(restored?.phase).toEqual({ name: 'handoff', toSlot: 'P2', reason: 'connectNext' });
    expect(restored?.players.P1?.displayName).toBe('Alice');
    expect(restored?.playlists.P1?.length).toBe(12);
    expect(restored?.usedTrackIds).toBeInstanceOf(Set);
    expect([...(restored?.usedTrackIds ?? [])]).toEqual(['0', '3']);
  });

  it('survives the P1 playlist across a simulated OAuth redirect for P2', () => {
    let state = gameReducer(createInitialState(), { type: 'START_MATCH', settings: DEFAULT_MATCH_SETTINGS });
    state = gameReducer(state, { type: 'PLAYER_CONNECTED', slot: 'P1', spotifyUserId: 'u1', displayName: 'Alice' });
    state = gameReducer(state, { type: 'PLAYLIST_SELECTED', slot: 'P1', tracks: playlist() });
    state = gameReducer(state, { type: 'HANDOFF_ACKNOWLEDGED' });
    savePersistedState(state); // page unloads here: browser leaves for accounts.spotify.com

    const afterRedirect = loadPersistedState();
    expect(afterRedirect?.phase).toEqual({ name: 'connect', slot: 'P2' });

    let resumed = gameReducer(afterRedirect!, {
      type: 'PLAYER_CONNECTED',
      slot: 'P2',
      spotifyUserId: 'u2',
      displayName: 'Bob',
    });
    resumed = gameReducer(resumed, { type: 'PLAYLIST_SELECTED', slot: 'P2', tracks: playlist() });

    expect(resumed.phase).toEqual({ name: 'waitingRoom' });
    expect(resumed.playlists.P1?.length).toBe(12);
    expect(resumed.playlists.P2?.length).toBe(12);
    expect(resumed.rounds.length).toBe(DEFAULT_MATCH_SETTINGS.roundsPerPlayer * 2);
  });

  it('returns undefined with nothing stored', () => {
    expect(loadPersistedState()).toBeUndefined();
  });

  it('discards malformed or stale-schema payloads rather than half-restoring', () => {
    expect(deserializeState('not json')).toBeUndefined();
    expect(deserializeState('null')).toBeUndefined();
    expect(deserializeState('{"phase":{"name":"waitingRoom"}}')).toBeUndefined();
    expect(deserializeState(JSON.stringify({ settings: {}, rounds: [], usedTrackIds: [] }))).toBeUndefined();
  });

  it('discards a match saved by an older build whose phase no longer exists', () => {
    const stale = JSON.stringify({
      phase: { name: 'pickerPhase', roundNumber: 3 }, // renamed to `pickBatch`
      settings: DEFAULT_MATCH_SETTINGS,
      rounds: [],
      usedTrackIds: [],
    });
    expect(deserializeState(stale)).toBeUndefined();
  });
});
