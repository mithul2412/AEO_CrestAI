import { useState } from 'react'
import { getModelConsensus } from '../utils/diagnosticBrief.js'

function scoreLabel(score) {
  if (score == null) return { text: '', color: 'var(--text-3)' }
  if (score >= 80) return { text: 'Excellent', color: 'var(--success)' }
  if (score >= 60) return { text: 'Strong', color: 'var(--brand-signal)' }
  if (score >= 40) return { text: 'Moderate', color: 'var(--warning)' }
  return { text: 'Weak', color: 'var(--danger)' }
}

function gapLabel(gap) {
  if (gap > 15) return { text: 'Large answer gap', detail: 'The page looks stronger overall than it does for this exact query.', color: 'var(--danger)' }
  if (gap >= 5) return { text: 'Moderate answer gap', detail: 'The answer is present, but the path to it needs to be clearer.', color: 'var(--warning)' }
  if (gap >= -5) return { text: 'Answer path aligned', detail: 'The page quality and target-query answer are mostly aligned.', color: 'var(--success)' }
  if (gap >= -15) return { text: 'Query-led strength', detail: 'The target answer is stronger than the broader page structure.', color: 'var(--warning)' }
  return { text: 'Query outpaces page quality', detail: 'The page answers this query better than its broader structure suggests.', color: 'var(--warning)' }
}

function queryVerdict(queryScore, gap) {
  if (queryScore == null) return { title: 'Run a query to judge the answer path', copy: 'Crest.ai needs a target question before it can say whether the page answers clearly.' }
  if (queryScore >= 75 && Math.abs(gap ?? 0) <= 10) {
    return { title: 'This page answers the query clearly', copy: 'The target question maps to the page strongly enough to inspect evidence and fix details.' }
  }
  if (queryScore >= 60) {
    return { title: 'The answer path is usable, but not effortless', copy: 'A user or AI reader can find the answer, but the page should make it more direct and quotable.' }
  }
  return { title: 'The answer path is weak', copy: 'The page does not make the target answer clear enough for confident citation.' }
}

function consensusCopy(verdicts = [], modelStatus = []) {
  const responded = modelStatus.filter(model => model.status === 'ok').length || verdicts.length
  const total = modelStatus.length || verdicts.length
  const agree = verdicts.length === 2
    && Math.abs(verdicts[0].queryMatchScore - verdicts[1].queryMatchScore) <= 15

  if (!total) return 'No model notes returned.'
  return `${responded}/${total} models checked · ${agree ? 'models broadly agree' : 'models need review'}`
}

function copyToClipboard(value) {
  if (!value) return
  navigator.clipboard?.writeText(value)
}

export default function Verdicts({
  verdicts,
  queryScore,
  contentScore,
  gapScore,
  modelStatus = [],
  onSendToChat,
}) {
  const [technicalOpen, setTechnicalOpen] = useState(false)

  if ((!verdicts || verdicts.length === 0) && modelStatus.length === 0) return null

  const gap = gapScore ?? (contentScore != null && queryScore != null
    ? contentScore - queryScore
    : null)
  const verdict = queryVerdict(queryScore, gap)
  const gapReadout = gapLabel(gap ?? 0)
  const consensus = getModelConsensus(verdicts, modelStatus)

  return (
    <div className="verdicts-grid">
      <div className="query-decision-card">
        <div className="query-decision-main">
          <div>
            <div className="agreement-left-label">Query verdict</div>
            <h3>{verdict.title}</h3>
            <p>{verdict.copy}</p>
          </div>
          <div className="query-decision-score" style={{ color: scoreLabel(queryScore).color }}>
            <strong>{queryScore ?? '--'}</strong>
            <span>{queryScore != null ? scoreLabel(queryScore).text : 'Pending'}</span>
          </div>
        </div>

        <div className="query-decision-grid">
          <div>
            <span className="fix-label">Model consensus</span>
            <strong>{consensus.label}</strong>
          </div>
          {gap !== null && (
            <div>
              <span className="fix-label">Answer gap</span>
              <strong style={{ color: gapReadout.color }}>{gap >= 0 ? '+' : ''}{gap} · {gapReadout.text}</strong>
              <p>{gapReadout.detail}</p>
            </div>
          )}
        </div>
      </div>

      <div className="details-panel baseline-technical-panel">
        <button
          type="button"
          className="details-header evidence-disclosure-trigger technical-score-trigger"
          aria-expanded={technicalOpen}
          onClick={() => setTechnicalOpen(value => !value)}
        >
          <div>
            <div className="details-heading">Technical model notes</div>
            <div className="details-subheading">Open this when you want to audit how each model judged the query.</div>
          </div>
          <span className={`checks-chevron${technicalOpen ? ' open' : ''}`}>v</span>
        </button>

        {technicalOpen && (
          <div className="technical-score-body">
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

            <div className="verdicts-cards">
              {verdicts.map((item, index) => {
                const isLlama = item.model === 'Llama 3.3'
                return (
                  <div
                    key={item.model}
                    className={`verdict-card ${isLlama ? 'llama-card' : 'nemotron-card'}`}
                    style={{ animationDelay: `${index * 120}ms` }}
                  >
                    <div className="verdict-header">
                      <span className={`verdict-model ${isLlama ? 'llama' : 'nemotron'}`}>
                        <span
                          className="verdict-model-dot"
                          style={{ background: isLlama ? 'var(--model-a)' : 'var(--model-b)' }}
                        />
                        {item.model}
                      </span>
                      <div className="verdict-score" style={{ color: scoreLabel(item.queryMatchScore).color }}>
                        {item.queryMatchScore}
                      </div>
                    </div>

                    {item.verdict && (
                      <div className="verdict-panel">
                        <div className="verdict-panel-label">Full verdict</div>
                        <div className="verdict-text">{item.verdict}</div>
                      </div>
                    )}

                    {item.topGap && (
                      <div className="verdict-panel verdict-panel-gap">
                        <div className="verdict-panel-label">Top gap</div>
                        <div className="verdict-gap">{item.topGap}</div>
                      </div>
                    )}

                    {item.failureMode && (
                      <div className="verdict-panel">
                        <div className="verdict-panel-label">Failure mode</div>
                        <div className="verdict-text">{item.failureMode}</div>
                      </div>
                    )}

                    {item.suggestedFix && (
                      <div className="verdict-panel verdict-panel-fix">
                        <div className="verdict-panel-label">Suggested fix</div>
                        <div className="verdict-fix">{item.suggestedFix}</div>
                        <div className="verdict-actions">
                          <button
                            type="button"
                            className="chip"
                            aria-label={`Copy suggested fix from ${item.model}`}
                            onClick={() => copyToClipboard(item.suggestedFix)}
                          >
                            Copy fix
                          </button>
                          <button
                            type="button"
                            className="chip chip-primary"
                            aria-label={`Send suggested fix from ${item.model} to Rewrite Help`}
                            onClick={() => onSendToChat?.(item)}
                          >
                            Send to Rewrite Help
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
