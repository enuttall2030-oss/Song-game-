import { describe, expect, it } from 'vitest';
import { FIXTURE_NAMES, buildFixturePlaylist } from '../app/devFixtures';
import { generateToneObjectUrl } from '../utils/generateToneWav';

describe('generateToneObjectUrl', () => {
  // The regression this guards: these clips used to be base64 data URIs. 20s of 22kHz PCM encodes
  // to ~1.2MB, which Chrome silently refuses to load into a media element (readyState stays 0 —
  // no `loadedmetadata`, no `error`), so dev mode had no working audio at all. The same bytes
  // behind a blob URL load fine, and keep the match state small enough for sessionStorage.
  it('returns a blob URL, never an inline data URI', () => {
    const url = generateToneObjectUrl(20, 220);

    expect(url.startsWith('blob:')).toBe(true);
    expect(url).not.toContain('base64');
    expect(url.length).toBeLessThan(200);
  });

  it('gives every call its own URL', () => {
    expect(generateToneObjectUrl(1, 220)).not.toBe(generateToneObjectUrl(1, 220));
  });
});

describe('buildFixturePlaylist', () => {
  it('builds a playlist that clears the minimum playable-track bar', () => {
    const playlist = buildFixturePlaylist('Alice');

    // `minPlayableTracks` defaults to 10; a fixture match must not be rejected by its own reducer.
    expect(playlist.length).toBeGreaterThanOrEqual(10);
  });

  it('gives every track a unique id and a playable preview', () => {
    const playlist = buildFixturePlaylist('Alice');

    expect(new Set(playlist.map((t) => t.id)).size).toBe(playlist.length);
    for (const t of playlist) {
      expect(t.previewUrl.startsWith('blob:')).toBe(true);
      expect(t.title).toContain('Alice');
    }
  });

  it('keeps different players\' playlists disjoint, so a pick is unambiguous', () => {
    const alice = buildFixturePlaylist('Alice').map((t) => t.id);
    const bob = buildFixturePlaylist('Bob').map((t) => t.id);

    expect(alice.filter((id) => bob.includes(id))).toEqual([]);
  });

  it('has a fixture name for every supported player slot', () => {
    expect(FIXTURE_NAMES).toHaveLength(5);
  });
});
