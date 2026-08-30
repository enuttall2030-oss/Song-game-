function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(
      `Missing ${key}. Copy .env.example to .env.local and fill in your Spotify app's Client ID and redirect URI.`,
    );
  }
  return value;
}

export function getSpotifyClientId(): string {
  return requireEnv('VITE_SPOTIFY_CLIENT_ID');
}

export function getSpotifyRedirectUri(): string {
  return requireEnv('VITE_SPOTIFY_REDIRECT_URI');
}
