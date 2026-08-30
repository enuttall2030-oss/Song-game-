import { useCallback, useEffect, useRef, useState } from 'react';
import { SnippetPlayer } from './SnippetPlayer';

export interface UseSnippetPlayerResult {
  isPlaying: boolean;
  /** Duration of the loaded preview clip in seconds, once known. */
  durationSec: number | undefined;
  loadError: string | undefined;
  playSnippet: (startSec: number, durationSec: number) => void;
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

    player
      .loadMetadata()
      .then(setDurationSec)
      .catch((err: Error) => setLoadError(err.message));

    return () => {
      player.dispose();
      playerRef.current = null;
    };
  }, [previewUrl]);

  const playSnippet = useCallback((startSec: number, snippetDurationSec: number) => {
    const player = playerRef.current;
    if (!player) return;
    setIsPlaying(true);
    void player
      .playSnippet(startSec, snippetDurationSec, () => setIsPlaying(false))
      .catch((err: Error) => {
        setIsPlaying(false);
        setLoadError(err.message);
      });
  }, []);

  return { isPlaying, durationSec, loadError, playSnippet };
}
