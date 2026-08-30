export type PlayerSlot = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

/** Slots are handed out in order, so the first `playerCount` of these are the players in a match. */
export const ALL_PLAYER_SLOTS: readonly PlayerSlot[] = ['P1', 'P2', 'P3', 'P4', 'P5'];
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = ALL_PLAYER_SLOTS.length;

export function slotsForCount(playerCount: number): PlayerSlot[] {
  return ALL_PLAYER_SLOTS.slice(0, Math.min(Math.max(playerCount, MIN_PLAYERS), MAX_PLAYERS));
}

/** Where a slot sits in the rotation, or -1 if it isn't in this match. */
export function slotIndex(slot: PlayerSlot): number {
  return ALL_PLAYER_SLOTS.indexOf(slot);
}

export interface PlayerInfo {
  slot: PlayerSlot;
  spotifyUserId: string;
  displayName: string;
}

export interface GameTrack {
  id: string;
  title: string;
  artist: string;
  albumArtUrl: string;
  /** 30s clip resolved from Apple's catalogue (see `preview/`); empty means "not playable". */
  previewUrl: string;
  /** Spotify's 0-100 popularity score. Unused in v1 gameplay; kept for a future Deep Cut Mode. */
  popularity: number;
}

export type RoundOutcome = 'pending' | 'correct' | 'exhausted';

export interface RoundRecord {
  roundNumber: number;
  guesser: PlayerSlot;
  /** Absent in a solo match, where the game picks the song itself rather than an opponent. */
  picker?: PlayerSlot;
  pickedTrackId?: string;
  hint?: string;
  /** Locked the moment the Picker selects a track; reused for every replay of that attempt. */
  snippetStartOffsetSec?: number;
  attemptsUsed: number;
  outcome: RoundOutcome;
  pointsAwardedToGuesser: number;
  pointsAwardedToPicker: number;
}

export interface MatchSettings {
  /**
   * 1 to 5. At 1 the game picks the songs at random from the player's own playlist; at 2+ each
   * player picks for the player after them in the rotation.
   */
  playerCount: number;
  /** Rounds per player. Total rounds = roundsPerPlayer * playerCount. */
  roundsPerPlayer: number;
  /** House rule: Picker may leave a one-line taunting hint. */
  allowPickerHint: boolean;
  /** House rule: Picker earns bonus points when the Guesser fails a round entirely. */
  pickerScoresOnFailure: boolean;
  pickerBonusPoints: number;
  minPlayableTracks: number;
  /**
   * How many songs each player picks in one sitting before the device changes hands. Picking in
   * blocks rather than one-at-a-time is what keeps a 10-round match from needing 20 handoffs.
   */
  picksPerBatch: number;
}

export type ScreenPhase =
  | { name: 'home' }
  | { name: 'connect'; slot: PlayerSlot }
  | { name: 'playlistPick'; slot: PlayerSlot }
  | { name: 'handoff'; toSlot: PlayerSlot; reason: 'connectNext' | 'startPickBatch' | 'startGuesserPhase' }
  | { name: 'waitingRoom' }
  | { name: 'pickBatch'; picker: PlayerSlot }
  | { name: 'guesserPhase'; roundNumber: number }
  | { name: 'reveal'; roundNumber: number }
  | { name: 'suddenDeath' }
  | { name: 'finalResults' };

export interface GameState {
  phase: ScreenPhase;
  settings: MatchSettings;
  players: Partial<Record<PlayerSlot, PlayerInfo>>;
  playlists: Partial<Record<PlayerSlot, GameTrack[]>>;
  rounds: RoundRecord[];
  currentRoundIndex: number;
  scores: Record<PlayerSlot, number>;
  usedTrackIds: Set<string>;
  /** Sudden-death rounds played so far; the last one is live while its outcome is 'pending'. */
  suddenDeathRounds: RoundRecord[];
  /** Tied players still owed a sudden-death round in the current tie-break cycle. */
  suddenDeathQueue: PlayerSlot[];
  errorMessage?: string;
}

export const DEFAULT_MATCH_SETTINGS: MatchSettings = {
  playerCount: 2,
  roundsPerPlayer: 5,
  allowPickerHint: true,
  pickerScoresOnFailure: true,
  pickerBonusPoints: 10,
  minPlayableTracks: 10,
  picksPerBatch: 5,
};
