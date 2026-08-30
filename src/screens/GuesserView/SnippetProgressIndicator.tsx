import { ATTEMPT_TABLE } from '../../game/snippetLadder';

export function SnippetProgressIndicator({ currentAttempt }: { currentAttempt: number }) {
  return (
    <div className="stack">
      <div className="snippet-progress">
        {ATTEMPT_TABLE.map((rung) => (
          <div
            key={rung.attempt}
            className={`rung ${rung.attempt < currentAttempt ? 'used' : ''} ${rung.attempt === currentAttempt ? 'current' : ''}`}
          />
        ))}
      </div>
      <p>
        Attempt {currentAttempt} of {ATTEMPT_TABLE.length} · {ATTEMPT_TABLE[currentAttempt - 1]?.snippetSec}s snippet ·
        worth {ATTEMPT_TABLE[currentAttempt - 1]?.points} pts
      </p>
    </div>
  );
}
