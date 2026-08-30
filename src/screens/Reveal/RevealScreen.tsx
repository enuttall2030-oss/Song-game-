import { useAppState } from '../../app/AppStateProvider';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { currentRound, pickedTrack } from '../../game/selectors';

export function RevealScreen() {
  const { state, dispatch } = useAppState();
  const round = currentRound(state);
  const track = pickedTrack(state);

  if (!round || !track) return null;

  const guesserName = state.players[round.guesser]?.displayName;
  const points = round.outcome === 'correct' ? round.pointsAwardedToGuesser : 0;

  return (
    <div className="screen">
      <h1>{round.outcome === 'correct' ? 'Got it!' : "Time's up"}</h1>

      <Card>
        {track.albumArtUrl && <img className="reveal-art" src={track.albumArtUrl} alt="" />}
        <h2>{track.title}</h2>
        <p>{track.artist}</p>
        <p>
          {round.outcome === 'correct'
            ? `${guesserName} guessed it in ${round.attemptsUsed} attempt${round.attemptsUsed === 1 ? '' : 's'} for ${points} pts.`
            : `${guesserName} didn't get it this round.${round.pointsAwardedToPicker ? ` Picker earns ${round.pointsAwardedToPicker} pts.` : ''}`}
        </p>
        <Button onClick={() => dispatch({ type: 'REVEAL_NEXT' })}>Next Round</Button>
      </Card>
    </div>
  );
}
