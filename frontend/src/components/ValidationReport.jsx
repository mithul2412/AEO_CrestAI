function statusLabel(status) {
  if (status === 'pass') return 'Pass'
  if (status === 'warn') return 'Warn'
  if (status === 'fail') return 'Fail'
  return 'Info'
}

export default function ValidationReport({ validation }) {
  const checks = validation?.checks || []
  const warnings = validation?.warnings || []
  const errors = validation?.errors || []

  return (
    <div className="agentic-validation">
      <div className="agentic-summary-grid">
        <div className={`agentic-summary-card ${validation?.ok ? 'good' : 'warn'}`}>
          <span className="agentic-card-label">Validation</span>
          <strong>{validation?.ok ? 'OK' : 'Needs review'}</strong>
        </div>
        <div className={`agentic-summary-card ${validation?.approvalRequired ? 'warn' : 'good'}`}>
          <span className="agentic-card-label">Approval</span>
          <strong>{validation?.approvalRequired ? 'Required' : 'Not required'}</strong>
        </div>
        <div className="agentic-summary-card">
          <span className="agentic-card-label">Checks</span>
          <strong>{checks.length}</strong>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="error-bar">
          {errors.join(' ')}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="agentic-warning-list">
          {warnings.slice(0, 8).map(warning => (
            <div key={warning} className="agentic-warning">{warning}</div>
          ))}
        </div>
      )}

      <div className="agentic-check-list">
        {checks.length > 0 ? checks.map(check => (
          <div key={check.id} className={`agentic-check ${check.status}`}>
            <span>{statusLabel(check.status)}</span>
            <strong>{check.label}</strong>
            <small>{check.message}</small>
          </div>
        )) : (
          <div className="agentic-empty">No validation checks returned.</div>
        )}
      </div>
    </div>
  )
}
