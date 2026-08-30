import { describe, expect, it } from 'vitest';
import { isGuessCorrect, levenshteinDistance, normalizeTitle } from '../match/fuzzyMatch';

describe('normalizeTitle', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeTitle("Don't Stop Believin'")).toBe('dont stop believin');
  });

  it('strips feat. credits in parens or brackets', () => {
    expect(normalizeTitle('No Role Modelz (feat. Someone)')).toBe('no role modelz');
    expect(normalizeTitle('Blessings [feat. Drake & Chance the Rapper]')).toBe('blessings');
  });

  it('strips remaster/live/version tags', () => {
    expect(normalizeTitle('Comfortably Numb - Remastered 2011')).toBe('comfortably numb');
    expect(normalizeTitle('Landslide (Live)')).toBe('landslide');
  });

  it('collapses whitespace', () => {
    expect(normalizeTitle('  Space   Song  ')).toBe('space song');
  });
});

describe('levenshteinDistance', () => {
  it('is 0 for identical strings', () => {
    expect(levenshteinDistance('abc', 'abc')).toBe(0);
  });

  it('handles empty strings', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  it('counts a single substitution as distance 1', () => {
    expect(levenshteinDistance('cat', 'car')).toBe(1);
  });

  it('counts insertions/deletions correctly', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
  });
});

describe('isGuessCorrect', () => {
  it('accepts an exact match', () => {
    expect(isGuessCorrect('Mr. Brightside', 'Mr. Brightside')).toBe(true);
  });

  it('tolerates minor typos', () => {
    expect(isGuessCorrect('mr brigtside', 'Mr. Brightside')).toBe(true);
    expect(isGuessCorrect('bohemian rapsody', 'Bohemian Rhapsody')).toBe(true);
  });

  it('ignores case, punctuation, and feat./remaster suffixes on the real title', () => {
    expect(isGuessCorrect('no role modelz', 'No Role Modelz (feat. Someone)')).toBe(true);
  });

  it('rejects a completely different title', () => {
    expect(isGuessCorrect('yellow submarine', 'Bohemian Rhapsody')).toBe(false);
  });

  it('rejects an empty guess', () => {
    expect(isGuessCorrect('', 'Bohemian Rhapsody')).toBe(false);
    expect(isGuessCorrect('   ', 'Bohemian Rhapsody')).toBe(false);
  });

  it('demands a tighter match for short titles', () => {
    // "Yes" vs "No" — both length 2-3, should not be conflated despite small edit distance.
    expect(isGuessCorrect('No', 'Yes')).toBe(false);
  });
});
