import { useState } from 'react';
import type { GameTrack } from '../../game/types';
import { suggestTracks } from '../../match/autocomplete';

export function GuessAutocompleteInput({
  tracks,
  onSubmit,
  disabled,
}: {
  tracks: GameTrack[];
  onSubmit: (guessText: string) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestions = suggestTracks(query, tracks);

  const submit = (text: string) => {
    if (!text.trim()) return;
    onSubmit(text.trim());
    setQuery('');
    setShowSuggestions(false);
  };

  return (
    <div className="autocomplete">
      <input
        type="text"
        placeholder="Type your guess…"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setShowSuggestions(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit(query);
        }}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map((track) => (
            <button key={track.id} onClick={() => submit(track.title)}>
              {track.title} <span style={{ color: 'var(--text-muted)' }}>· {track.artist}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
