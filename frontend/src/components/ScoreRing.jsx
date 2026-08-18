export function ScoreRing({ score, label, size = 96, showLabel = true }) {
  const r = size * 0.38
  const circ = 2 * Math.PI * r
  const fill = score != null ? Math.min(100, Math.max(0, score)) / 100 * circ : 0
  const color = score == null ? 'var(--fg-subtle)'
    : score >= 70 ? 'var(--teal)'
    : score >= 45 ? 'var(--orange)'
    : 'var(--rose)'

  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth={size * 0.07} />
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={size * 0.07}
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: size * 0.22, fontWeight: 700, color: score != null ? color : 'var(--fg-subtle)' }}>
          {score != null ? score : '—'}
        </span>
        {showLabel && (
          <span style={{ fontSize: size * 0.1, color: 'var(--fg-subtle)', marginTop: 1 }}>{label}</span>
        )}
      </div>
    </div>
  )
}

export function scoreColor(s) {
  if (s == null) return 'var(--fg-subtle)'
  return s >= 70 ? 'var(--teal)' : s >= 45 ? 'var(--orange)' : 'var(--rose)'
}

export function scoreLabel(s) {
  if (s == null) return '—'
  return s >= 70 ? 'Strong' : s >= 45 ? 'Needs work' : 'Weak'
}
