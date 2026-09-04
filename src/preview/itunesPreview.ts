import { levenshteinDistance, maxAllowedDistance, normalizeTitle } from '../match/fuzzyMatch';

const SEARCH_URL = 'https://itunes.apple.com/search';
/**
 * Enough candidates to look past the covers, karaoke versions and same-title songs by other
 * artists that crowd the top of Apple's relevance ranking (e.g. "Two Weeks" returns Grizzly Bear's
 * before FKA twigs').
 */
const RESULT_LIMIT = 10;

export interface ItunesSearchResult {
  trackName: string;
  artistName: string;
  previewUrl?: string;
}

export interface ItunesSearchResponse {
  resultCount: number;
  results: ItunesSearchResult[];
}

/**
 * Spotify joins every credited artist with ", "; Apple's search does much better with just the
 * lead artist, and featured credits are noise in both the query and the match check.
 */
export function primaryArtist(artist: string): string {
  const lead = artist.split(/,|;|&|\/|\bfeat\.?\b|\bft\.?\b|\bwith\b/i)[0];
  return lead.trim();
}

function normalizeArtistText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeArtist(raw: string): string {
  return normalizeArtistText(primaryArtist(raw));
}

/** Title is normalized the same way guesses are, so remaster/live tags don't derail the search. */
export function buildSearchTerm(title: string, artist: string): string {
  return `${normalizeTitle(title)} ${normalizeArtist(artist)}`.replace(/\s+/g, ' ').trim();
}

/** True when `needle`'s words appear as a contiguous run inside `haystack`'s words. */
function containsTokenRun(haystack: string, needle: string): boolean {
  const h = haystack.split(' ');
  const n = needle.split(' ');
  if (n.length === 0 || n.length > h.length) return false;
  for (let i = 0; i <= h.length - n.length; i++) {
    if (n.every((token, j) => token === h[i + j])) return true;
  }
  return false;
}

/**
 * Compares our lead artist against the candidate's *whole* credit line, because the two catalogues
 * order collaborators differently — Spotify's "Dave, Central Cee" is Apple's "Central Cee & Dave",
 * and reducing both to a lead artist would call that a mismatch.
 */
function artistMatches(wanted: string, candidate: string): boolean {
  const lead = normalizeArtist(wanted);
  const credit = normalizeArtistText(candidate);
  if (!lead || !credit) return false;
  if (lead === credit) return true;
  if (containsTokenRun(credit, lead) || containsTokenRun(lead, normalizeArtist(candidate))) return true;
  // Tolerate small spelling/transliteration drift between catalogues ("Beyonce"/"Beyoncé").
  const candidateLead = normalizeArtist(candidate);
  return levenshteinDistance(lead, candidateLead) <= Math.max(2, Math.floor(lead.length * 0.15));
}

const VARIANT_TAG = /\b(live|remix|karaoke|instrumental|acoustic|cover|tribute|sped up|slowed)\b/i;

/**
 * Strips a trailing edition suffix — "(Mixed)", "[Explicit]", "- 2019 Mix" — that `normalizeTitle`
 * keeps because it isn't one of the tags a *guesser* would omit. Apple's catalogue often carries
 * only such an edition of a song ("Sprinter (Mixed)"), and that clip is still the right recording,
 * so the base title is tried as a fallback comparison.
 */
function baseTitle(raw: string): string {
  return normalizeTitle(
    raw
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\s+-\s+.*$/, ' '),
  );
}

/**
 * `normalizeTitle` deliberately erases "(Live)"-style tags so guesses still match, which means a
 * live take and the studio take score an identical distance. For *audio* they are not equivalent —
 * a live recording is a materially harder and unfairer snippet — so tagged variants are ranked
 * below clean ones and only win if nothing else matched.
 */
function variantPenalty(rawTitle: string): number {
  return VARIANT_TAG.test(rawTitle) ? 1 : 0;
}

