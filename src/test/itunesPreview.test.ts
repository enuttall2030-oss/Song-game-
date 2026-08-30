import { describe, expect, it, vi } from 'vitest';
import {
  ItunesLookupError,
  buildSearchTerm,
  fetchItunesPreviewUrl,
  pickBestMatch,
  primaryArtist,
  type ItunesSearchResult,
} from '../preview/itunesPreview';

function result(trackName: string, artistName: string, previewUrl?: string): ItunesSearchResult {
  return { trackName, artistName, previewUrl };
}

const okResponse = (results: ItunesSearchResult[]) =>
  ({ ok: true, status: 200, json: async () => ({ resultCount: results.length, results }) }) as unknown as Response;

const failResponse = (status: number) => ({ ok: false, status }) as unknown as Response;

describe('primaryArtist', () => {
  it('keeps only the lead artist', () => {
    expect(primaryArtist('Calvin Harris, Dua Lipa')).toBe('Calvin Harris');
    expect(primaryArtist('Eminem feat. Rihanna')).toBe('Eminem');
    expect(primaryArtist('Simon & Garfunkel')).toBe('Simon');
    expect(primaryArtist('Solo Act')).toBe('Solo Act');
  });
});

describe('buildSearchTerm', () => {
  it('strips edition tags and secondary artists from the query', () => {
    expect(buildSearchTerm('Bohemian Rhapsody - Remastered 2011', 'Queen')).toBe('bohemian rhapsody queen');
    expect(buildSearchTerm('Levitating (feat. DaBaby)', 'Dua Lipa, DaBaby')).toBe('levitating dua lipa');
  });
});

describe('pickBestMatch', () => {
  it('requires a previewUrl', () => {
    expect(pickBestMatch('Blinding Lights', 'The Weeknd', [result('Blinding Lights', 'The Weeknd')])).toBeUndefined();
  });

  it('rejects a same-title cover by a different artist', () => {
    const results = [result('Blinding Lights', 'Karaoke Kings', 'https://a/1')];
    expect(pickBestMatch('Blinding Lights', 'The Weeknd', results)).toBeUndefined();
  });

  it('prefers the studio take over a live/remix variant of the same title', () => {
    const results = [
      result('Blinding Lights (Live)', 'The Weeknd', 'https://a/live'),
      result('Blinding Lights', 'The Weeknd', 'https://a/studio'),
    ];
    expect(pickBestMatch('Blinding Lights', 'The Weeknd', results)?.previewUrl).toBe('https://a/studio');
  });

  it('still uses a variant when it is the only match', () => {
    const results = [result('Blinding Lights (Live)', 'The Weeknd', 'https://a/live')];
    expect(pickBestMatch('Blinding Lights', 'The Weeknd', results)?.previewUrl).toBe('https://a/live');
  });

  it('matches across catalogues that order collaborators differently', () => {
    const results = [result('Sprinter (Mixed)', 'Central Cee & Dave', 'https://a/mixed')];
    expect(pickBestMatch('Sprinter', 'Dave, Central Cee', results)?.previewUrl).toBe('https://a/mixed');
  });

  it('falls back to an edition-suffixed release, preferring the least-altered one', () => {
    // The real result set for "Sprinter": Apple's US store carries no plain studio single.
    const results = [
      result('Sprinter (Apple Music Live)', 'Dave & Central Cee', 'https://a/live'),
      result('Sprinter (Tiësto Remix) [Mixed]', 'Central Cee & Dave', 'https://a/remix'),
      result('Sprinter (Mixed)', 'Central Cee & Dave', 'https://a/mixed'),
    ];
    expect(pickBestMatch('Sprinter', 'Dave, Central Cee', results)?.previewUrl).toBe('https://a/mixed');
  });

  it('rejects karaoke impostors even when they are the only results with previews', () => {
    const results = [
      result('Two Weeks (Originally Performed By FKA Twigs) [Instrumental]', "Singer's Edge Karaoke", 'https://a/k1'),
      result('Two Weeks (Karaoke Version) [Originally Performed by FKA twigs]', 'Backing Force', 'https://a/k2'),
    ];
    expect(pickBestMatch('Two Weeks', 'FKA twigs', results)).toBeUndefined();
  });

  it('matches a remastered Spotify title against the plain Apple title', () => {
    const results = [result('Bohemian Rhapsody', 'Queen', 'https://a/bo')];
    expect(pickBestMatch('Bohemian Rhapsody - Remastered 2011', 'Queen', results)?.previewUrl).toBe('https://a/bo');
  });

  it('tolerates accent/spelling drift between catalogues', () => {
    const results = [result('Halo', 'Beyonce', 'https://a/halo')];
    expect(pickBestMatch('Halo', 'Beyoncé', results)?.previewUrl).toBe('https://a/halo');
  });

  it('rejects a different song by the same artist', () => {
    const results = [result('Save Your Tears', 'The Weeknd', 'https://a/tears')];
    expect(pickBestMatch('Blinding Lights', 'The Weeknd', results)).toBeUndefined();
  });
});

describe('fetchItunesPreviewUrl', () => {
  it('returns the matched preview url', async () => {
    const fetchImpl = vi.fn(async () => okResponse([result('Halo', 'Beyoncé', 'https://a/halo')]));
    await expect(fetchItunesPreviewUrl('Halo', 'Beyoncé', { fetchImpl })).resolves.toBe('https://a/halo');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('returns undefined when nothing in the catalogue matches', async () => {
    const fetchImpl = vi.fn(async () => okResponse([]));
    await expect(fetchItunesPreviewUrl('Obscure Demo', 'Nobody', { fetchImpl })).resolves.toBeUndefined();
  });

  it('retries once on a 429 and flags rate limiting when it persists', async () => {
    const fetchImpl = vi.fn(async () => failResponse(429));
    const delay = vi.fn(async () => {});
    const error = await fetchItunesPreviewUrl('Halo', 'Beyoncé', { fetchImpl, delay }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(ItunesLookupError);
    expect((error as ItunesLookupError).rateLimited).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledOnce();
  });

  it('succeeds on the retry after a transient 503', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(failResponse(503))
      .mockResolvedValueOnce(okResponse([result('Halo', 'Beyoncé', 'https://a/halo')]));
    const url = await fetchItunesPreviewUrl('Halo', 'Beyoncé', { fetchImpl, delay: async () => {} });
    expect(url).toBe('https://a/halo');
  });

  it('does not retry a non-throttling client error', async () => {
    const fetchImpl = vi.fn(async () => failResponse(403));
    const error = await fetchItunesPreviewUrl('Halo', 'Beyoncé', { fetchImpl, delay: async () => {} }).catch(
      (e: Error) => e,
    );
    expect((error as ItunesLookupError).rateLimited).toBe(false);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
