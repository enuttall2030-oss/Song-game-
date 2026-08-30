export interface OAuthCallbackParams {
  code: string;
  state: string;
}

/**
 * Reads Spotify's `?code=&state=` redirect params, if present. Not a real router — this app has no
 * other URL-addressable state — but this is the one place the app needs to be URL-aware.
 */
export function readOAuthCallbackParams(location: Location = window.location): OAuthCallbackParams | undefined {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  if (error) {
    throw new Error(`Spotify authorization was denied or failed: ${error}`);
  }

  if (!code || !state) return undefined;
  return { code, state };
}

/** Strips the OAuth query params so a page refresh doesn't try to re-exchange a used/stale code. */
export function clearOAuthCallbackParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('error');
  window.history.replaceState({}, '', url.toString());
}
