function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** RFC 7636 code_verifier: 43-128 chars from the unreserved character set. base64url already satisfies this. */
export function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(64));
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

/** Opaque anti-CSRF token echoed back by Spotify on the redirect. */
export function generateState(): string {
  return base64UrlEncode(randomBytes(16));
}
