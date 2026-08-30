import { useAppState } from '../../app/AppStateProvider';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { slotIndex, type PlayerSlot } from '../../game/types';

const REASON_COPY: Record<string, string> = {
  connectNext:
    'Time to connect the next player. If this browser is still logged into someone else\'s Spotify account, log out at accounts.spotify.com/logout or switch to a private window before continuing.',
  startPickBatch: 'is up to choose their songs. Everyone else, look away!',
  startGuesserPhase: 'is up to guess. Get ready to listen.',
};

export function HandoffScreen({ toSlot, reason }: { toSlot: PlayerSlot; reason: string }) {
  const { state, dispatch } = useAppState();
  const fallbackLabel = `Player ${slotIndex(toSlot) + 1}`;
  const playerLabel = state.players[toSlot]?.displayName ?? fallbackLabel;

  return (
    <div className="screen">
      <p className="eyebrow">Pass the device</p>
      <h1>{playerLabel}</h1>
      <Card>
        <p>
          {reason === 'connectNext' ? (
            REASON_COPY.connectNext
          ) : (
            <>
              <strong>{playerLabel}</strong> {REASON_COPY[reason]}
            </>
          )}
        </p>
        <Button onClick={() => dispatch({ type: 'HANDOFF_ACKNOWLEDGED' })}>I'm {playerLabel}, continue</Button>
      </Card>
    </div>
  );
}
