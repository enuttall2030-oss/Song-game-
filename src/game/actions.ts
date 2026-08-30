import type { GameTrack, MatchSettings, PlayerSlot } from './types';

export type GameAction =
  | { type: 'START_MATCH'; settings: MatchSettings }
  | { type: 'PLAYER_CONNECTED'; slot: PlayerSlot; spotifyUserId: string; displayName: string }
  | { type: 'SAME_ACCOUNT_DETECTED' }
  | { type: 'AUTH_ERROR'; message: string }
  | { type: 'PLAYLIST_SELECTED'; slot: PlayerSlot; tracks: GameTrack[] }
  | { type: 'DISMISS_ERROR' }
  | { type: 'HANDOFF_ACKNOWLEDGED' }
  | { type: 'READY_UP' }
  | { type: 'PICKER_SELECTED_TRACK'; trackId: string; hint?: string }
  | { type: 'SOLO_TRACK_ASSIGNED'; trackId: string }
  | { type: 'SNIPPET_OFFSET_LOCKED'; offsetSec: number }
  | { type: 'GUESSER_GUESS_SUBMITTED'; guessText: string }
  | { type: 'GUESSER_SKIPPED' }
  | { type: 'GUESSER_GAVE_UP' }
  | { type: 'REVEAL_NEXT' }
  | { type: 'SUDDEN_DEATH_TRACK_SELECTED'; track: GameTrack }
  | { type: 'REMATCH_SAME_PLAYLISTS' }
  | { type: 'NEW_MATCH' };
