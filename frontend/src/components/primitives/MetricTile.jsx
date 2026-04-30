function tone(score) {
  if (typeof score !== 'number') return null
  if (score >= 75) return 'ok'
  if (score >= 50) return 'warn'
  return 'danger'
}

export default function MetricTile({
  label,
  value,
  caption,
  suffix = '/100',
  onClick,
  disabled = false,
}) {
  const t = tone(value)
  const isLocked = typeof value !== 'number'
  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      className="metric"
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      disabled={disabled || isLocked}
    >
      <span className="metric__label">{label}</span>
      <span className={`metric__value${isLocked ? ' metric__value--locked' : ''}`}>
        {isLocked ? '—' : value}
        {!isLocked && <span className="metric__value-suffix">{suffix}</span>}
      </span>
      {caption && <span className="metric__caption">{caption}</span>}
      <span className={`metric__bar${t ? ` metric__bar--${t}` : ''}`}>
        <span
          className="metric__bar-fill"
          style={{ width: isLocked ? '0%' : `${Math.max(0, Math.min(100, value))}%` }}
        />
      </span>
    </Component>
  )
}
