import { useEffect, useRef, useState } from 'react'
import ParticleLoader from './ParticleLoader.jsx'
import InfoTip from './InfoTip.jsx'

function scoreLabel(score) {
  if (score == null) return { text: '', color: 'var(--text-3)' }
  if (score >= 80) return { text: 'Excellent', color: 'var(--success)' }
  if (score >= 60) return { text: 'Strong', color: 'var(--accent)' }
  if (score >= 40) return { text: 'Moderate', color: 'var(--warning)' }
  return { text: 'Weak', color: 'var(--danger)' }
}

function gapLabel(gap) {
  if (gap == null) return { text: '', color: 'var(--text-3)' }
  if (gap >= 15) return { text: 'High gap - direct answer quality trails the baseline content signals', color: 'var(--danger)' }
  if (gap >= 5) return { text: 'Moderate gap - sharpen the answer path for this query', color: 'var(--warning)' }
  if (gap >= -5) return { text: 'Aligned', color: 'var(--success)' }
  if (gap >= -15) return { text: 'Query-led strength - broaden supporting content signals', color: 'var(--warning)' }
  return { text: 'Query significantly outpaces baseline AEO depth', color: 'var(--warning)' }
}

function summarizeResults(results, gap) {
  if (!results) return ''
  if (results.queryScore == null) {
    if ((results.overallScore ?? 0) >= 70) {
      return 'The page already looks structurally reusable. The next question is whether it answers a target query quickly enough.'
    }
    if ((results.overallScore ?? 0) >= 50) {
      return 'The baseline is usable, but not sharp. A query-specific check will show whether users feel that softness immediately.'
    }
    return 'The page still looks hard to extract. Fix structure first, then test the query path.'
  }

  if (gap >= 15) {
    return 'The content contains useful material, but the direct answer path still makes the user work too hard.'
  }
  if (gap >= 5) {
    return 'The page is close. Tighten the first answer block and make the supporting evidence easier to skim.'
  }
  if (gap >= -5) {
    return 'Baseline quality and query match are mostly aligned. Improvements should focus on clarity rather than major restructuring.'
  }
  return 'The target answer is stronger than the broader content system. Support it with clearer evidence, structure, and citations.'
}

