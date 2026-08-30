import { useEffect, useRef } from 'react';
import { useAppState } from '../../app/AppStateProvider';
import { combinedUnusedPool } from '../../game/selectors';
import { pickRandomTrack } from '../../game/randomPick';

/**
 * Sudden death has no human Picker step — the spec only specifies "a random song" — so this screen
 * draws a track and hands straight off to the Guesser. With more than two players, everyone tied
 * for the lead plays one of these in turn; the reducer owns that queue, this screen just supplies
 * the song for whoever is next.
 */
export function SuddenDeathScreen() {
  const { state, dispatch } = useAppState();
  const nextGuesser = state.suddenDeathQueue[0];
  const guesserName = nextGuesser ? state.players[nextGuesser]?.displayName : undefined;
  const startedForRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!nextGuesser || startedForRef.current === nextGuesser) return;
    startedForRef.current = nextGuesser;

    const track = pickRandomTrack(combinedUnusedPool(state));
    if (track) dispatch({ type: 'SUDDEN_DEATH_TRACK_SELECTED', track });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextGuesser]);

  return (
    <div className="screen">
      <p className="eyebrow">Tied at the top</p>
      <h1 className="winner-banner">Sudden Death</h1>
      <p>
        {guesserName ? `${guesserName} is up — one random song decides it.` : 'One random song decides it.'} Drawing a
        track…
      </p>
    </div>
  );
}
