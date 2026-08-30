import type { PlayerInfo, PlayerSlot, RoundRecord } from '../../game/types';

export function ScoreBreakdownTable({
  rounds,
  players,
}: {
  rounds: RoundRecord[];
  players: Partial<Record<PlayerSlot, PlayerInfo>>;
}) {
  return (
    <div className="stack" style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th>Round</th>
            <th>Guesser</th>
            <th>Result</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((round) => (
            <tr key={round.roundNumber} style={{ borderBottom: '1px solid var(--border)' }}>
              <td>{round.roundNumber}</td>
              <td>{players[round.guesser]?.displayName}</td>
              <td>{round.outcome === 'correct' ? `Correct (${round.attemptsUsed} attempts)` : 'Missed'}</td>
              <td>
                {round.pointsAwardedToGuesser > 0 && `+${round.pointsAwardedToGuesser} guesser`}
                {round.pointsAwardedToPicker > 0 && ` +${round.pointsAwardedToPicker} picker`}
                {round.pointsAwardedToGuesser === 0 && round.pointsAwardedToPicker === 0 && '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
