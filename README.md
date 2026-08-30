# Playlist Roulette

A local pass-and-play Spotify song-guessing game for **1 to 5 players**. Everyone connects their
own Spotify account and picks a playlist, then secretly chooses songs from someone else's playlist
for them to guess. Each song is guessed from an escalating ladder of audio snippets
(0.1s → 0.5s → 2s → 5s → 10s), scoring **75 / 50 / 30 / 20 / 10** — less audio needed = more points.

- **2–5 players**: each player picks for the player before them in the rotation, so everyone picks
  exactly as often as they guess. Songs are chosen in blocks of 5 rather than one at a time: all
  the picking happens up front, then the match plays those rounds straight through, so a 10-round
  match needs 2 picking handoffs instead of 10. In a longer match a new block starts once the
  previous block's songs are used up. A Picker can search the target playlist or hit the
  random-song button, which offers a song to confirm or re-roll before it's locked in.
- **Solo**: there's nobody to pick for you, so the game draws each song at random from your own
  playlist. No picking phase, no handoffs — start and guess.
- Tied for the lead at the end? Every tied player gets a sudden-death round on a random song, and
  another cycle runs if they're *still* level.

Player count and rounds per player are set on the home screen before the match starts.

## Where the audio comes from

Spotify supplies the **playlists** (whose songs are in play); Apple's iTunes Search API supplies
the **30-second preview clips**. Spotify's own `preview_url` field is not usable: as of
2024-11-27 it returns `null` for every track on any app registered after that date, so the game
matches each Spotify track to a preview clip in Apple's catalogue by title + artist instead. That
API is public, CORS-open and unauthenticated, so this still needs no backend and no Premium
account.

Consequences worth knowing before you play:

- **Not every track resolves.** Expect roughly 85–90% of a mainstream playlist to match; the rest
  (regional gaps, very obscure releases, Apple-absent albums) are filtered out before a Picker
  ever sees the list, so an unplayable song can never be chosen. A playlist needs at least 10
  matched tracks to be accepted.
- **Only a sample of a big playlist is checked.** Apple's search is rate limited, so the app looks
  up a random sample of up to 60 tracks per playlist (`PREVIEW_SAMPLE_SIZE` in
  `src/preview/resolvePreviews.ts`) rather than all 500 of them. Results are cached in
  localStorage, so re-picking a playlist is much faster the second time.
- **Matching is conservative.** Karaoke/tribute/instrumental re-recordings are rejected on artist,
  and where Apple carries only an alternate edition ("(Mixed)", a live take) the least-altered one
  is preferred.

## One-time setup: register a Spotify app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create an app.
2. Under **Redirect URIs**, add `http://127.0.0.1:5173/` (matches the dev server below) and, once
   you deploy, your production URL too.
3. Under **Users and Access**, add the Spotify account(s) of everyone who'll play — Spotify apps
   default to Development Mode, capped at 25 allowlisted users, and login will otherwise fail.
4. Copy the app's **Client ID**.

## Local development

```sh
npm install
cp .env.example .env.local   # then fill in VITE_SPOTIFY_CLIENT_ID
npm run dev
```

Open `http://127.0.0.1:5173/`. The host and port are pinned in `vite.config.ts` (`strictPort`)
because the redirect URI registered with Spotify has to match byte-for-byte — if the port is
already in use, the dev server fails loudly instead of quietly moving to 5174 and breaking OAuth.

On the Home screen in dev mode there's also a "skip to fixture match" button that plays through
the whole game with locally-generated tone "songs" — no Spotify login and no `.env.local` needed —
useful for trying out the turn loop and snippet timing without any accounts.

**Playing for real**: every player needs their own Spotify account connected in the same browser
tab, one after another. Spotify remembers whoever's logged into its own site, so when handing the
device to Player 2, log out at [accounts.spotify.com/logout](https://accounts.spotify.com/logout)
or open a private window first — the app will warn you if it detects the same account being used
for two different players. Match state is mirrored into sessionStorage so it survives the two full-page
OAuth redirects; closing the tab ends the match.

## Scripts

- `npm run dev` — start the dev server
- `npm test` — run the Vitest suite (pure game-logic/matching/reducer tests, no network)
- `npm run build` — type-check and build for production
- `npm run lint` — run oxlint

## What's tested automatically vs. manually

Automated (Vitest): the reducer's full turn-loop state machine at every player count, solo
auto-draws, block picking (order, handoffs, no duplicates, fresh blocks mid-match), scoring and
tie-breaks with 1–5 players, the random-song picker, fuzzy title matching, iTunes preview matching
(title/artist/edition ranking, throttle retries, caching), playlist sampling and preview filtering,
snippet-offset math, and state persistence across the OAuth redirect.

Manual-only (needs a real browser + real Spotify accounts): the OAuth round trip, the
same-account-detection warning, real snippet playback timing on Apple's `.m4a` clips, and
autoplay-gesture behavior on Safari/iOS.

## Out of scope for this version

Deep Cut Mode, spectator mode, genre/decade filters, streak bonuses, "start at chorus" mode, and
online play across two devices are intentionally not built — see the spec for the full list.
