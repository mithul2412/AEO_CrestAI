import { useState } from 'react'
import ParticleLoader from './ParticleLoader.jsx'

function scoreLabel(score) {
  if (score == null) return { text: '', color: 'var(--text-3)' }
  if (score >= 80) return { text: 'Excellent', color: 'var(--success)' }
  if (score >= 60) return { text: 'Strong', color: 'var(--brand-signal)' }
  if (score >= 40) return { text: 'Moderate', color: 'var(--warning)' }
  return { text: 'Weak', color: 'var(--danger)' }
}

function executiveVerdict(results) {
  const score = results?.overallScore ?? 0
  if (score >= 75) return { text: 'Ready', tone: 'ok', next: 'Run a target query to confirm the exact answer path.' }
  if (score >= 60) return { text: 'Ready with risks', tone: 'warn', next: 'Run a target query, then fix the biggest blocker before publishing.' }
  if (score >= 40) return { text: 'Needs work', tone: 'warn', next: 'Fix the top blocker, then re-run the baseline.' }
  return { text: 'Blocked', tone: 'danger', next: 'Resolve access or readability issues before judging the content.' }
}

function gapLabel(gap) {
  if (gap == null) return { text: '', color: 'var(--text-3)' }
  if (gap >= 15) return { text: 'Large answer gap - the exact query answer is weaker than the page looks overall', color: 'var(--danger)' }
  if (gap >= 5) return { text: 'Moderate answer gap - sharpen the first answer for this query', color: 'var(--warning)' }
  if (gap >= -5) return { text: 'Aligned - the page quality and target-query answer are moving together', color: 'var(--success)' }
  if (gap >= -15) return { text: 'Query-led strength - the target answer is stronger than the broader page signals', color: 'var(--warning)' }
  return { text: 'Query significantly outpaces the broader page quality', color: 'var(--warning)' }
}

function summarizeResults(results, gap) {
  if (!results) return ''
  if (results.queryScore == null) {
    if ((results.overallScore ?? 0) >= 70) {
      return 'The page looks structurally usable. The next decision is whether it answers the exact query quickly enough.'
    }
    if ((results.overallScore ?? 0) >= 50) {
      return 'The page can be analyzed, but the evidence is not yet strong enough to call it citation-ready.'
    }
    return 'The page may be hard for AI readers to access, parse, or reuse. Fix the first blocker before judging content quality.'
  }

  if (gap >= 15) return 'The page may look useful overall, but the exact query answer is still too hard to extract.'
  if (gap >= 5) return 'The page is close. Tighten the first answer block and make proof easier to skim.'
  if (gap >= -5) return 'The baseline quality and target query answer are mostly aligned.'
  return 'The query answer is stronger than the rest of the page system. Support it with clearer structure and evidence.'
}

