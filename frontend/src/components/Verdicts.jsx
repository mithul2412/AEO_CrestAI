function scoreLabel(score) {
  if (score == null) return { text: '', color: 'var(--text-3)' }
  if (score >= 80) return { text: 'Excellent', color: 'var(--success)' }
  if (score >= 60) return { text: 'Strong', color: 'var(--accent)' }
  if (score >= 40) return { text: 'Moderate', color: 'var(--warning)' }
  return { text: 'Weak', color: 'var(--danger)' }
}

function gapLabel(gap) {
  if (gap > 15) return { text: 'High gap - answer path trails baseline content signals', color: 'var(--danger)' }
  if (gap >= 5) return { text: 'Moderate gap - sharpen the answer path for this query', color: 'var(--warning)' }
  if (gap >= -5) return { text: 'Aligned', color: 'var(--success)' }
  if (gap >= -15) return { text: 'Query-led strength - broaden supporting content signals', color: 'var(--warning)' }
  return { text: 'Query significantly outpaces baseline AEO depth', color: 'var(--warning)' }
}

function confidenceBadge(score) {
  if (score >= 70) return { cls: 'badge badge-high', label: 'HIGH' }
  if (score >= 40) return { cls: 'badge badge-med', label: 'MED' }
  return { cls: 'badge badge-low', label: 'LOW' }
}

export default function Verdicts({ verdicts, queryScore, contentScore, gapScore, modelStatus = [] }) {
  if ((!verdicts || verdicts.length === 0) && modelStatus.length === 0) return null

  const respondedCount = modelStatus.filter(model => model.status === 'ok').length
  const totalModels = modelStatus.length || verdicts.length
  const isPartial = respondedCount > 0 && respondedCount < totalModels

  const agree = verdicts.length === 2
    && Math.abs(verdicts[0].queryMatchScore - verdicts[1].queryMatchScore) <= 15

  const gap = gapScore ?? (contentScore != null && queryScore != null
    ? contentScore - queryScore
    : null)

  return (
    <div className="verdicts-grid">
      <div className="query-overview-grid">
        <div className="query-summary-card">
          <div className="query-summary-main">
            <div>
              <div className="agreement-left-label">Avg Query Match</div>
              <div className="avg-score-display" style={{ color: scoreLabel(queryScore).color }}>
                {queryScore ?? '--'}
              </div>
              <div className="score-semantic-label" style={{ color: scoreLabel(queryScore).color }}>
                {queryScore != null ? scoreLabel(queryScore).text : ''}
              </div>
            </div>
            <div className="query-summary-pills">
              <span className={`summary-pill ${isPartial ? 'warn' : 'ok'}`}>
                {respondedCount || verdicts.length}/{totalModels} responded
              </span>
              {verdicts.length === 2 && (
                <span className={`badge ${agree ? 'badge-agree' : 'badge-disagree'}`}>
                  {agree ? 'Models Agree' : 'Models Diverge'}
                </span>
              )}
            </div>
          </div>

          <div className="query-summary-note">
            {isPartial
              ? 'This is a partial result. The average query score is based on the models that responded successfully.'
              : 'This stage shows how directly the page answers the target query across both models.'}
          </div>
        </div>

        {gap !== null && (() => {
          const label = gapLabel(gap)
          return (
            <div className="query-summary-card query-summary-card-gap">
              <div className="agreement-left-label">Gap readout</div>
              <div className="gap-verdict-callout">
                <span className="gap-verdict-delta" style={{ color: label.color }}>
                  {gap >= 0 ? '+' : ''}{gap}
                </span>
                <span className="gap-verdict-text" style={{ color: label.color }}>{label.text}</span>
              </div>
            </div>
          )
        })()}
      </div>

      {modelStatus.length > 0 && (
        <div className="query-model-status-board">
          {modelStatus.map(model => (
            <div key={model.model} className={`model-status-card ${model.status === 'ok' ? 'ok' : 'err'}`}>
              <div className="model-status-card-header">
                <strong>{model.model}</strong>
                <span>{model.status === 'ok' ? 'Responded' : 'Failed'}</span>
              </div>
              <p>
                {model.status === 'ok'
                  ? 'Used in the query average and verdict comparison.'
                  : (model.error || 'No model response was returned.')}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="verdicts-header">
        <div className="details-heading">Model verdicts</div>
        <div className="details-subheading">
          Read how each model interpreted the page against the target query.
        </div>
      </div>

      <div className="verdicts-cards">
        {verdicts.map((verdict, index) => {
          const isLlama = verdict.model === 'Llama 3.3'
          const confidence = confidenceBadge(verdict.queryMatchScore || 0)

          return (
            <div
              key={verdict.model}
              className={`verdict-card ${isLlama ? 'llama-card' : 'nemotron-card'}`}
              style={{ animationDelay: `${index * 120}ms` }}
            >
              <div className="verdict-header">
                <span className={`verdict-model ${isLlama ? 'llama' : 'nemotron'}`}>
                  <span
                    className="verdict-model-dot"
                    style={{ background: isLlama ? 'var(--model-a)' : 'var(--model-b)' }}
                  />
                  {verdict.model}
                </span>
                <div className="verdict-badges">
                  <span className={confidence.cls}>{confidence.label}</span>
                </div>
              </div>

              <div className="verdict-score-row">
                <div className="verdict-score" style={{ color: scoreLabel(verdict.queryMatchScore).color }}>
                  {verdict.queryMatchScore}
                </div>
                <div className="score-semantic-label" style={{ color: scoreLabel(verdict.queryMatchScore).color }}>
                  {scoreLabel(verdict.queryMatchScore).text}
                </div>
              </div>

              {verdict.verdict && (
                <div className="verdict-panel">
                  <div className="verdict-panel-label">Read</div>
                  <div className="verdict-text">{verdict.verdict}</div>
                </div>
              )}

              {verdict.topGap && (
                <div className="verdict-panel verdict-panel-gap">
                  <div className="verdict-panel-label">Top gap</div>
                  <div className="verdict-gap">{verdict.topGap}</div>
                </div>
              )}

              {verdict.suggestedFix && (
                <div className="verdict-panel verdict-panel-fix">
                  <div className="verdict-panel-label">Suggested fix</div>
                  <div className="verdict-fix">{verdict.suggestedFix}</div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
