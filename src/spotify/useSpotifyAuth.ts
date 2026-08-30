import { useEffect, useRef } from 'react';
import { clearOAuthCallbackParams, readOAuthCallbackParams } from '../app/router';
import type { PlayerSlot } from '../game/types';
import { buildAuthorizeUrl, exchangeCodeForToken } from './auth';
import { getMe } from './client';
import { getToken, setToken } from './tokenStore';

export interface OAuthResolved {
  slot: PlayerSlot;
  spotifyUserId: string;
  displayName: string;
}

/**
 * Redirects the browser to Spotify's authorize page for the given slot. Screens call this instead
 * of touching `auth.ts` directly, keeping every OAuth/fetch concern inside `spotify/`. Returns the
 * promise so a failure before the redirect (missing client id, crypto unavailable) reaches the UI
 * instead of dying as an unhandled rejection behind a button that appears to do nothing.
 */
export function connectPlayer(slot: PlayerSlot): Promise<void> {
  return buildAuthorizeUrl(slot).then((url) => {
    window.location.href = url;
  });
}

/**
 * Runs once on app mount: if the URL carries a Spotify `?code=&state=` redirect, completes the PKCE
 * exchange, stores the token under the resolved slot, fetches the account id, and hands the result
 * back via `onResolved` — then strips the query params so a refresh can't replay a used code.
 */
export function useSpotifyAuthCallback(
  onResolved: (result: OAuthResolved) => void,
  onError: (message: string) => void,
): void {
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    let params: ReturnType<typeof readOAuthCallbackParams>;
    try {
      params = readOAuthCallbackParams();
    } catch (err) {
      clearOAuthCallbackParams();
      onError((err as Error).message);
      return;
    }
    if (!params) return;

    const { code, state } = params;
    void (async () => {
      try {
        const { slot, token } = await exchangeCodeForToken(code, state);
        setToken(slot, token);
        const me = await getMe(token.accessToken);
        onResolved({ slot, spotifyUserId: me.id, displayName: me.display_name ?? `Player ${slot}` });
      } catch (err) {
        onError((err as Error).message);
      } finally {
        clearOAuthCallbackParams();
      }
    })();
    // Intentionally run only once on mount; onResolved/onError are dispatch-stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function getAccessTokenForSlot(slot: PlayerSlot): string | undefined {
  return getToken(slot)?.accessToken;
}