function topChecks(checks = [], passed = true, limit = 3) {
  return checks.filter(check => check.passed === passed).slice(0, limit)
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

function TechnicalScoreMetric({ label, score, note }) {
  const semantic = scoreLabel(score)
  return (
    <div className="technical-score-metric">
      <span>{label}</span>
      <strong style={{ color: semantic.color }}>{typeof score === 'number' ? score : '--'}</strong>
      <small>{note}</small>
    </div>
  )
}

export default function ScoreDisplay({ results, loading, error = '', onRetry = null, onRunQueryTest = null }) {
  const [activeTab, setActiveTab] = useState('content')
  const [checksOpen, setChecksOpen] = useState(false)
  const [technicalOpen, setTechnicalOpen] = useState(false)

  const checks = results?.checks || []
  const geuChecks = results?.geuChecks || []
  const llmContentModels = results?.llmContentModels || []
  const llmContentStatus = results?.llmContentStatus || []
  const passedContent = checks.filter(check => check.passed).length
  const passedUsability = geuChecks.filter(check => check.passed).length
  const gap = results?.gapScore ?? (results?.queryScore != null ? results.contentScore - results.queryScore : null)
  const summary = summarizeResults(results, gap)
  const verdict = executiveVerdict(results)
  const llmErrors = llmContentStatus.filter(status => status.status === 'error')
  const strengths = topChecks([...checks, ...geuChecks], true)
  const blockers = topChecks([...checks, ...geuChecks], false)
  const topStrength = strengths[0]?.label || 'No strong baseline signal is visible yet.'
  const topBlocker = blockers[0]?.label || 'No major baseline blocker detected.'
  const activeChecks = activeTab === 'content' ? checks : geuChecks

  if (loading) {
    return <ParticleLoader label="Analyzing content signals..." />
  }

  if (!results) {
    return error ? (
      <div className="score-empty-state">
        <div className="error-bar">Baseline analysis failed: {error}</div>
        {onRetry && (
          <button type="button" className="chip" onClick={onRetry}>
            Retry baseline scoring
          </button>
        )}
      </div>
    ) : (
      <div className="score-empty-state">Fetch a page to start baseline scoring.</div>
    )
  }

  return (
    <div className="baseline-results">
      <div className={`overall-score-hero overall-score-hero--${verdict.tone}`}>
        <div className="overall-score-label">Baseline Readiness</div>
        <div className="overall-score-main">
          <div className="overall-score-number" style={{ color: scoreLabel(results.overallScore).color }}>
            {results.overallScore}
          </div>
          <div className="overall-score-copy">
            <div className={`overall-score-grade executive-verdict executive-verdict--${verdict.tone}`}>
              {verdict.text}
            </div>
            <p className="overall-score-summary">{summary}</p>
            <div className="executive-next-action">{verdict.next}</div>
          </div>
        </div>

        <div className="executive-decision-grid">
          <div className="executive-decision-item">
            <span className="fix-label">What happened</span>
            <strong>{verdict.text}</strong>
            <p>{summary}</p>
          </div>
          <div className="executive-decision-item">
            <span className="fix-label">Why it matters</span>
            <strong>{results.queryScore == null ? 'Baseline only' : 'Query has been tested'}</strong>
            <p>
              {results.queryScore == null
                ? 'This first pass checks whether the page is readable enough before judging a specific customer question.'
                : 'The answer gap shows whether the page answers this exact query as well as its general page quality suggests.'}
            </p>
          </div>
          <div className="executive-decision-item executive-decision-item--action">
            <span className="fix-label">What to do next</span>
            <strong>{results.queryScore == null ? 'Run Query Test' : 'Inspect Fix First'}</strong>
            <p>{results.queryScore == null ? 'Test the question this page needs to win.' : 'Use Diagnostics to inspect the best chunk, competitor position, and one fix.'}</p>
          </div>
        </div>

        <div className="baseline-decision-panel baseline-decision-panel--compact">
          <div className="baseline-decision-column">
            <span className="fix-label">Top strength</span>
            <div className={`decision-list-item ${strengths.length > 0 ? 'good' : 'muted'}`}>{topStrength}</div>
          </div>
          <div className="baseline-decision-column">
            <span className="fix-label">Top blocker</span>
            <div className={`decision-list-item ${blockers.length > 0 ? 'warn' : 'good'}`}>{topBlocker}</div>
          </div>
        </div>

        {results.queryScore != null && (() => {
          const label = gapLabel(gap)
          return (
            <div className="answer-gap-callout">
              <div>
                <span className="fix-label">Answer gap</span>
                <strong style={{ color: label.color }}>{gap >= 0 ? '+' : ''}{gap}</strong>
              </div>
              <p>{label.text}. This compares the page's general quality with how clearly it answers the exact query.</p>
            </div>
          )
        })()}

        {results.queryScore == null && onRunQueryTest && (
          <div className="baseline-next-action">
            <div>
              <span className="fix-label">Next decision</span>
              <p>Baseline is only the first pass. Run a target query to test whether the page can answer the question that matters.</p>
            </div>
            <button type="button" className="chip chip-primary" onClick={onRunQueryTest}>
              Run Query Test
            </button>
          </div>
        )}
      </div>

      <div className="details-panel score-band-panel baseline-technical-panel">
        <button
          type="button"
          className="details-header evidence-disclosure-trigger technical-score-trigger"
          aria-expanded={technicalOpen}
          onClick={() => setTechnicalOpen(value => !value)}
        >
          <div>
            <div className="details-heading">Technical score details</div>
            <div className="details-subheading">
              Optional scoring lenses, checks, and raw model notes for audit.
            </div>
          </div>
          <span className={`checks-chevron${technicalOpen ? ' open' : ''}`}>v</span>
        </button>

        {technicalOpen && (
          <div className="technical-score-body">
            <div className="score-summary-row">
              <span className="summary-pill ok">{passedContent}/{checks.length || 0} page checks</span>
              <span className="summary-pill ok">{passedUsability}/{geuChecks.length || 0} AI usability checks</span>
              <span className={`summary-pill ${llmErrors.length > 0 ? 'warn' : 'ok'}`}>
                {llmContentModels.length}/{Math.max(llmContentModels.length + llmErrors.length, 1)} models responded
              </span>
            </div>

            <div className="technical-score-grid">
              <TechnicalScoreMetric label="Page structure" score={results.contentScore} note="Content checks passed" />
              <TechnicalScoreMetric label="AI usability" score={results.geuScore} note="Reusable answer signals" />
              <TechnicalScoreMetric label="Model readability" score={results.llmContentScore} note="Baseline model read" />
              <TechnicalScoreMetric label="Target query fit" score={results.queryScore} note="Unlocked after query scoring" />
            </div>

            <div className="score-band-list">
              <ScoreBand
                label="Page structure"
                score={results.contentScore}
                note={`${passedContent}/${checks.length || 0} page checks passed`}
                accentColor="var(--model-b)"
              />
              <ScoreBand
                label="AI usability"
                score={results.geuScore}
                note={`${passedUsability}/${geuChecks.length || 0} AI usability checks passed`}
                accentColor="var(--model-b)"
              />
              <ScoreBand
                label="Model readability"
                score={results.llmContentScore}
                note={`${llmContentModels.length}/${Math.max(llmContentModels.length + llmErrors.length, 1)} model baseline reads returned`}
                lockedText="Baseline model readout is not available yet."
                accentColor="var(--model-b)"
              />
              <ScoreBand
                label="Target query fit"
                score={results.queryScore}
                note="How directly the page answers the target query."
                lockedText="Add a target query to compare the answer path."
                accentColor="var(--model-b)"
              />
            </div>

            <div className="hero-checks-section">
              <button
                type="button"
                className="hero-checks-accordion-trigger"
                onClick={() => setChecksOpen(value => !value)}
                aria-expanded={checksOpen}
              >
                <div className="hero-checks-accordion-left">
                  <div className="details-heading">Checks breakdown</div>
                  <div className="details-subheading">
                    {passedContent}/{checks.length} page checks / {passedUsability}/{geuChecks.length} AI usability checks
                  </div>
                </div>
                <span className={`checks-chevron${checksOpen ? ' open' : ''}`}>v</span>
              </button>

              {checksOpen && (
                <div className="checks-accordion-inner">
                  <div className="checks-tabs">
                    <button
                      type="button"
                      className={`tab-btn${activeTab === 'content' ? ' active geo' : ''}`}
                      onClick={() => setActiveTab('content')}
                    >
                      Page structure {passedContent}/{checks.length}
                    </button>
                    <button
                      type="button"
                      className={`tab-btn${activeTab === 'usability' ? ' active geu' : ''}`}
                      onClick={() => setActiveTab('usability')}
                    >
                      AI usability {passedUsability}/{geuChecks.length}
                    </button>
                  </div>
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
              )}
            </div>

            {(llmContentModels.length > 0 || llmErrors.length > 0) && (
              <div className="baseline-details-panel">
                <div className="details-heading">Technical model notes</div>
                <div className="details-subheading">Raw model notes are available for audit, but they are not the primary decision layer.</div>
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
        )}
      </div>
    </div>
  )
}