function ScoreRing({ score, color, size = 112, strokeWidth = 7 }) {
  const [displayScore, setDisplayScore] = useState(0)
  const animRef = useRef(null)
  const radius = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (displayScore / 100) * circumference
  const centerX = size / 2
  const centerY = size / 2

  const ticks = [0, 72, 144, 216, 288].map(deg => {
    const radians = (deg * Math.PI) / 180
    return { x: centerX + radius * Math.cos(radians), y: centerY + radius * Math.sin(radians) }
  })

  useEffect(() => {
    if (score == null) return
    const start = Date.now()
    const duration = 1000

    const tick = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayScore(Math.round(score * eased))
      if (progress < 1) animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [score])

  return (
    <div className="score-ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={centerX} cy={centerY} r={radius} fill="none" stroke="var(--ring-track)" strokeWidth={strokeWidth} />
        {ticks.map((tick, index) => (
          <circle key={index} cx={tick.x} cy={tick.y} r={1.8} fill="var(--ring-tick)" />
        ))}
        <circle
          cx={centerX}
          cy={centerY}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.06s linear' }}
        />
      </svg>
      <div className="score-ring-center">
        <span className="score-number" style={{ color }}>{displayScore}</span>
      </div>
    </div>
  )
}

function metricTooltip(label) {
  if (label === 'GEU') {
    return 'Generative Engine Usability: how easily an AI can understand and trust your content.'
  }
  if (label === 'LLM Score') {
    return 'Model baseline: how reusable the page looks to answer engines before a query is applied.'
  }
  return ''
}

function MetricCard({ label, sublabel, score, lockedText }) {
  const semantic = scoreLabel(score)
  const tooltip = metricTooltip(label)
  const labelNode = (
    <div className="score-trio-label-wrap">
      <span className="score-trio-label">{label}</span>
      {tooltip && <InfoTip label={label}>{tooltip}</InfoTip>}
    </div>
  )

  if (typeof score !== 'number') {
    return (
      <div className="score-trio-item locked">
        <div className="metric-score-head">
          {labelNode}
          <div className="score-trio-meta">Locked</div>
        </div>
        <div className="metric-score-visual">
          <div className="score-ring-locked">{lockedText}</div>
        </div>
        <div className="score-trio-sub">{sublabel}</div>
        <div className="metric-score-track metric-score-track--locked">
          <span className="metric-score-track-fill" style={{ width: '0%' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="score-trio-item">
      <div className="metric-score-head">
        {labelNode}
        <div className="score-trio-meta" style={{ color: semantic.color }}>{semantic.text}</div>
      </div>
      <div className="metric-score-visual">
        <ScoreRing score={score} color={semantic.color} />
      </div>
      <div className="score-trio-sub">{sublabel}</div>
      <div className="metric-score-track">
        <span className="metric-score-track-fill" style={{ width: `${score}%`, background: semantic.color }} />
      </div>
    </div>
  )
}

function ScoreBand({ label, score, note, lockedText, accentColor }) {
  const semantic = scoreLabel(score)
  const isLocked = typeof score !== 'number'

  return (
    <div className="score-band-row">
      <div className="score-band-copy">
        <div className="score-band-label-row">
          <span className="score-band-label">{label}</span>
          <span className="score-band-status" style={{ color: isLocked ? 'var(--text-4)' : semantic.color }}>
            {isLocked ? 'Locked' : semantic.text}
          </span>
        </div>
        <div className="score-band-note">{isLocked ? lockedText : note}</div>
      </div>
      <div className={`score-band-track${isLocked ? ' locked' : ''}`}>
        <div
          className="score-band-fill"
          style={{
            width: isLocked ? '0%' : `${score}%`,
            background: accentColor || semantic.color,
          }}
        />
      </div>
      <div className="score-band-value" style={{ color: isLocked ? 'var(--text-4)' : semantic.color }}>
        {isLocked ? '--' : score}
      </div>
    </div>
  )
}

export default function ScoreDisplay({ results, loading, error = '', onRetry = null }) {
  const [activeTab, setActiveTab] = useState('geo')
  const [checksOpen, setChecksOpen] = useState(false)
  const checks = results?.checks || []
  const geuChecks = results?.geuChecks || []
  const llmContentModels = results?.llmContentModels || []
  const llmContentStatus = results?.llmContentStatus || []
  const passedGeo = checks.filter(check => check.passed).length
  const passedGeu = geuChecks.filter(check => check.passed).length
  const gap = results?.gapScore ?? (results?.queryScore != null ? results.contentScore - results.queryScore : null)
  const summary = summarizeResults(results, gap)
  const llmErrors = llmContentStatus.filter(status => status.status === 'error')
  const activeChecks = activeTab === 'geo' ? checks : geuChecks
  const checksBreakdown = (
    <div className="hero-checks-section">
      <div
        role="button"
        tabIndex={0}
        className="hero-checks-accordion-trigger"
        onClick={() => setChecksOpen(v => !v)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setChecksOpen(v => !v)
          }
        }}
        aria-expanded={checksOpen}
      >
        <div className="hero-checks-accordion-left">
          <div className="details-heading">Checks breakdown</div>
          <div className="details-subheading">
            {passedGeo}/{checks.length} content · {passedGeu}/{geuChecks.length} GEU
          </div>
        </div>
        <div className="hero-checks-accordion-right">
          <div className="checks-tabs" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className={`tab-btn${activeTab === 'geo' ? ' active geo' : ''}`}
              onClick={() => { setActiveTab('geo'); setChecksOpen(true) }}
            >
              Content {passedGeo}/{checks.length}
            </button>
            <button
              type="button"
              className={`tab-btn${activeTab === 'geu' ? ' active geu' : ''}`}
              onClick={() => { setActiveTab('geu'); setChecksOpen(true) }}
            >
              GEU {passedGeu}/{geuChecks.length}
            </button>
          </div>
          <span className={`checks-chevron${checksOpen ? ' open' : ''}`}>▾</span>
        </div>
      </div>

      <div className={`checks-accordion-body${checksOpen ? ' open' : ''}`}>
        <div className="checks-accordion-inner">
        <div className="checks-list">
          {activeChecks.map((check, index) => (
            <div
              key={check.id}
              className={`check-row${check.passed ? ' passed-row' : ''}`}
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <div className="check-left">
                <div className={`check-icon${check.passed ? ' passed' : ''}`}>
                  {check.passed ? 'OK' : ''}
                </div>
                <span className={`check-name${check.passed ? ' passed' : ' failed'}`}>
                  {check.label}
                </span>
              </div>
              <div className="check-right">
                {check.lift && <span className="check-lift">{check.lift}</span>}
                <span className={`check-weight${check.passed ? ' passed' : ' failed'}`}>
                  {check.weight} pts
                </span>
              </div>
            </div>
          ))}
        </div>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      {loading ? (
        <ParticleLoader label="Analyzing content signals..." />
      ) : results ? (
        <div className="baseline-results">
          <div className="score-overview-grid">
            {results.overallScore != null && (
              <div className="overall-score-hero">
                <div className="overall-score-label">Overall AEO Score</div>
                <div className="overall-score-main">
                  <div className="overall-score-number" style={{ color: scoreLabel(results.overallScore).color }}>
                    {results.overallScore}
                  </div>
                  <div className="overall-score-copy">
                    <div className="overall-score-grade" style={{ color: scoreLabel(results.overallScore).color }}>
                      {scoreLabel(results.overallScore).text}
                    </div>
                    <p className="overall-score-summary">{summary}</p>
                    <div className="overall-score-formula">
                      Content {results.contentScore} / GEU {results.geuScore}
                      {typeof results.llmContentScore === 'number' && ` / LLM ${results.llmContentScore}`}
                      {results.queryScore != null && ` / Query ${results.queryScore}`}
                    </div>
                  </div>
                </div>

                <div className="score-summary-row">
                  <span className="summary-pill ok">{passedGeo}/{checks.length || 0} content checks</span>
                  <span className="summary-pill ok">{passedGeu}/{geuChecks.length || 0} GEU checks</span>
                  <span className={`summary-pill ${llmErrors.length > 0 ? 'warn' : 'ok'}`}>
                    {llmContentModels.length}/{Math.max(llmContentModels.length + llmErrors.length, 1)} LLMs responded
                  </span>
                </div>

                {checksBreakdown}
              </div>
            )}

            <div className="score-trio score-trio--four">
              <MetricCard label="Content" sublabel="Princeton KDD" score={results.contentScore} lockedText="Pending" />
              <MetricCard label="GEU" sublabel="AutoGEO CMU" score={results.geuScore} lockedText="Pending" />
              <MetricCard label="LLM Score" sublabel="Model baseline" score={results.llmContentScore} lockedText="LLM unavailable" />
              <MetricCard label="Query Match" sublabel="vs. target query" score={results.queryScore} lockedText={'Add query\nto unlock'} />
            </div>
          </div>

          <div className="details-panel score-band-panel">
            <div className="details-header">
              <div>
                <div className="details-heading">Score comparison</div>
                <div className="details-subheading">
                  A cleaner readout of how the four scoring lenses relate to each other.
                </div>
              </div>
            </div>

            <div className="score-band-list">
              <ScoreBand
                label="Content"
                score={results.contentScore}
                note={`${passedGeo}/${checks.length || 0} content checks passed`}
                accentColor="var(--accent)"
              />
              <ScoreBand
                label="GEU"
                score={results.geuScore}
                note={`${passedGeu}/${geuChecks.length || 0} GEU checks passed`}
                accentColor="var(--success)"
              />
              <ScoreBand
                label="LLM baseline"
                score={results.llmContentScore}
                note={`${llmContentModels.length}/${Math.max(llmContentModels.length + llmErrors.length, 1)} model baselines returned`}
                lockedText="Baseline model readout is not available yet."
                accentColor="var(--danger)"
              />
              <ScoreBand
                label="Query match"
                score={results.queryScore}
                note="How directly the page answers the target query."
                lockedText="Add a target query to compare the answer path."
                accentColor="var(--model-a)"
              />
            </div>
          </div>

          {results.queryScore != null && (() => {
            const label = gapLabel(gap)
            return (
              <div className="gap-signal-card">
                <div className="gap-signal-header">
                  <div>
                    <div className="gap-signal-heading">Signal Readout</div>
                    <div className="gap-signal-copy">Compare baseline strength against direct answer quality for the target query.</div>
                  </div>
                  <div className="gap-signal-delta" style={{ color: label.color }}>
                    {gap >= 0 ? '+' : ''}{gap}
                  </div>
                </div>

                <div className="gap-signal-bars">
                  <div className="gap-signal-row">
                    <span className="gap-signal-tag">Content</span>
                    <div className="gap-signal-track">
                      <div className="gap-signal-fill gap-signal-fill--content" style={{ width: `${results.contentScore}%` }} />
                    </div>
                    <span className="gap-signal-score" style={{ color: scoreLabel(results.contentScore).color }}>
                      {results.contentScore}
                    </span>
                  </div>
                  <div className="gap-signal-row">
                    <span className="gap-signal-tag">Query</span>
                    <div className="gap-signal-track">
                      <div className="gap-signal-fill gap-signal-fill--query" style={{ width: `${results.queryScore}%` }} />
                    </div>
                    <span className="gap-signal-score" style={{ color: scoreLabel(results.queryScore).color }}>
                      {results.queryScore}
                    </span>
                  </div>
                </div>

                <div className="gap-signal-readout">
                <div className="gap-signal-readout-right">
                    <div className="gap-signal-label-row">
                      <div className="gap-signal-metric-label">Content-Query Gap</div>
                      <InfoTip label="Content-Query Gap" align="end">
                        This score shows whether your query-specific content is stronger or weaker than the rest of the page.
                      </InfoTip>
                    </div>
                    <div className="gap-signal-verdict" style={{ color: label.color }}>{label.text}</div>
                  </div>
                </div>
              </div>
            )
          })()}

          {(llmContentModels.length > 0 || llmErrors.length > 0) && (
            <div className="details-panel baseline-details-panel">
              <div className="details-header">
                <div>
                  <div className="details-heading">LLM content readout</div>
                </div>
              </div>

              <div className="query-model-status-board">
                {llmContentModels.map(modelReadout => (
                  <div key={modelReadout.model} className="model-status-card ok">
                    <div className="model-status-card-header">
                      <strong>{modelReadout.model}</strong>
                      <span>{modelReadout.llmContentScore ?? '--'}</span>
                    </div>
                    <p>{modelReadout.briefReason || 'Model returned a baseline score without an explanation.'}</p>
                  </div>
                ))}

                {llmErrors.map(status => (
                  <div key={`${status.model}-error`} className="model-status-card err">
                    <div className="model-status-card-header">
                      <strong>{status.model}</strong>
                      <span>Failed</span>
                    </div>
                    <p>{status.error || 'No model response was returned.'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      ) : error ? (
        <div className="score-empty-state">
          <div className="error-bar">Baseline analysis failed: {error}</div>
          {onRetry && (
            <button type="button" className="chip" onClick={onRetry}>
              Retry baseline scoring
            </button>
          )}
        </div>
      ) : (
        <div className="score-empty-state">
          Fetch a page to start baseline scoring.
        </div>
      )}
    </div>
  )
}
