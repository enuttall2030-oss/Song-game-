/**
 * Wraps a single HTMLAudioElement to play an exact [start, start+duration) window of a preview
 * clip and stop precisely. A 0.1s snippet is extremely sensitive to timer jitter, so the stop
 * condition is driven by polling `audio.currentTime` (ground truth of what has actually played)
 * on a requestAnimationFrame loop, not a `setTimeout`, which can drift tens of ms at this scale.
 */
export class SnippetPlayer {
  private readonly audio: HTMLAudioElement;
  private rafHandle: number | null = null;
  private metadataPromise: Promise<number> | null = null;
  /** Detaches the in-flight metadata listeners, while a metadata load is pending. */
  private detachMetadataListeners: (() => void) | null = null;
  private disposed = false;

  /** `audio` is injectable so tests can drive load/error events without a real media pipeline. */
  constructor(previewUrl: string, audio: HTMLAudioElement = new Audio(previewUrl)) {
    this.audio = audio;
    this.audio.preload = 'auto';
  }

  /** Resolves once the browser knows the clip's real duration (only known after it starts loading). */
  loadMetadata(): Promise<number> {
    if (this.metadataPromise) return this.metadataPromise;

    this.metadataPromise = new Promise((resolve, reject) => {
      if (this.audio.readyState >= 1 && Number.isFinite(this.audio.duration)) {
        resolve(this.audio.duration);
        return;
      }
      const onLoaded = () => {
        cleanup();
        resolve(this.audio.duration);
      };
      const onError = () => {
        cleanup();
        reject(new Error('Failed to load audio preview.'));
      };
      const cleanup = () => {
        this.detachMetadataListeners = null;
        this.audio.removeEventListener('loadedmetadata', onLoaded);
        this.audio.removeEventListener('error', onError);
      };
      this.detachMetadataListeners = cleanup;
      this.audio.addEventListener('loadedmetadata', onLoaded);
      this.audio.addEventListener('error', onError);
      this.audio.load();
    });

    return this.metadataPromise;
  }

  /**
   * Must be called synchronously inside a user-gesture handler (the Play button's click), never
   * from an effect or timeout, or Safari/iOS will silently block playback.
   */
  async playSnippet(startSec: number, durationSec: number, onStop: () => void): Promise<void> {
    this.stop();
    this.audio.currentTime = startSec;
    await this.audio.play();

    const stopAtSec = startSec + durationSec;
    const tick = () => {
      if (this.audio.currentTime >= stopAtSec || this.audio.ended) {
        this.stopPlayback();
        onStop();
        return;
      }
      this.rafHandle = requestAnimationFrame(tick);
    };
    this.rafHandle = requestAnimationFrame(tick);
  }

  private stopPlayback(): void {
    this.audio.pause();
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  stop(): void {
    this.stopPlayback();
  }

  /** True once `dispose` has run: this player is retired and its results must be ignored. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    // Detach the metadata listeners *before* clearing `src`. Clearing it makes the browser fire a
    // synthetic `error` ("MEDIA_ELEMENT_ERROR: Empty src attribute"), which would otherwise reject
    // the in-flight metadata promise — surfacing "Failed to load audio preview." over a clip that
    // was loading perfectly well, on every track change and on every dev StrictMode remount.
    this.detachMetadataListeners?.();
    this.audio.src = '';
  }
}
