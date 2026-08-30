import { useEffect, useState } from 'react';
import { useAppState } from '../../app/AppStateProvider';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ErrorBanner } from '../../components/ErrorBanner';
import type { PlayerSlot } from '../../game/types';
import { resolvePreviewsForTracks } from '../../preview/resolvePreviews';
import { fetchPlaylistsForSlot, fetchPlaylistTracksForSlot } from '../../spotify/playlistData';
import type { SpotifyPlaylistSummary } from '../../spotify/types';

type Status = 'loadingPlaylists' | 'ready' | 'scanningTracks' | 'error';

export function PlaylistPicker({ slot }: { slot: PlayerSlot }) {
  const { state, dispatch } = useAppState();
  const [status, setStatus] = useState<Status>('loadingPlaylists');
  const [playlists, setPlaylists] = useState<SpotifyPlaylistSummary[]>([]);
  const [scanningName, setScanningName] = useState('');
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
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
    setScanProgress({ done: 0, total: 0 });
    setStatus('scanningTracks');
    try {
      const spotifyTracks = await fetchPlaylistTracksForSlot(slot, playlist.id);
      // Spotify tells us what's in the playlist; Apple supplies the audio clips. This is the slow
      // step (one throttled lookup per sampled track), hence the running progress count.
      const resolution = await resolvePreviewsForTracks(spotifyTracks, {
        onProgress: (done, total) => setScanProgress({ done, total }),
      });

      if (resolution.rateLimited && resolution.matched < state.settings.minPlayableTracks) {
        setErrorMessage(
          `Apple's preview search throttled us part-way through "${playlist.name}" (only ${resolution.matched} clips found). Wait a minute, then pick the playlist again — already-found clips are cached, so the retry is quicker.`,
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
      <p>Player {slot === 'P1' ? '1' : '2'}: choose the playlist your opponent will guess from.</p>

      {state.errorMessage && <ErrorBanner message={state.errorMessage} />}

      <Card>
        {status === 'loadingPlaylists' && <p>Loading your playlists…</p>}
        {status === 'scanningTracks' && (
          <p>
            Finding playable clips for "{scanningName}"…
            {scanProgress.total > 0 && ` ${scanProgress.done} / ${scanProgress.total} checked`}
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
