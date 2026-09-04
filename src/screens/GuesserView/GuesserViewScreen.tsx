import { useEffect } from 'react';
import { useAppState } from '../../app/AppStateProvider';
import { useSnippetPlayer } from '../../audio/useSnippetPlayer';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { pickRandomTrack } from '../../game/randomPick';
import { activeRound, isSoloMatch, pickedTrack, scoreboard, soloUnusedPool, tracksForActiveRound } from '../../game/selectors';
import { pickRandomStartOffset } from '../../game/roundLogic';
import { MAX_ATTEMPTS, snippetLengthForAttempt } from '../../game/snippetLadder';
import { GuessAutocompleteInput } from './GuessAutocompleteInput';
import { SnippetProgressIndicator } from './SnippetProgressIndicator';

const LONGEST_SNIPPET_SEC = snippetLengthForAttempt(MAX_ATTEMPTS);

export function GuesserViewScreen() {
  const { state, dispatch } = useAppState();
  const round = activeRound(state);
  const track = pickedTrack(state);
  const tracks = tracksForActiveRound(state);
  const solo = isSoloMatch(state);
  const { isPlaying, durationSec, loadError, playSnippet } = useSnippetPlayer(track?.previewUrl);

  const currentAttempt = Math.min((round?.attemptsUsed ?? 0) + 1, MAX_ATTEMPTS);

  // Solo has no Picker, so the game draws the song itself the moment the round opens.
  useEffect(() => {
    if (!solo || !round || round.pickedTrackId) return;
    const drawn = pickRandomTrack(soloUnusedPool(state));
    if (drawn) dispatch({ type: 'SOLO_TRACK_ASSIGNED', trackId: drawn.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solo, round?.roundNumber, round?.pickedTrackId]);

  // Offset is locked the first time we know the clip's real duration, and reused for every replay.
  useEffect(() => {
    if (durationSec !== undefined && round && round.snippetStartOffsetSec === undefined) {
      const offset = pickRandomStartOffset(durationSec, LONGEST_SNIPPET_SEC);
      dispatch({ type: 'SNIPPET_OFFSET_LOCKED', offsetSec: offset });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationSec, round?.roundNumber]);

  if (!round) return null;
  if (!track) {
    return (
      <div className="screen">
        <p className="eyebrow">Round {round.roundNumber}</p>
        <h1>Drawing a song…</h1>
      </div>
    );
  }

  const clipReady = round.snippetStartOffsetSec !== undefined;

  const play = () => {
    if (round.snippetStartOffsetSec === undefined) return;
    playSnippet(round.snippetStartOffsetSec, snippetLengthForAttempt(currentAttempt));
  };

  return (
    <div className="screen">
      <p className="eyebrow">Round {round.roundNumber}</p>
      <h1>{solo ? 'Name that song' : `${state.players[round.guesser]?.displayName}, your turn`}</h1>

      <div className="score-row">
        {scoreboard(state).map((row) => (
          <span key={row.slot} className={`score-badge${row.slot === round.guesser ? ' active' : ''}`}>
            {row.player?.displayName ?? row.slot}
            <strong>{row.score}</strong>
          </span>
        ))}
      </div>

      <Card>
        {round.hint && <p className="hint-quote">“{round.hint}”</p>}

        <SnippetProgressIndicator currentAttempt={currentAttempt} />

        {/* The offset can only be chosen once the clip's real duration is known, so Play is dead
            until then — say so rather than showing a greyed button with no explanation. */}
        <Button onClick={play} disabled={isPlaying || !clipReady}>
          {isPlaying ? 'Playing…' : clipReady ? '▶ Play snippet' : 'Loading clip…'}
        </Button>

        {loadError && <p style={{ color: 'var(--danger)' }}>{loadError}</p>}

        <GuessAutocompleteInput
          tracks={tracks}
          disabled={isPlaying}
          onSubmit={(guessText) => dispatch({ type: 'GUESSER_GUESS_SUBMITTED', guessText })}
        />

        <div className="row">
          <Button variant="secondary" onClick={() => dispatch({ type: 'GUESSER_SKIPPED' })}>
            Skip (hear more)
          </Button>
          <Button variant="secondary" onClick={() => dispatch({ type: 'GUESSER_GAVE_UP' })}>
            Give up
          </Button>
        </div>
      </Card>
    </div>
  );
}
