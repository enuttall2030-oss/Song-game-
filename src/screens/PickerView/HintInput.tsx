export function HintInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="stack">
      <label htmlFor="hint" style={{ textAlign: 'left', fontSize: 14, color: 'var(--text-muted)' }}>
        Optional taunt (shown to the Guesser)
      </label>
      <input
        id="hint"
        type="text"
        maxLength={80}
        placeholder="Good luck with this one…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
