import { describe, expect, it, vi } from 'vitest';
import { SnippetPlayer } from '../audio/SnippetPlayer';

/**
 * A stand-in for HTMLAudioElement with a hand-driven event pump. jsdom has no media pipeline —
 * a real <audio> never loads, errors, or plays — so the load/error/dispose interleavings that
 * actually caused bugs in the browser can only be reproduced by firing the events directly.
 */
function fakeAudio() {
  const listeners = new Map<string, Set<() => void>>();
  const el = {
    src: 'https://example.test/clip.m4a',
    preload: '',
    currentTime: 0,
    duration: NaN as number,
    readyState: 0,
    ended: false,
    paused: true,
    load: vi.fn(),
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    addEventListener(type: string, fn: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.get(type)?.delete(fn);
    },
  };
  return {
    el: el as unknown as HTMLAudioElement,
    fire(type: string) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn();
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

/** Lets any already-queued microtasks settle so a promise's fate is observable. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('SnippetPlayer.loadMetadata', () => {
  it('resolves with the clip duration once metadata arrives', async () => {
    const audio = fakeAudio();
    const player = new SnippetPlayer('u', audio.el);

    const promise = player.loadMetadata();
    (audio.el as unknown as { duration: number }).duration = 29.7;
    audio.fire('loadedmetadata');

    await expect(promise).resolves.toBe(29.7);
  });

  it('resolves immediately when the element already knows its duration', async () => {
    const audio = fakeAudio();
    Object.assign(audio.el, { readyState: 1, duration: 30 });

    await expect(new SnippetPlayer('u', audio.el).loadMetadata()).resolves.toBe(30);
  });

  it('rejects on a genuine load error', async () => {
    const audio = fakeAudio();
    const promise = new SnippetPlayer('u', audio.el).loadMetadata();

    audio.fire('error');

    await expect(promise).rejects.toThrow('Failed to load audio preview.');
  });

  it('hands back the same promise rather than restarting the load', () => {
    const audio = fakeAudio();
    const player = new SnippetPlayer('u', audio.el);

    expect(player.loadMetadata()).toBe(player.loadMetadata());
    expect((audio.el.load as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('detaches its listeners once metadata has arrived', async () => {
    const audio = fakeAudio();
    const player = new SnippetPlayer('u', audio.el);

    void player.loadMetadata();
    expect(audio.listenerCount('error')).toBe(1);
    audio.fire('loadedmetadata');
    await flush();

    expect(audio.listenerCount('loadedmetadata')).toBe(0);
    expect(audio.listenerCount('error')).toBe(0);
  });
});

describe('SnippetPlayer.dispose', () => {
  // The bug this guards: dispose() clears `src`, which makes the browser fire a synthetic
  // `error` ("MEDIA_ELEMENT_ERROR: Empty src attribute"). That rejected the in-flight metadata
  // promise, and the hook wrote it into shared state as "Failed to load audio preview." over a
  // clip that was loading fine — visible on every track change and every dev StrictMode remount.
  it('does not reject an in-flight metadata load', async () => {
    const audio = fakeAudio();
    const player = new SnippetPlayer('u', audio.el);

    let rejection: Error | undefined;
    void player.loadMetadata().catch((err: Error) => {
      rejection = err;
    });

    player.dispose();
    audio.fire('error'); // what the browser does in response to src = ''
    await flush();

    expect(rejection).toBeUndefined();
  });

  it('detaches the metadata listeners before clearing src', () => {
    const audio = fakeAudio();
    const player = new SnippetPlayer('u', audio.el);

    void player.loadMetadata();
    player.dispose();

    expect(audio.listenerCount('loadedmetadata')).toBe(0);
    expect(audio.listenerCount('error')).toBe(0);
    expect(audio.el.src).toBe('');
  });

  it('reports itself as disposed so callers can discard its results', () => {
    const player = new SnippetPlayer('u', fakeAudio().el);

    expect(player.isDisposed).toBe(false);
    player.dispose();
    expect(player.isDisposed).toBe(true);
  });

  it('pauses playback on the way out', () => {
    const audio = fakeAudio();
    const player = new SnippetPlayer('u', audio.el);

    player.dispose();

    expect(audio.el.pause).toHaveBeenCalled();
  });
});

describe('SnippetPlayer.playSnippet', () => {
  it('seeks to the offset and starts playback', async () => {
    const audio = fakeAudio();
    const player = new SnippetPlayer('u', audio.el);

    await player.playSnippet(12.5, 0.1, () => {});

    expect(audio.el.currentTime).toBe(12.5);
    expect(audio.el.play).toHaveBeenCalled();
  });

  it('stops once currentTime passes the snippet window and reports back', async () => {
    const audio = fakeAudio();
    const player = new SnippetPlayer('u', audio.el);
    const onStop = vi.fn();

    await player.playSnippet(10, 0.5, onStop);
    // The stop condition polls currentTime on rAF rather than trusting a timer, so advance the
    // clip past the window and let one frame run.
    audio.el.currentTime = 10.5;
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(audio.el.pause).toHaveBeenCalled();
  });

  it('propagates a rejected play() so the caller can decide what it means', async () => {
    const audio = fakeAudio();
    const denied = Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
    (audio.el as unknown as { play: () => Promise<void> }).play = () => Promise.reject(denied);

    await expect(new SnippetPlayer('u', audio.el).playSnippet(0, 0.1, () => {})).rejects.toBe(denied);
  });
});
