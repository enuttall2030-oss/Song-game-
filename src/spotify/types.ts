export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms when this access token stops being valid. */
  expiresAt: number;
}

export interface SpotifyUser {
  id: string;
  display_name: string | null;
}

export interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}

/** Normalized playlist shape the app renders — every field guaranteed present. */
export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  images: SpotifyImage[];
  tracks: { total: number };
}

/**
 * What `/me/playlists` actually returns. Spotify's docs promise every field, but real accounts
 * come back with `null` items (playlists that were deleted or are no longer visible to you) and
 * entries missing `tracks`/`images` entirely — so nothing here is trusted until normalized.
 */
export interface SpotifyPlaylistApiItem {
  id?: string | null;
  name?: string | null;
  images?: SpotifyImage[] | null;
  /** The documented spelling. */
  tracks?: { total?: number | null } | null;
  /** What the API actually returns as of 2026 — same object, renamed. */
  items?: { total?: number | null } | null;
}

export interface SpotifyPagedResponse<T> {
  items: T[];
  next: string | null;
}

export interface SpotifyTrackRef {
  id?: string | null;
  name?: string | null;
  artists?: ({ name?: string | null } | null)[] | null;
  album?: { images?: SpotifyImage[] | null } | null;
  popularity?: number | null;
  is_local?: boolean | null;
}

/**
 * One entry in a playlist's contents. The track sits under `track` in the documented shape and
 * under `item` in the renamed one, so both are read. Every field is possibly absent until checked.
 */
export interface SpotifyTrackItem {
  track?: SpotifyTrackRef | null;
  item?: SpotifyTrackRef | null;
}

