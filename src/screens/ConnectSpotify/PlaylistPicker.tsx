import { useEffect, useState } from 'react';
import { useAppState } from '../../app/AppStateProvider';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ErrorBanner } from '../../components/ErrorBanner';
import { slotIndex, type PlayerSlot } from '../../game/types';
import { resolvePreviewsForTracks } from '../../preview/resolvePreviews';
import { fetchPlaylistsForSlot, fetchPlaylistTracksForSlot } from '../../spotify/playlistData';
import type { SpotifyPlaylistSummary } from '../../spotify/types';

type Status = 'loadingPlaylists' | 'ready' | 'scanningTracks' | 'error';

export function PlaylistPicker({ slot }: { slot: PlayerSlot }) {
  const { state, dispatch } = useAppState();
  const [status, setStatus] = useState<Status>('loadingPlaylists');
  const [playlists, setPlaylists] = useState<SpotifyPlaylistSummary[]>([]);
  const [scanningName, setScanningName] = useState('');
  const [scanProgress, setScanProgress] = useState({ checked: 0, total: 0, matched: 0, target: 0 });
  const [errorMessage, setErrorMessage] = useState('');

  const loadPlaylists = () => {
    setStatus('loadingPlaylists');
    fetchPlaylistsForSlot(slot)
      .then((fetched) => {
        setPlaylists(fetched);
        setStatus('ready');
      })
      .catch((err: Error) => {
        setErrorMessage(err.message);
        setStatus('error');
      });
  };

  useEffect(loadPlaylists, [slot]);

  const selectPlaylist = async (playlist: SpotifyPlaylistSummary) => {
    setScanningName(playlist.name);
    setScanProgress({ checked: 0, total: 0, matched: 0, target: 0 });
    setStatus('scanningTracks');
    try {
      const spotifyTracks = await fetchPlaylistTracksForSlot(slot, playlist.id);
      // Spotify tells us what's in the playlist; Apple supplies the audio clips. This is the slow
      // step (one throttled lookup per sampled track), hence the running progress count.
      const resolution = await resolvePreviewsForTracks(spotifyTracks, {
        targetMatches: state.settings.minPlayableTracks + 5,
        onProgress: setScanProgress,
      });

      // Distinguish "Apple wouldn't answer us" from "this playlist really has few playable
      // songs". Both used to arrive as a low match count and got reported as the latter, which
      // sent people hunting for a better playlist over a problem no playlist could fix.
      const shortOfMinimum = resolution.matched < state.settings.minPlayableTracks;
      const lookupsMostlyFailed = resolution.failed > resolution.attempted / 2;

      if (shortOfMinimum && (resolution.rateLimited || lookupsMostlyFailed)) {
        setErrorMessage(
          resolution.rateLimited
            ? `Apple's preview search rate-limited us part-way through "${playlist.name}" — ${resolution.matched} clips found, and it needs ${state.settings.minPlayableTracks}. That's Apple throttling our lookups, not a problem with your playlist. Wait a minute or two and pick the same playlist again: every clip already found is cached, so the retry picks up where this left off.`
            : `Couldn't reach Apple's preview search for "${playlist.name}" (${resolution.failed} of ${resolution.attempted} lookups failed). Check your internet connection and try the same playlist again — this isn't a problem with the playlist itself.`,
        );
        setStatus('error');
        return;
      }

      // If the reducer rejects this playlist (too few playable tracks) it sets errorMessage and
      // keeps us on this phase — drop back to the list rather than getting stuck "scanning".
      setStatus('ready');
      dispatch({ type: 'PLAYLIST_SELECTED', slot, tracks: resolution.tracks });
    } catch (err) {
      setErrorMessage((err as Error).message);
      setStatus('error');
    }
  };

  return (
    <div className="screen">
      <h1>Pick a playlist</h1>
      <p>
        Player {slotIndex(slot) + 1}: choose the playlist you'll be guessing from. Someone else
        picks the songs out of it — you'll never see which.
      </p>

      {state.errorMessage && <ErrorBanner message={state.errorMessage} />}

      <Card>
        {status === 'loadingPlaylists' && <p>Loading your playlists…</p>}
        {status === 'scanningTracks' && (
          <p>
            Finding playable clips for "{scanningName}"…
            {scanProgress.target > 0 && ` found ${scanProgress.matched} of ${scanProgress.target}`}
            <br />
            <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Usually a few seconds. If Apple rate-limits us it slows right down to get through —
              either way, picking this playlist again later is instant.
            </span>
          </p>
        )}
        {status === 'error' && <ErrorBanner message={errorMessage} />}

        {status === 'ready' && (
          <ul className="track-list">
            {playlists.map((playlist) => (
              <li key={playlist.id}>
                <button onClick={() => selectPlaylist(playlist)}>
                  {playlist.name}
                  <span style={{ color: 'var(--text-muted)' }}> · {playlist.tracks.total} tracks</span>
                </button>
              </li>
            ))}
            {playlists.length === 0 && <li>No playlists found on this account.</li>}
          </ul>
        )}

        {status === 'error' && (
          <Button variant="secondary" onClick={loadPlaylists}>
            Retry
          </Button>
        )}
      </Card>
    </div>
  );
}
