import type { GameTrack } from '../game/types';
import type {
  SpotifyPagedResponse,
  SpotifyPlaylistApiItem,
  SpotifyPlaylistSummary,
  SpotifyTrackItem,
  SpotifyUser,
} from './types';

const API_BASE = 'https://api.spotify.com/v1';

export class SpotifyApiError extends Error {
  readonly status: number;

  constructor(path: string, status: number, body: string) {
    super(`Spotify API request to ${path} failed (${status}): ${body}`);
    this.name = 'SpotifyApiError';
    this.status = status;
  }
}

async function spotifyFetch<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new SpotifyApiError(path, response.status, await response.text());
  }

  return response.json() as Promise<T>;
}

export async function getMe(accessToken: string): Promise<SpotifyUser> {
  return spotifyFetch<SpotifyUser>('/me', accessToken);
}

/**
 * Normalizes one `/me/playlists` entry, or returns undefined if it isn't usable. Real accounts
 * return `null` items and entries with no `tracks` object at all; rendering one of those was
 * enough to throw during render and blank the whole app, so nothing untrusted gets past here.
 */
export function toPlaylistSummary(item: SpotifyPlaylistApiItem | null | undefined): SpotifyPlaylistSummary | undefined {
  if (!item || !item.id) return undefined;
  return {
    id: item.id,
    name: item.name || 'Untitled playlist',
    images: item.images ?? [],
    // Spotify renamed this object from `tracks` to `items` — read whichever one turns up, or the
    // whole library shows "0 tracks".
    tracks: { total: item.tracks?.total ?? item.items?.total ?? 0 },
  };
}

export async function getMyPlaylists(accessToken: string): Promise<SpotifyPlaylistSummary[]> {
  const playlists: SpotifyPlaylistSummary[] = [];
  let path: string | null = '/me/playlists?limit=50';

  while (path) {
    const page: SpotifyPagedResponse<SpotifyPlaylistApiItem> = await spotifyFetch(path, accessToken);
    for (const item of page.items ?? []) {
      const summary = toPlaylistSummary(item);
      if (summary) playlists.push(summary);
    }
    path = page.next ? page.next.replace(API_BASE, '') : null;
  }

  return playlists;
}

/**
 * Fetches every track in a playlist, following Spotify's `next` cursor to completion — a playlist
 * over 100 tracks (the per-page max) is common and must not be silently truncated. Local files
 * (`is_local`) and tracks missing an id are dropped since they can't be reliably matched/played.
 *
 * `previewUrl` is deliberately left empty here: Spotify returns `preview_url: null` for every
 * track on apps registered after 2024-11-27, so the audio comes from `preview/resolvePreviews`
 * instead. Spotify's job is *which songs are in the playlist*, not the audio.
 */
export async function getPlaylistTracks(accessToken: string, playlistId: string): Promise<GameTrack[]> {
  const tracks: GameTrack[] = [];
  // `/items` first: the playlist object's own href uses it, and `/tracks` now answers 403 on at
  // least some accounts. The old spelling stays as a fallback for accounts still served by it.
  const spellings = ['items', 'tracks'];
  let spellingIndex = 0;
  let path: string | null = `/playlists/${playlistId}/${spellings[0]}?limit=100`;

  while (path) {
    let page: SpotifyPagedResponse<SpotifyTrackItem>;
    try {
      page = await spotifyFetch(path, accessToken);
    } catch (err) {
      const canRetry = spellingIndex + 1 < spellings.length;
      const isEndpointGone = err instanceof SpotifyApiError && (err.status === 403 || err.status === 404);
      if (canRetry && isEndpointGone) {
        path = path.replace(`/${spellings[spellingIndex]}?`, `/${spellings[spellingIndex + 1]}?`);
        spellingIndex++;
        continue;
      }
      throw err;
    }

    for (const item of page.items ?? []) {
      const t = item?.track ?? item?.item;
      if (!t || !t.id || t.is_local || !t.name) continue;
      tracks.push({
        id: t.id,
        title: t.name,
        artist: (t.artists ?? []).map((a) => a?.name).filter(Boolean).join(', '),
        albumArtUrl: t.album?.images?.[0]?.url ?? '',
        previewUrl: '',
        popularity: t.popularity ?? 0,
      });
    }

    path = page.next ? page.next.replace(API_BASE, '') : null;
  }

  return tracks;
}
