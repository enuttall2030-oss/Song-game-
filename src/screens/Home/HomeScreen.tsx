import { useState } from 'react';
import { useAppState } from '../../app/AppStateProvider';
import { FIXTURE_NAMES, buildFixturePlaylist } from '../../app/devFixtures';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DEFAULT_MATCH_SETTINGS, slotsForCount } from '../../game/types';
import { SettingsPanel } from './SettingsPanel';

export function HomeScreen() {
  const { dispatch } = useAppState();
  const [settings, setSettings] = useState(DEFAULT_MATCH_SETTINGS);

  const startMatch = () => dispatch({ type: 'START_MATCH', settings });

  const startFixtureMatch = () => {
    dispatch({ type: 'START_MATCH', settings });
    slotsForCount(settings.playerCount).forEach((slot, index) => {
      // Every player after the first arrives via a handoff, exactly as they would in a real match.
      if (index > 0) dispatch({ type: 'HANDOFF_ACKNOWLEDGED' });
      const name = FIXTURE_NAMES[index];
      dispatch({ type: 'PLAYER_CONNECTED', slot, spotifyUserId: `dev-${slot}`, displayName: `${name} (dev)` });
      dispatch({ type: 'PLAYLIST_SELECTED', slot, tracks: buildFixturePlaylist(name) });
    });
  };

  return (
    <div className="screen">
      <p className="eyebrow">Playlist Roulette</p>
      <h1 className="hero-title">Name it in 0.1 seconds</h1>
      <p>Guess songs from your friends' playlists before the snippet gives it away.</p>

      <Card>
        <h2>Match settings</h2>
        <SettingsPanel settings={settings} onChange={setSettings} />
      </Card>

      <div className="row">
        <Button onClick={startMatch}>Create Match</Button>
      </div>

      {import.meta.env.DEV && (
        <div className="row">
          <Button variant="secondary" onClick={startFixtureMatch}>
            Dev: fixture match ({settings.playerCount}P, no Spotify login)
          </Button>
        </div>
      )}
    </div>
  );
}
