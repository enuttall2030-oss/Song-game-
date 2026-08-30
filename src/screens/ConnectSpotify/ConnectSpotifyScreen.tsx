import { useAppState } from '../../app/AppStateProvider';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ErrorBanner } from '../../components/ErrorBanner';
import { connectPlayer } from '../../spotify/useSpotifyAuth';
import { slotIndex, type PlayerSlot } from '../../game/types';

export function ConnectSpotifyScreen({ slot }: { slot: PlayerSlot }) {
  const { state, dispatch } = useAppState();
  const playerNumber = slotIndex(slot) + 1;
  const isFirst = playerNumber === 1;

  return (
    <div className="screen">
      <p className="eyebrow">Player {playerNumber} of {state.settings.playerCount}</p>
      <h1>Connect Player {playerNumber}</h1>
      <p>
        {isFirst
          ? 'Log in with your own Spotify account so we can pull your playlists.'
          : `Hand the device to Player ${playerNumber}. If the previous player's Spotify account is still logged in in this browser, log out or use a private window first.`}
      </p>

      {state.errorMessage && <ErrorBanner message={state.errorMessage} />}

      <Card>
        <Button
          onClick={() =>
            void connectPlayer(slot).catch((err: Error) => dispatch({ type: 'AUTH_ERROR', message: err.message }))
          }
        >
          Connect Spotify
        </Button>
        {state.errorMessage && (
          <Button variant="secondary" onClick={() => dispatch({ type: 'DISMISS_ERROR' })}>
            Dismiss
          </Button>
        )}
      </Card>
    </div>
  );
}