/**
 * Picks the Apple result that is really the same recording: the title must be within the same
 * fuzzy distance the guess-matcher allows, the artist must line up, and a result without a
 * `previewUrl` is worthless to us no matter how well it matches.
 */
export function pickBestMatch(
  title: string,
  artist: string,
  results: ItunesSearchResult[],
): ItunesSearchResult | undefined {
  const wantedTitle = normalizeTitle(title);
  const allowed = maxAllowedDistance(wantedTitle);

  let best: ItunesSearchResult | undefined;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const result of results) {
    if (!result.previewUrl) continue;
    if (!artistMatches(artist, result.artistName)) continue;
    const fullDistance = levenshteinDistance(wantedTitle, normalizeTitle(result.trackName));
    const baseDistance = levenshteinDistance(wantedTitle, baseTitle(result.trackName));
    const usedBase = baseDistance < fullDistance;
    const distance = Math.min(fullDistance, baseDistance);
    if (distance > allowed) continue;

    // Distance dominates. Needing the stripped title, then a variant tag, only break ties — so an
    // untagged exact edition always wins over "(Mixed)", which in turn wins over a live take.
    const score = distance * 4 + (usedBase ? 2 : 0) + variantPenalty(result.trackName);
    if (score < bestScore) {
      best = result;
      bestScore = score;
    }
  }

  return best;
}

export class ItunesLookupError extends Error {
  readonly rateLimited: boolean;

  constructor(message: string, rateLimited: boolean) {
    super(message);
    this.name = 'ItunesLookupError';
    this.rateLimited = rateLimited;
  }
}

export interface FetchPreviewOptions {
  fetchImpl?: typeof fetch;
  /** Injected in tests so a retry doesn't actually sleep. */
  delay?: (ms: number) => Promise<void>;
}

const defaultDelay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Apple answers a breached rate limit with **403 Forbidden**, not the 429 you would expect — a
 * burst of lookups comes back as a wall of 403s. Treating 403 as a plain client error meant those
 * were reported as "this track has no preview", so a throttled scan looked exactly like a playlist
 * full of unavailable songs and the user was told to pick a different one.
 */
const THROTTLE_STATUSES = new Set([403, 429]);

/** Backoff between attempts. Apple's window is per-minute, so the last wait is a long one. */
const RETRY_DELAYS_MS = [1_500, 6_000];

/**
 * Looks up one track's 30s preview clip. Apple's Search API is CORS-open and unauthenticated, so
 * this works from the browser with no backend — but it is rate limited, so a throttled or 5xx
 * response is retried with backoff and then surfaces as a `rateLimited` error the caller can
 * report as such (silently reporting "no preview found" for a throttled lookup would be a lie).
 */
export async function fetchItunesPreviewUrl(
  title: string,
  artist: string,
  { fetchImpl = fetch, delay = defaultDelay }: FetchPreviewOptions = {},
): Promise<string | undefined> {
  const params = new URLSearchParams({
    term: buildSearchTerm(title, artist),
    entity: 'song',
    media: 'music',
    limit: String(RESULT_LIMIT),
  });
  const url = `${SEARCH_URL}?${params.toString()}`;

  let lastStatus = 0;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await delay(RETRY_DELAYS_MS[attempt - 1]);

    let response: Response;
    try {
      response = await fetchImpl(url);
    } catch {
      lastStatus = 0;
      continue;
    }

    if (response.ok) {
      const data = (await response.json()) as ItunesSearchResponse;
      return pickBestMatch(title, artist, data.results ?? [])?.previewUrl;
    }

    lastStatus = response.status;
    // Retry a throttle or a server hiccup; anything else is a real answer about this track.
    if (!THROTTLE_STATUSES.has(response.status) && response.status < 500) break;
  }

  throw new ItunesLookupError(
    `Apple preview lookup failed for "${title}" (${lastStatus || 'network error'}).`,
    THROTTLE_STATUSES.has(lastStatus),
  );
}
