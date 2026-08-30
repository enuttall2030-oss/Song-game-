import { useAppState } from '../../app/AppStateProvider';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { matchSlots } from '../../game/selectors';

export function WaitingRoomScreen() {
  const { state, dispatch } = useAppState();
  const slots = matchSlots(state);
  const totalRounds = state.rounds.length;
  const solo = state.settings.playerCount <= 1;
  // A short match picks fewer than a full block; the last block of a long one is short too.
  const picksPerBlock = Math.min(state.settings.picksPerBatch, state.settings.roundsPerPlayer);
  const firstGuesser = state.players[state.rounds[0]?.guesser ?? 'P1']?.displayName;
  const firstPicker = state.rounds[0]?.picker ? state.players[state.rounds[0].picker!]?.displayName : undefined;

  return (
    <div className="screen">
      <p className="eyebrow">{solo ? 'Solo run' : `${slots.length} players`}</p>
      <h1>Ready to play</h1>

      <Card>
        <div className="roster">
          {slots.map((slot) => (
            <div key={slot} className="roster-row">
              <span className="name">{state.players[slot]?.displayName ?? slot}</span>
              <span className="meta">{state.playlists[slot]?.length ?? 0} playable songs</span>
            </div>
          ))}
        </div>

        <p>
          {totalRounds} rounds total ({state.settings.roundsPerPlayer} per player). Round 1: {firstGuesser} guesses.
        </p>

        <p style={{ color: 'var(--text-muted)' }}>
          {solo
            ? `The game picks each song at random from your own playlist — ${totalRounds} of them, one per round.`
            : `First, each player secretly picks ${picksPerBlock} song${picksPerBlock === 1 ? '' : 's'} for the player before them in the order — ${firstPicker} picks first. Then you play those ${picksPerBlock * slots.length} rounds without stopping to pick again.`}
        </p>

        <Button onClick={() => dispatch({ type: 'READY_UP' })}>{solo ? 'Start' : 'Start Match'}</Button>
      </Card>
    </div>
  );
}
