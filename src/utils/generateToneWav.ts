/**
 * Synthesizes a short mono PCM WAV tone entirely locally (no network) and returns a blob: URL for
 * it, so dev/demo mode has real playable audio to exercise the snippet-timing engine against
 * without needing a live Spotify preview URL.
 *
 * A blob URL, not a data URI: 20s of 22kHz PCM is ~880KB, and base64-encoding that into a data URI
 * produces a ~1.2MB string that Chrome will not decode for a media element at all (readyState
 * stays 0, no `loadedmetadata`, no `error` — the clip just never loads). The same bytes behind a
 * blob URL load instantly, and keep match state small enough to still fit in sessionStorage.
 */
export function generateToneObjectUrl(durationSec: number, freqHz: number, sampleRate = 22050): string {
  const numSamples = Math.floor(durationSec * sampleRate);
  const blockAlign = 2; // 16-bit mono
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // A little envelope + a rising pitch so different snippet windows sound distinguishable.
    const envelope = Math.min(1, t * 20) * Math.min(1, (durationSec - t) * 20 + 0.1);
    const sample = Math.sin(2 * Math.PI * (freqHz + t * 40) * t) * envelope * 0.4;
    view.setInt16(44 + i * blockAlign, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
  }

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function writeString(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}
