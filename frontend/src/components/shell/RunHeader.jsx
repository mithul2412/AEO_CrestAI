import { useNavigate } from 'react-router-dom'
import { useRun } from '../../state/RunContext.jsx'
import { getAnswerGapMetric } from '../../utils/diagnosticBrief.js'

function shortenUrl(url) {
  if (!url) return ''
  try {
    const u = new URL(url)
    const pathname = u.pathname.length > 1 ? u.pathname : ''
    return `${u.hostname.replace(/^www\./, '')}${pathname}`
  } catch {
    return url
  }
}

function gapTone(gap) {
  if (typeof gap !== 'number') return 'muted'
  if (gap >= 15) return 'danger'
  if (gap >= 5) return 'warn'
  if (gap >= -5) return 'ok'
  return 'warn'
}

function scoreTone(score) {
  if (typeof score !== 'number') return 'muted'
  if (score >= 75) return 'ok'
  if (score >= 50) return 'warn'
  return 'danger'
}

export default function RunHeader() {
  const navigate = useNavigate()
  const {
    normalizedUrl, url, query, activeResults,
    contentAnalyzing, queryAnalyzing, hasFetched, hasQueryResults,
    demoMode,
  } = useRun()

  const displayUrl = shortenUrl(normalizedUrl || url)
  const overall = activeResults?.overallScore
  const gap = activeResults?.gapScore
  const gapMetric = getAnswerGapMetric(gap)
  const citation = activeResults?.intelligence?.citationReadiness?.score

  const isWorking = contentAnalyzing || queryAnalyzing

  let actionLabel = 'Add target query'
  let actionFn = () => navigate('/')
  if (!hasFetched) {
    actionLabel = 'Fetch a page'
  } else if (!query.trim()) {
    actionLabel = 'Add target query'
    actionFn = () => navigate('/')
  } else if (hasQueryResults) {
    actionLabel = 'Open Diagnostics'
    actionFn = () => navigate('/diagnostics')
  } else {
    actionLabel = 'Run query test'
    actionFn = () => navigate('/')
  }

  return (
    <div className="runheader">
      <div className="runheader__url">
        <span className="runheader__url-favicon" aria-hidden="true" />
        <span className={displayUrl ? '' : 'runheader__url-empty'}>
          {displayUrl || 'No page loaded'}
        </span>
      </div>

      <span className="runheader__divider" aria-hidden="true" />

      <div className="runheader__query">
        <span className={query.trim() ? '' : 'runheader__query-empty'}>
          {query.trim() ? `“${query.trim()}”` : '— no target query'}
        </span>
      </div>

      <span className="runheader__spacer" />

      {demoMode && (
        <span className="pill pill--warn">Demo snapshot</span>
      )}

      {typeof overall === 'number' && (
        <div className="runheader__metric">
          <span className="runheader__metric-label">Readiness</span>
          <span className="runheader__metric-value">{overall}</span>
        </div>
      )}

      {typeof citation === 'number' && hasQueryResults && (
        <div className="runheader__metric">
          <span className="runheader__metric-label">Citation</span>
          <span className={`runheader__metric-value ${scoreTone(citation)}`}>{citation}</span>
        </div>
      )}

      {typeof gap === 'number' && (
        <div className="runheader__metric">
          <span className="runheader__metric-label">Gap</span>
          <span
            className={`runheader__metric-value runheader__metric-value--gap ${gapTone(gap)}`}
            title={gapMetric.accessible}
            aria-label={gapMetric.accessible}
          >
            {gapMetric.compact}
          </span>
        </div>
      )}

      <button
        type="button"
        className="btn btn--sm"
        onClick={actionFn}
        disabled={!hasFetched && actionLabel !== 'Fetch a page'}
      >
        {actionLabel}
      </button>

      {isWorking && (
        <div className="runheader__progress">
          <div className="runheader__progress-bar" />
        </div>
      )}
    </div>
  )
}
