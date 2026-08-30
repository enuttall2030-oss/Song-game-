import { describe, expect, it } from 'vitest';
import { toPlaylistSummary } from '../spotify/client';

describe('toPlaylistSummary', () => {
  it('normalizes a complete playlist unchanged', () => {
    const summary = toPlaylistSummary({ id: 'p1', name: 'Roadtrip', images: [], tracks: { total: 42 } });
    expect(summary).toEqual({ id: 'p1', name: 'Roadtrip', images: [], tracks: { total: 42 } });
  });

  it("reads Spotify's renamed `items` count when `tracks` is absent", () => {
    // The live API returns `items: { href, total }`; the docs still say `tracks`. Reading only the
    // documented spelling made every playlist in a real account render as "0 tracks".
    expect(toPlaylistSummary({ id: 'p9', name: '🏡', items: { total: 196 } })?.tracks.total).toBe(196);
  });

  it('prefers the documented `tracks` count when both are present', () => {
    const summary = toPlaylistSummary({ id: 'p9', name: 'Both', tracks: { total: 5 }, items: { total: 7 } });
    expect(summary?.tracks.total).toBe(5);
  });

  it('survives a playlist with neither count', () => {
    // The exact shape that blanked the app: Spotify returned an entry with no `tracks` at all.
    expect(toPlaylistSummary({ id: 'p2', name: 'Odd one' })?.tracks.total).toBe(0);
  });

  it('drops null items and entries with no id', () => {
    expect(toPlaylistSummary(null)).toBeUndefined();
    expect(toPlaylistSummary(undefined)).toBeUndefined();
    expect(toPlaylistSummary({ name: 'No id', tracks: { total: 3 } })).toBeUndefined();
  });

  it('falls back to a placeholder name and empty images', () => {
    const summary = toPlaylistSummary({ id: 'p3', name: null, images: null, tracks: { total: null } });
    expect(summary).toEqual({ id: 'p3', name: 'Untitled playlist', images: [], tracks: { total: 0 } });
  });
});
