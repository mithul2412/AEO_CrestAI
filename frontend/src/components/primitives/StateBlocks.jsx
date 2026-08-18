export function EmptyBlock({ kicker, title, copy, action }) {
  return (
    <div className="state-block">
      {kicker && <span className="kicker">{kicker}</span>}
      {title && <h3 className="state-block__title">{title}</h3>}
      {copy && <p className="state-block__copy">{copy}</p>}
      {action && <div className="state-block__actions">{action}</div>}
    </div>
  )
}

export function LockedBlock({ kicker = 'Locked', title, copy, action }) {
  return (
    <div className="state-block state-block--locked">
      {kicker && <span className="kicker">{kicker}</span>}
      {title && <h3 className="state-block__title">{title}</h3>}
      {copy && <p className="state-block__copy">{copy}</p>}
      {action && <div className="state-block__actions">{action}</div>}
    </div>
  )
}

export function ErrorBlock({ title = 'Something went wrong', copy, action }) {
  return (
    <div className="state-block state-block--error" role="alert">
      <span className="kicker danger">Error</span>
      <h3 className="state-block__title">{title}</h3>
      {copy && <p className="state-block__copy">{copy}</p>}
      {action && <div className="state-block__actions">{action}</div>}
    </div>
  )
}

export function LoadingBlock({ label = 'Working…', lines = 3 }) {
  return (
    <div className="state-block state-block--inline">
      <span className="kicker">{label}</span>
      <div className="skeleton-stack" style={{ width: '100%' }}>
        {Array.from({ length: lines }).map((_, i) => (
          <span
            key={i}
            className={`skeleton-line${i === 0 ? ' skeleton-line--lg skeleton-line--w-50' : i === lines - 1 ? ' skeleton-line--w-30' : ' skeleton-line--w-70'}`}
          />
        ))}
      </div>
    </div>
  )
}
