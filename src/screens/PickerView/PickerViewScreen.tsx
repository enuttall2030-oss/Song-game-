import { useState } from 'react';
import { useAppState } from '../../app/AppStateProvider';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { pickRandomTrack } from '../../game/randomPick';
import { pickBatchProgress, selectablePickerTracks } from '../../game/selectors';
import type { GameTrack } from '../../game/types';
import { HintInput } from './HintInput';
import { TrackSearchList } from './TrackSearchList';

export function PickerViewScreen() {
  const { state, dispatch } = useAppState();
  const [selectedTrack, setSelectedTrack] = useState<GameTrack>();
  const [wasRandom, setWasRandom] = useState(false);
  const [hint, setHint] = useState('');

  const picker = state.phase.name === 'pickBatch' ? state.phase.picker : undefined;
  const tracks = selectablePickerTracks(state);
  const progress = pickBatchProgress(state);
  const pickerName = picker ? state.players[picker]?.displayName : undefined;
  // Who these songs are for: with 3+ players that's the next player round, not "the opponent".
  const guesserName = progress.guesser ? state.players[progress.guesser]?.displayName : undefined;

  const clearSelection = () => {
    setSelectedTrack(undefined);
    setWasRandom(false);
  };

  const chooseManually = (track: GameTrack) => {
    setSelectedTrack(track);
    setWasRandom(false);
  };

  // Excludes the song currently on offer, so "pick another" always produces a different one.
  const rollRandom = () => {
    const track = pickRandomTrack(tracks, selectedTrack?.id);
    if (!track) return;
    setSelectedTrack(track);
    setWasRandom(true);
  };

  const confirmPick = () => {
    if (!selectedTrack) return;
    dispatch({
      type: 'PICKER_SELECTED_TRACK',
      trackId: selectedTrack.id,
      hint: state.settings.allowPickerHint && hint.trim() ? hint.trim() : undefined,
    });
    // The next song in this block is picked on this same screen — reset for it.
    setSelectedTrack(undefined);
    setWasRandom(false);
    setHint('');
  };

  return (
    <div className="screen">
      <p className="eyebrow">
        {pickerName} · song {Math.min(progress.done + 1, progress.total)} of {progress.total}
      </p>
      <h1>Pick a song for {guesserName}</h1>
      <p>
        They'll guess it in round {progress.nextRoundNumber}, and they won't see any of this. Search their playlist or
        let the game choose.
      </p>

      <Card>
        {wasRandom && selectedTrack ? (
          // The whole decision — confirm, re-roll, or back out — sits with the suggestion. Putting
          // Confirm below the track list would push it off-screen exactly when it's needed.
          <div className="random-pick">
            <p className="eyebrow">The game suggests</p>
            <h2>{selectedTrack.title}</h2>
            <p>{selectedTrack.artist}</p>

            {state.settings.allowPickerHint && <HintInput value={hint} onChange={setHint} />}

            <Button onClick={confirmPick}>Lock it in</Button>
            <div className="row">
              <Button variant="secondary" onClick={rollRandom}>
                🎲 Pick another
              </Button>
              <Button variant="secondary" onClick={clearSelection}>
                Choose myself
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="row">
              <Button variant="secondary" onClick={rollRandom}>
                🎲 Let the game pick
              </Button>
            </div>

            <TrackSearchList tracks={tracks} selectedId={selectedTrack?.id} onSelect={chooseManually} />

            {selectedTrack && state.settings.allowPickerHint && <HintInput value={hint} onChange={setHint} />}

            <Button disabled={!selectedTrack} onClick={confirmPick}>
              {selectedTrack ? `Confirm "${selectedTrack.title}"` : 'Pick a song'}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
