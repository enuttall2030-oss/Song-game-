import type { PlayerSlot } from '../game/types';
import { getSpotifyClientId, getSpotifyRedirectUri } from '../utils/env';
import { generateCodeChallenge, generateCodeVerifier, generateState } from './pkce';
import type { SpotifyTokenResponse, StoredToken } from './types';

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

const SCOPES = ['user-read-private', 'playlist-read-private', 'playlist-read-collaborative', 'user-library-read'].join(
  ' ',
);

interface PendingAuth {
  slot: PlayerSlot;
  codeVerifier: string;
  state: string;
}

function pendingAuthKey(): string {
  return 'pr.auth.pending';
}

function savePendingAuth(pending: PendingAuth): void {
  sessionStorage.setItem(pendingAuthKey(), JSON.stringify(pending));
}

function takePendingAuth(): PendingAuth | undefined {
  const raw = sessionStorage.getItem(pendingAuthKey());
  if (!raw) return undefined;
  sessionStorage.removeItem(pendingAuthKey());
  return JSON.parse(raw) as PendingAuth;
}

/**
 * Builds the Spotify authorize URL for a given player slot and stashes the PKCE verifier + state
 * needed to complete the exchange after the redirect back. `show_dialog=true` is load-bearing: it
 * forces Spotify's account chooser instead of silently re-using whichever account is already
 * logged into the browser, which matters a lot when two humans share one browser sequentially.
 */
export async function buildAuthorizeUrl(slot: PlayerSlot): Promise<string> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  savePendingAuth({ slot, codeVerifier, state });

  const params = new URLSearchParams({
    client_id: getSpotifyClientId(),
    response_type: 'code',
    redirect_uri: getSpotifyRedirectUri(),
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    scope: SCOPES,
    state,
    show_dialog: 'true',
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface AuthCallbackResult {
  slot: PlayerSlot;
  token: StoredToken;
}

/**
 * Completes the PKCE exchange for a `?code=&state=` pair received on the redirect URI. Validates
 * `state` against what we stashed before redirecting, to guard against CSRF / a stale/foreign code.
 */
export async function exchangeCodeForToken(code: string, state: string): Promise<AuthCallbackResult> {
  const pending = takePendingAuth();
  if (!pending || pending.state !== state) {
    throw new Error('Spotify login could not be verified (missing or mismatched state). Please try connecting again.');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getSpotifyRedirectUri(),
    client_id: getSpotifyClientId(),
    code_verifier: pending.codeVerifier,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Spotify token exchange failed (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as SpotifyTokenResponse;
  return { slot: pending.slot, token: tokenResponseToStoredToken(data) };
}

export async function refreshAccessToken(refreshToken: string): Promise<StoredToken> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: getSpotifyClientId(),
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Spotify token refresh failed (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as SpotifyTokenResponse;
  return tokenResponseToStoredToken(data, refreshToken);
}

function tokenResponseToStoredToken(data: SpotifyTokenResponse, fallbackRefreshToken?: string): StoredToken {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? fallbackRefreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}
