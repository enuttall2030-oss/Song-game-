import './App.css';
import { useAppState } from './app/AppStateProvider';
import { ConnectSpotifyScreen } from './screens/ConnectSpotify/ConnectSpotifyScreen';
import { PlaylistPicker } from './screens/ConnectSpotify/PlaylistPicker';
import { FinalResultsScreen } from './screens/FinalResults/FinalResultsScreen';
import { GuesserViewScreen } from './screens/GuesserView/GuesserViewScreen';
import { HandoffScreen } from './screens/Handoff/HandoffScreen';
import { HomeScreen } from './screens/Home/HomeScreen';
import { PickerViewScreen } from './screens/PickerView/PickerViewScreen';
import { RevealScreen } from './screens/Reveal/RevealScreen';
import { SuddenDeathScreen } from './screens/SuddenDeath/SuddenDeathScreen';
import { WaitingRoomScreen } from './screens/WaitingRoom/WaitingRoomScreen';
import { useSpotifyAuthCallback } from './spotify/useSpotifyAuth';

function App() {
  const { state, dispatch } = useAppState();

  useSpotifyAuthCallback(
    ({ slot, spotifyUserId, displayName }) => {
      // Everyone shares one browser, so the same Spotify account can easily get connected twice —
      // check against every player already in, not just the previous one.
      const alreadyIn = Object.values(state.players).some(
        (player) => player.slot !== slot && player.spotifyUserId === spotifyUserId,
      );
      if (alreadyIn) {
        dispatch({ type: 'SAME_ACCOUNT_DETECTED' });
        return;
      }
      dispatch({ type: 'PLAYER_CONNECTED', slot, spotifyUserId, displayName });
    },
    (message) => dispatch({ type: 'AUTH_ERROR', message }),
  );

  switch (state.phase.name) {
    case 'home':
      return <HomeScreen />;
    case 'connect':
      return <ConnectSpotifyScreen slot={state.phase.slot} />;
    case 'playlistPick':
      return <PlaylistPicker slot={state.phase.slot} />;
    case 'handoff':
      return <HandoffScreen toSlot={state.phase.toSlot} reason={state.phase.reason} />;
    case 'waitingRoom':
      return <WaitingRoomScreen />;
    case 'pickBatch':
      return <PickerViewScreen />;
    case 'guesserPhase':
      return <GuesserViewScreen />;
    case 'reveal':
      return <RevealScreen />;
    case 'suddenDeath':
      return <SuddenDeathScreen />;
    case 'finalResults':
      return <FinalResultsScreen />;
    default:
      return null;
  }
}

export default App;
