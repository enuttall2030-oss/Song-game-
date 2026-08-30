import { useState } from 'react';
import type { GameTrack } from '../../game/types';
import { normalizeTitle } from '../../match/fuzzyMatch';

export function TrackSearchList({
  tracks,
  selectedId,
  onSelect,
}: {
  tracks: GameTrack[];
  selectedId: string | undefined;
  onSelect: (track: GameTrack) => void;
}) {
  const [query, setQuery] = useState('');
  const normalizedQuery = normalizeTitle(query);
  const visible = normalizedQuery
    ? tracks.filter((t) => normalizeTitle(t.title).includes(normalizedQuery) || normalizeTitle(t.artist).includes(normalizedQuery))
    : tracks;

  return (
    <div className="stack">
      <input
        type="search"
        placeholder="Search their playlist…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="track-list">
        {visible.map((track) => (
          <li key={track.id} className={selectedId === track.id ? 'selected' : undefined}>
            <button onClick={() => onSelect(track)}>
              {track.title} <span style={{ color: 'var(--text-muted)' }}>· {track.artist}</span>
            </button>
          </li>
        ))}
        {visible.length === 0 && <li>No matching songs.</li>}
      </ul>
    </div>
  );
}
