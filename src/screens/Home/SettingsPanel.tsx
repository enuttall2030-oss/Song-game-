import { Toggle } from '../../components/Toggle';
import { MAX_PLAYERS, MIN_PLAYERS, type MatchSettings } from '../../game/types';

function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label}`}>
        −
      </button>
      <span className="stepper-value">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`}>
        +
      </button>
    </div>
  );
}

export function SettingsPanel({
  settings,
  onChange,
}: {
  settings: MatchSettings;
  onChange: (settings: MatchSettings) => void;
}) {
  const solo = settings.playerCount <= 1;

  return (
    <div className="stack">
      <div className="toggle-row">
        <span>
          <span className="label">Players</span>
          <div className="hint">
            {solo
              ? 'Solo: the game picks your songs at random from your own playlist'
              : `Each player picks songs for the next player · ${settings.playerCount} playlists needed`}
          </div>
        </span>
        <Stepper
          label="players"
          value={settings.playerCount}
          min={MIN_PLAYERS}
          max={MAX_PLAYERS}
          onChange={(playerCount) => onChange({ ...settings, playerCount })}
        />
      </div>

      <div className="toggle-row">
        <span>
          <span className="label">Rounds per player</span>
          <div className="hint">Total rounds this match = {settings.roundsPerPlayer * settings.playerCount}</div>
        </span>
        <Stepper
          label="rounds per player"
          value={settings.roundsPerPlayer}
          min={1}
          max={20}
          onChange={(roundsPerPlayer) => onChange({ ...settings, roundsPerPlayer })}
        />
      </div>

      <Toggle
        label="Picker can leave a hint"
        hint={solo ? 'No picker in a solo run' : 'A one-line taunt shown to the Guesser before they play'}
        checked={settings.allowPickerHint && !solo}
        disabled={solo}
        onChange={(allowPickerHint) => onChange({ ...settings, allowPickerHint })}
      />

      <Toggle
        label="Picker scores on a total miss"
        hint={
          solo
            ? 'No picker in a solo run'
            : `Picker earns ${settings.pickerBonusPoints} pts when the Guesser fails a round entirely`
        }
        checked={settings.pickerScoresOnFailure && !solo}
        disabled={solo}
        onChange={(pickerScoresOnFailure) => onChange({ ...settings, pickerScoresOnFailure })}
      />
    </div>
  );
}
