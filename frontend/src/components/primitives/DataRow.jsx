export default function DataRow({ label, hint, value, tone, mono = true }) {
  return (
    <div className="data-row">
      <div className="data-row__label">
        {label}
        {hint && <small>{hint}</small>}
      </div>
      <div className={`data-row__value${tone ? ` data-row__value--${tone}` : ''}${mono ? '' : ' data-row__value--sans'}`}>
        {value ?? '—'}
      </div>
    </div>
  )
}
