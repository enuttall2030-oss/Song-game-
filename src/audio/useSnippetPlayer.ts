import { useCallback, useEffect, useRef, useState } from 'react';
import { SnippetPlayer } from './SnippetPlayer';

export interface UseSnippetPlayerResult {
  isPlaying: boolean;
  /** Duration of the loaded preview clip in seconds, once known. */
  durationSec: number | undefined;
  loadError: string | undefined;
  playSnippet: (startSec: number, durationSec: number) => void;
}

/**
 * Turns a rejection from the audio element into copy worth showing, or `undefined` for the
 * failures that aren't failures. A `play()` cut short by the next `play()`/`pause()` rejects with
 * AbortError — routine when a snippet is re-triggered — and must never leave an error sitting
 * under a button that works.
 */
export function playbackErrorMessage(err: Error): string | undefined {
  if (err.name === 'AbortError') return undefined;
  if (err.name === 'NotAllowedError') {
    return 'Your browser blocked audio until you interact with the page. Press Play again.';
  }
  return err.message;
}

/** React adapter around SnippetPlayer, scoped to one preview URL for the lifetime of the round. */
export function useSnippetPlayer(previewUrl: string | undefined): UseSnippetPlayerResult {
  const playerRef = useRef<SnippetPlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [durationSec, setDurationSec] = useState<number>();
  const [loadError, setLoadError] = useState<string>();

  useEffect(() => {
    setDurationSec(undefined);
    setLoadError(undefined);
    setIsPlaying(false);

    if (!previewUrl) {
      playerRef.current = null;
      return;
    }

    const player = new SnippetPlayer(previewUrl);
    playerRef.current = player;

    // Every result is gated on this player still being the current one. Two players briefly
    // coexist on any track change (and on every StrictMode remount in dev), and a retired one
    // must not write its outcome into the state the live one shares.
    const isCurrent = () => playerRef.current === player && !player.isDisposed;

    player
      .loadMetadata()
      .then((seconds) => {
        if (isCurrent()) setDurationSec(seconds);
      })
      .catch((err: Error) => {
        if (isCurrent()) setLoadError(err.message);
      });

    return () => {
      player.dispose();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [previewUrl]);

  const playSnippet = useCallback((startSec: number, snippetDurationSec: number) => {
    const player = playerRef.current;
    if (!player) return;
    setIsPlaying(true);
    setLoadError(undefined);
    void player
      .playSnippet(startSec, snippetDurationSec, () => {
        if (playerRef.current === player) setIsPlaying(false);
      })
      .catch((err: Error) => {
        if (playerRef.current !== player) return;
        setIsPlaying(false);
        const message = playbackErrorMessage(err);
        if (message) setLoadError(message);
      });
  }, []);

  return { isPlaying, durationSec, loadError, playSnippet };
}
