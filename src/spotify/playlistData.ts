import type { GameTrack, PlayerSlot } from '../game/types';
import { getMyPlaylists, getPlaylistTracks } from './client';
import { getAccessTokenForSlot } from './useSpotifyAuth';
import type { SpotifyPlaylistSummary } from './types';

function requireAccessToken(slot: PlayerSlot): string {
  const token = getAccessTokenForSlot(slot);
  if (!token) throw new Error(`No Spotify session for ${slot} — please reconnect.`);
  return token;
}

export async function fetchPlaylistsForSlot(slot: PlayerSlot): Promise<SpotifyPlaylistSummary[]> {
  return getMyPlaylists(requireAccessToken(slot));
}

export async function fetchPlaylistTracksForSlot(slot: PlayerSlot, playlistId: string): Promise<GameTrack[]> {
  return getPlaylistTracks(requireAccessToken(slot), playlistId);
}
