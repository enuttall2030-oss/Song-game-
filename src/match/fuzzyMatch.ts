/**
 * Strips the parts of a track title that vary between "editions" of the same song but that a
 * guesser wouldn't reasonably be expected to type: featured-artist credits, remaster/live/version
 * tags, and punctuation/case differences.
 */
export function normalizeTitle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(feat\.?[^)]*\)/g, '')
    .replace(/\[feat\.?[^\]]*\]/g, '')
    .replace(/-\s*(remaster(ed)?|live|mono|stereo|single|album)\s*(version)?\s*(\d{4})?/gi, '')
    .replace(/\((remaster(ed)?|live|mono|stereo|single|album)[^)]*\)/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    const currentRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow.push(
        Math.min(
          currentRow[j - 1] + 1, // insertion
          previousRow[j] + 1, // deletion
          previousRow[j - 1] + cost, // substitution
        ),
      );
    }
    previousRow = currentRow;
  }

  return previousRow[b.length];
}

/** Threshold scales with title length so short titles still demand near-exact matches. */
export function maxAllowedDistance(normalizedTitle: string): number {
  return Math.max(2, Math.floor(normalizedTitle.length * 0.2));
}

export function isGuessCorrect(guess: string, actualTitle: string): boolean {
  const normalizedGuess = normalizeTitle(guess);
  const normalizedActual = normalizeTitle(actualTitle);
  if (normalizedGuess.length === 0) return false;
  const distance = levenshteinDistance(normalizedGuess, normalizedActual);
  return distance <= maxAllowedDistance(normalizedActual);
}
