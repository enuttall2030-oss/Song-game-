export function ScoreBadge({ label, score, highlight }: { label: string; score: number; highlight?: boolean }) {
  return (
    <span className="score-badge" style={highlight ? { borderColor: 'var(--accent)' } : undefined}>
      {label}: {score}
    </span>
  );
}
