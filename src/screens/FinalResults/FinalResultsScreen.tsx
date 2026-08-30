import { useAppState } from '../../app/AppStateProvider';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { matchWinner } from '../../game/scoring';
import { matchSlots, scoreboard } from '../../game/selectors';
import { ScoreBreakdownTable } from './ScoreBreakdownTable';

export function FinalResultsScreen() {
  const { state, dispatch } = useAppState();
  const winner = matchWinner(state.scores, matchSlots(state));
  const winnerName = winner === 'tie' ? undefined : state.players[winner]?.displayName;
  const rows = scoreboard(state);
  const allRounds = [...state.rounds, ...state.suddenDeathRounds];
  const solo = state.settings.playerCount <= 1;

  return (
    <div className="screen">
      <p className="eyebrow">Final results</p>
      <h1 className="winner-banner">
        {solo ? `${rows[0]?.score ?? 0} points` : winnerName ? `🏆 ${winnerName} wins!` : "It's a tie!"}
      </h1>

      <div className="standings">
        {rows.map((row, index) => (
          <div key={row.slot} className={`standing${index === 0 && !solo ? ' leader' : ''}`}>
            <span className="rank">{solo ? '★' : index + 1}</span>
            <span className="name">{row.player?.displayName ?? row.slot}</span>
            <span className="points">{row.score}</span>
          </div>
        ))}
      </div>

      <Card>
        <ScoreBreakdownTable rounds={allRounds} players={state.players} />
        <div className="row">
          <Button onClick={() => dispatch({ type: 'REMATCH_SAME_PLAYLISTS' })}>Rematch (same playlists)</Button>
          <Button variant="secondary" onClick={() => dispatch({ type: 'NEW_MATCH' })}>
            New Match
          </Button>
        </div>
      </Card>
    </div>
  );
}
