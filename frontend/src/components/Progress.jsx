const STEP_LABELS = [
  'Fetch content',
  'Decompose page',
  'Generate queries',
  'Web research',
  'Competitor patterns',
  'AEO scoring',
  'Rewrite content',
]

export function Progress({ events }) {
  const latestStep = events.length > 0 ? events[events.length - 1].step : 0
  const total = 7

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Overall bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div className="progress-bar" style={{ flex: 1 }}>
          <div className="progress-fill" style={{ width: `${Math.round(latestStep / total * 100)}%` }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--fg-muted)', flexShrink: 0 }}>
          {latestStep}/{total}
        </span>
      </div>

      {/* Step list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1
          const event = events.find(e => e.step === stepNum)
          const isDone = event?.status === 'done'
          const isRunning = event?.status === 'running'
          const isError = event?.status === 'error'
          const isPending = !event

          return (
            <div key={stepNum}
              className="card-2"
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px',
                opacity: isPending ? 0.4 : 1,
                transition: 'opacity 0.3s',
              }}>
              {/* Status icon */}
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: isDone ? 'rgba(45,212,191,0.15)'
                  : isRunning ? 'rgba(99,102,241,0.15)'
                  : isError ? 'rgba(244,63,94,0.15)'
                  : 'var(--surface)',
                border: `1px solid ${isDone ? 'rgba(45,212,191,0.3)'
                  : isRunning ? 'rgba(99,102,241,0.3)'
                  : isError ? 'rgba(244,63,94,0.3)'
                  : 'var(--border)'}`,
                color: isDone ? 'var(--teal)' : isRunning ? 'var(--accent)' : isError ? 'var(--rose)' : 'var(--fg-subtle)',
              }}>
                {isDone ? '✓' : isRunning ? <span className="spin" style={{ width: 10, height: 10, border: '1.5px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', display: 'block' }} /> : isError ? '✗' : stepNum}
              </div>

              {/* Label + meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: isDone ? 'var(--fg)' : isRunning ? 'var(--accent)' : 'var(--fg-muted)' }}>
                  {event?.label || label}
                </div>
                {isDone && event && <StepMeta event={event} />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StepMeta({ event }) {
  const pairs = []

  if (event.specificity_score != null) pairs.push(['Specificity', `${event.specificity_score}/100`])
  if (event.claims_found != null) pairs.push(['Claims', `${event.specific_claims} specific / ${event.claims_found} total`])
  if (event.query_count != null) pairs.push(['Queries', event.query_count])
  if (event.pages_analyzed != null) pairs.push(['Pages', event.pages_analyzed])
  if (event.overall_score != null) pairs.push(['AEO Score', event.overall_score])
  if (event.faq_questions_generated != null) pairs.push(['FAQs written', event.faq_questions_generated])
  if (event.benchmark_specific_claims != null) pairs.push(['Competitor avg claims', event.benchmark_specific_claims])
  if (event.word_count != null) pairs.push(['Words', event.word_count.toLocaleString()])

  if (pairs.length === 0) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginTop: 4 }}>
      {pairs.map(([k, v]) => (
        <span key={k} style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
          <span style={{ color: 'var(--fg-muted)' }}>{k}:</span> {v}
        </span>
      ))}
    </div>
  )
}
