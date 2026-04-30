import { useState } from 'react'
import { WanderingEyes } from '../components/loading-ui/wandering-eyes.jsx'
import { useNavigate } from 'react-router-dom'
import UrlInput from '../components/UrlInput.jsx'
import { useRun } from '../state/RunContext.jsx'
import MetricTile from '../components/primitives/MetricTile.jsx'
import StatPill from '../components/primitives/StatPill.jsx'
import DrillDrawer from '../components/primitives/DrillDrawer.jsx'
import { LoadingBlock, LockedBlock, ErrorBlock } from '../components/primitives/StateBlocks.jsx'
import {
  getAnswerGapCopy,
  getAnswerGapMetric,
  getBlockedPageState,
  getExecutiveQueryVerdict,
  getFixFirstCopy,
} from '../utils/diagnosticBrief.js'

function baselineVerdict(score) {
  if (typeof score !== 'number') return { word: '—', tone: 'muted', summary: 'Fetch a page to read the baseline.' }
  if (score >= 75) return { word: 'Ready', tone: 'ok', summary: 'The page passed the baseline read. Add a target query to test citation fit.' }
  if (score >= 60) return { word: 'Ready with risks', tone: 'warn', summary: 'The page can be analyzed but has structural risks worth fixing before launch.' }
  if (score >= 40) return { word: 'Needs work', tone: 'warn', summary: 'The page is readable but evidence is not yet strong enough to call it citation-ready.' }
  return { word: 'Blocked', tone: 'danger', summary: 'AI readers may struggle to access, parse, or reuse this page.' }
}

function topChecks(checks = [], passed, limit = 3) {
  return checks.filter(check => check.passed === passed).slice(0, limit)
}

function displayCheckLabel(check) {
  if (check?.passed === false) {
    const blockerLabels = {
      faq: 'FAQ structure missing or thin',
      stats: 'Statistics / numbers not detected',
      citations: 'External citations missing',
      schema: 'Structured data / schema not detected',
      comparison: 'Comparison framing missing',
      fluency: 'Page structure / reading flow too thin',
      llmstxt: 'llms.txt not detected',
      standalone: 'Standalone answer sentences missing',
      frontloaded: 'Answer not front-loaded',
      sourced: 'Sourced claims missing',
      coherent: 'Opening not direct enough',
    }
    return blockerLabels[check.id] || check?.label || ''
  }
  return check?.label || ''
}

const SAMPLE_URLS = [
  'https://stripe.com/pricing',
  'https://www.notion.com/help',
  'https://anthropic.com',
  'https://vercel.com/blog',
]

const VIEW_COPY = {
  human: 'Looks fine to you. The page reads cleanly in a normal browser.',
  ai:    'But AI systems may see less — blocked sections, weak metadata, or content too thin to cite.',
}

function FocusGate() {
  const { url, setUrl, handleFetchComplete, contentAnalyzing } = useRun()
  const [view, setView] = useState('human')
  const [autoFetchToken, setAutoFetchToken] = useState(0)
  const isAi = view === 'ai'

  const handleSampleClick = (sampleUrl) => {
    setUrl(sampleUrl)
    setAutoFetchToken(token => token + 1)
  }

  return (
    <div className="focus__split">
      <section className="focus__copy-col">
        <header className="focus__header">
          <span className="kicker"><span style={{ color: 'var(--ok)' }}>●</span> Live · Free audit</span>
          <h1 className="focus__title">See your page like an AI does.</h1>
          <p className={`focus__sub focus__sub--${view}`} key={view}>
            {VIEW_COPY[view]}
          </p>
        </header>

        <div className="focus__toggle" role="tablist" aria-label="View mode">
          <button
            type="button"
            role="tab"
            aria-selected={!isAi}
            className={`focus__toggle-btn${!isAi ? ' is-active' : ''}`}
            onMouseEnter={() => setView('human')}
            onFocus={() => setView('human')}
            onClick={() => setView('human')}
          >Human view</button>
          <button
            type="button"
            role="tab"
            aria-selected={isAi}
            className={`focus__toggle-btn${isAi ? ' is-active' : ''}`}
            onMouseEnter={() => setView('ai')}
            onFocus={() => setView('ai')}
            onClick={() => setView('ai')}
          >AI view</button>
        </div>

        <div className="focus__form">
          <UrlInput
            url={url}
            onUrlChange={setUrl}
            onFetchComplete={handleFetchComplete}
            autoFetchToken={autoFetchToken}
          />

          <div className="focus__samples">
            <span className="focus__samples-label">Try a sample</span>
            <div className="focus__samples-row">
              {SAMPLE_URLS.map(s => (
                <button
                  key={s}
                  type="button"
                  className="chip focus__sample"
                  onClick={() => handleSampleClick(s)}
                  disabled={contentAnalyzing}
                >
                  {s.replace(/^https?:\/\/(www\.)?/, '')}
                </button>
              ))}
            </div>
          </div>

          {contentAnalyzing && (
            <span className="kicker">Analyzing baseline content signals…</span>
          )}
        </div>
      </section>

      <aside className={`focus__preview${isAi ? ' is-ai' : ''}`} aria-hidden="true">
        <div className="focus__preview-glow" />

        <div className="focus__preview-head">
          <span className="focus__preview-eyebrow">Preview</span>
          <span className={`focus__preview-status focus__preview-status--${isAi ? 'warn' : 'ok'}`}>
            <span className="focus__preview-status-dot" />
            {isAi ? 'Citation gaps' : 'Reads cleanly'}
          </span>
        </div>

        <div className="focus__preview-card">
          <div className="focus__preview-kicker">
            {isAi ? 'Important context may be invisible' : 'Content appears complete'}
          </div>

          <div className="mini-nav" />
          <div className="mini-line" />
          <div className="mini-line mini-line--mid" />
          <div className="mini-line mini-line--short" />

          <div className="mini-box">
            <span className="mini-box-label">{isAi ? 'Hero blocked from crawlers' : 'Hero · headline + image'}</span>
          </div>

          <div className="mini-meter" aria-hidden="true">
            <span className="mini-meter-track">
              <span className="mini-meter-fill" />
            </span>
            <span className="mini-meter-label">
              {isAi ? '38 / 100 citation-ready' : '92 / 100 reads cleanly'}
            </span>
          </div>

          {isAi ? (
            <div className="mini-signals">
              <div className="mini-signal mini-signal--fail">
                <span className="mini-signal-icon">✕</span>
                <span className="mini-signal-text">Schema · not found</span>
              </div>
              <div className="mini-signal mini-signal--fail">
                <span className="mini-signal-icon">✕</span>
                <span className="mini-signal-text">Meta description · absent</span>
              </div>
              <div className="mini-signal mini-signal--warn">
                <span className="mini-signal-icon">!</span>
                <span className="mini-signal-text">Alt text · 0 of 8</span>
              </div>
              <div className="mini-signal mini-signal--fail">
                <span className="mini-signal-icon">✕</span>
                <span className="mini-signal-text">JS render · blocked</span>
              </div>
              <div className="mini-signal mini-signal--warn">
                <span className="mini-signal-icon">!</span>
                <span className="mini-signal-text">Author / date · absent</span>
              </div>
              <div className="mini-signal mini-signal--fail">
                <span className="mini-signal-icon">✕</span>
                <span className="mini-signal-text">Canonical URL · none</span>
              </div>
            </div>
          ) : (
            <>
              <div className="mini-grid">
                <div className="mini-callout">Readable layout, images, and context make sense in a normal browser.</div>
                <div className="mini-callout">Users see a complete page with supporting sections and visual hierarchy.</div>
              </div>
              <div className="mini-line mini-line--hidden" />
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

export default function Overview() {
  const navigate = useNavigate()
  const {
    hasFetched, contentAnalyzing, error,
    activeResults, baselineResults, results,
    pageIntelligence, markdown,
    query, setQuery, handleAnalyze, queryAnalyzing, hasBaseline, hasQueryResults,
    url, normalizedUrl, sendDraftToChat,
    handleBaselineAnalyze, sourceSignals,
    competitorQuery, competitorQueryLoading,
  } = useRun()

  const [drillKey, setDrillKey] = useState(null)
  const [signalView, setSignalView] = useState('blockers')

  if (!hasFetched) return <FocusGate />

  if (contentAnalyzing && !activeResults) {
    return <LoadingBlock label="Reading baseline" lines={4} />
  }

  if (!activeResults && error) {
    return (
      <ErrorBlock
        title="Baseline analysis failed"
        copy={error}
        action={
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => handleBaselineAnalyze(markdown, sourceSignals, pageIntelligence)}
          >
            Retry baseline
          </button>
        }
      />
    )
  }

  if (!activeResults) {
    return <LoadingBlock label="Reading baseline" lines={4} />
  }

  const overall = activeResults.overallScore
  const verdictBaseline = baselineVerdict(overall)
  const blockedState = getBlockedPageState(pageIntelligence, markdown)
  const queryVerdict = hasQueryResults
    ? getExecutiveQueryVerdict({ queryScore: results.queryScore, gapScore: results.gapScore, blockedState })
    : null
  const verdictTitle = blockedState.isBlocked
    ? 'Blocked'
    : queryVerdict
      ? queryVerdict.title
      : verdictBaseline.word
  const verdictTone = blockedState.isBlocked
    ? 'danger'
    : queryVerdict
      ? queryVerdict.tone
      : verdictBaseline.tone
  const verdictSummary = blockedState.isBlocked
    ? blockedState.summary
    : queryVerdict
      ? queryVerdict.meaning
      : verdictBaseline.summary
  const verdictNext = blockedState.isBlocked
    ? blockedState.action
    : queryVerdict
      ? queryVerdict.next
      : 'Add a target query to test direct answer quality.'
  const verdictPillLabel = blockedState.isBlocked
    ? 'Blocked'
    : queryVerdict
      ? queryVerdict.title.replace(/^This page /, '').replace(/^The /, '')
      : verdictBaseline.word !== '—' ? verdictBaseline.word : 'Reading'

  const gap = activeResults.gapScore
  const gapCopy = hasQueryResults ? getAnswerGapCopy(gap) : null
  const gapMetric = hasQueryResults ? getAnswerGapMetric(gap) : null

  const checks = activeResults.checks || []
  const geuChecks = activeResults.geuChecks || []
  const strengths = topChecks([...checks, ...geuChecks], true)
  const blockers = topChecks([...checks, ...geuChecks], false)

  const fixCopy = hasQueryResults
    ? getFixFirstCopy({
        fix: activeResults.intelligence?.highestImpactFix,
        verdicts: activeResults.verdicts || [],
        blockedState,
      })
    : null

  const passedContent = checks.filter(c => c.passed).length
  const passedUsability = geuChecks.filter(c => c.passed).length

  const drill = (() => {
    if (!drillKey) return null
    if (drillKey === 'content') {
      return {
        title: 'Content score',
        kicker: 'Page structure',
        caption: `${passedContent}/${checks.length} page-structure checks passed.`,
        body: (
          <ul className="data-list" style={{ listStyle: 'none', padding: 0, margin: 0, borderTop: 0 }}>
            {checks.map(c => (
              <li key={c.id} className="data-row">
                <span className="data-row__label">{c.label}{c.lift ? ` · ${c.lift}` : ''}</span>
                <span className={`data-row__value ${c.passed ? 'data-row__value--ok' : 'data-row__value--danger'}`}>
                  {c.passed ? 'OK' : 'Miss'} · {c.weight} pts
                </span>
              </li>
            ))}
          </ul>
        ),
      }
    }
    if (drillKey === 'geu') {
      return {
        title: 'AI usability',
        kicker: 'Reusable answer signals',
        caption: `${passedUsability}/${geuChecks.length} usability checks passed.`,
        body: (
          <ul className="data-list" style={{ listStyle: 'none', padding: 0, margin: 0, borderTop: 0 }}>
            {geuChecks.map(c => (
              <li key={c.id} className="data-row">
                <span className="data-row__label">{c.label}</span>
                <span className={`data-row__value ${c.passed ? 'data-row__value--ok' : 'data-row__value--danger'}`}>
                  {c.passed ? 'OK' : 'Miss'} · {c.weight} pts
                </span>
              </li>
            ))}
          </ul>
        ),
      }
    }
    if (drillKey === 'llm') {
      const models = activeResults.llmContentModels || []
      const errs = (activeResults.llmContentStatus || []).filter(s => s.status === 'error')
      return {
        title: 'Model read',
        kicker: 'Multi-model baseline',
        caption: `${models.length}/${models.length + errs.length || 1} models responded.`,
        body: (
          <div className="vstack" style={{ gap: 12 }}>
            {models.map(m => (
              <div key={m.model} className="panel" style={{ padding: 16 }}>
                <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong>{m.model}</strong>
                  <span className="mono">{m.llmContentScore ?? '—'}</span>
                </div>
                <p className="caption" style={{ margin: 0 }}>{m.briefReason || 'Model returned a baseline score without an explanation.'}</p>
              </div>
            ))}
            {errs.map(s => (
              <div key={s.model} className="panel" style={{ padding: 16, borderColor: 'var(--danger)' }}>
                <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong>{s.model}</strong>
                  <span className="mono danger">Failed</span>
                </div>
                <p className="caption" style={{ margin: 0 }}>{s.error || 'No model response was returned.'}</p>
              </div>
            ))}
          </div>
        ),
      }
    }
    if (drillKey === 'query') {
      const verdicts = activeResults.verdicts || []
      return {
        title: 'Target query fit',
        kicker: 'Per-model verdicts',
        caption: hasQueryResults
          ? `${verdicts.length} model verdicts. Open Diagnostics for evidence.`
          : 'Run a target query to unlock this score.',
        body: hasQueryResults ? (
          <div className="vstack" style={{ gap: 12 }}>
            {verdicts.map(v => (
              <div key={v.model} className="verdict-card">
                <div className="verdict-card__head">
                  <span className="verdict-card__model">{v.model}</span>
                  <span className="verdict-card__score">{typeof v.queryMatchScore === 'number' ? v.queryMatchScore : '—'}</span>
                </div>
                {v.failureMode && <span className="kicker">{v.failureMode}</span>}
                {v.verdict && <p className="verdict-card__line">{v.verdict}</p>}
                {v.topGap && <p className="verdict-card__line"><strong>Top gap:</strong> {v.topGap}</p>}
                {v.suggestedFix && <p className="verdict-card__line"><strong>Fix:</strong> {v.suggestedFix}</p>}
              </div>
            ))}
          </div>
        ) : (
          <LockedBlock
            title="No target query yet"
            copy="Add a query above to score the answer path."
            action={<button className="btn btn--sm" onClick={() => setDrillKey(null)}>Close</button>}
          />
        ),
      }
    }
    return null
  })()

  return (
    <>
      <section className="hero">
        <div className="hero__copy">
          <span className="kicker">Overview · {hasQueryResults ? 'Query verdict' : 'Baseline'}</span>
          <h1 className="hero__verdict">{verdictTitle}</h1>
          <p className="hero__summary">{verdictSummary}</p>
          <div className="hero__next">
            <StatPill tone={verdictTone}>{verdictPillLabel}</StatPill>
            <span className="caption">{verdictNext}</span>
          </div>
        </div>
        <div className="hero__score-box">
          <span className="kicker">Overall readiness of the page</span>
          <span className="hero__score-num score-reveal" key={typeof overall === 'number' ? overall : 'pending'}>
            {typeof overall === 'number' ? overall : '—'}
            <span className="hero__score-suffix">/100</span>
          </span>
          <span className={`hero__score-tone hero__score-tone--${verdictTone}`}>
            {verdictTone === 'ok' ? 'Above the citation bar' : verdictTone === 'warn' ? 'Sits at the risk line' : verdictTone === 'danger' ? 'Below the citation bar' : 'Reading the page'}
          </span>
          {activeResults?.scoreConfidence && (
            <span
              className="confidence-chip"
              data-confidence={activeResults.scoreConfidence}
              title={
                activeResults.scoreConfidence === 'full'
                  ? 'All models contributed to this score.'
                  : activeResults.scoreConfidence === 'partial'
                    ? 'Some models did not respond — score is averaged from those that did.'
                    : 'No models responded — showing rule-based signals only.'
              }
            >
              {activeResults.scoreConfidence === 'full' ? 'Full read' : activeResults.scoreConfidence === 'partial' ? 'Partial read' : 'Rules-only'}
            </span>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div className="section__head-titles">
            <span className="kicker">Score lenses</span>
            <h2 className="h-2">Four reads on this page.</h2>
          </div>
          <span className="caption">Click any tile for checks and model notes.</span>
        </div>
        <div className="metric-grid">
          <MetricTile
            label="Page structure"
            value={activeResults.contentScore}
            caption={`${passedContent}/${checks.length || 0} checks passed`}
            onClick={checks.length ? () => setDrillKey('content') : undefined}
          />
          <MetricTile
            label="AI usability"
            value={activeResults.geuScore}
            caption={`${passedUsability}/${geuChecks.length || 0} signals passed`}
            onClick={geuChecks.length ? () => setDrillKey('geu') : undefined}
          />
          <MetricTile
            label="Model read"
            value={activeResults.llmContentScore}
            caption={`${(activeResults.llmContentModels || []).length} models responded`}
            onClick={() => setDrillKey('llm')}
          />
          <MetricTile
            label="Query match"
            value={activeResults.queryScore}
            caption={hasQueryResults ? 'Per-model verdicts available' : 'Add a target query to unlock'}
            onClick={hasQueryResults ? () => setDrillKey('query') : undefined}
          />
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div className="section__head-titles">
            <span className="kicker">Signals</span>
            <h2 className="h-2">{signalView === 'blockers' ? 'What is holding the page back.' : 'What the page is doing well.'}</h2>
          </div>
          <div className="signal-toggle" role="group" aria-label="Signal view">
            <button
              type="button"
              aria-pressed={signalView === 'blockers'}
              className={`signal-toggle__btn${signalView === 'blockers' ? ' signal-toggle__btn--active' : ''}`}
              onClick={() => setSignalView('blockers')}
            >
              Blockers · {blockers.length}
            </button>
            <button
              type="button"
              aria-pressed={signalView === 'strengths'}
              className={`signal-toggle__btn${signalView === 'strengths' ? ' signal-toggle__btn--active' : ''}`}
              onClick={() => setSignalView('strengths')}
            >
              Strengths · {strengths.length}
            </button>
          </div>
        </div>
        <div className="list">
          {signalView === 'blockers' ? (
            blockers.length ? blockers.map(b => (
              <div key={b.id} className="list__row list__row--danger">
                <span className="list__row-marker">−{b.weight}</span>
                <span className="list__row-text">{displayCheckLabel(b)}</span>
              </div>
            )) : (
              <div className="list__row"><span className="list__row-marker">—</span><span className="list__row-text muted">No major blocker detected.</span></div>
            )
          ) : (
            strengths.length ? strengths.map(s => (
              <div key={s.id} className="list__row list__row--ok">
                <span className="list__row-marker">+{s.weight}</span>
                <span className="list__row-text">{s.label}</span>
              </div>
            )) : (
              <div className="list__row"><span className="list__row-marker">—</span><span className="list__row-text muted">No strong baseline signal yet.</span></div>
            )
          )}
        </div>
      </section>

      {hasQueryResults && gapCopy && (
        <section className="section">
          <div className="section__head">
            <div className="section__head-titles">
              <span className="kicker">Answer gap</span>
              <h2 className="h-2">Page quality vs. answer quality.</h2>
            </div>
          </div>
          <div className="callout callout--summary">
            <div className="callout__copy">
              <span className="callout__title">{gapCopy.label}</span>
              <span className="callout__detail">{gapCopy.detail}</span>
            </div>
            <StatPill tone={gapCopy.tone === 'muted' ? 'plain' : gapCopy.tone}>
              {gapMetric?.compact || 'Unavailable'}
            </StatPill>
          </div>
        </section>
      )}

      {hasQueryResults && fixCopy && (
        <section className="section">
          <div className="section__head">
            <div className="section__head-titles">
              <span className="kicker">Fix First</span>
              <h2 className="h-2">One change with the highest expected lift.</h2>
            </div>
          </div>
          <div className="fix-card">
            <div className="fix-card__copy">
              <div className="fix-card__head">
                {fixCopy.failureMode && <StatPill tone="warn">{fixCopy.failureMode}</StatPill>}
              </div>
              <h3 className="fix-card__title">{fixCopy.headline}</h3>
              <p className="fix-card__reason">{fixCopy.reason}</p>
              {fixCopy.meta && <p className="caption">{fixCopy.meta}</p>}
            </div>
            <div className="hstack">
              <button className="btn btn--ghost btn--sm" onClick={() => navigate('/diagnostics')}>Open in Diagnostics</button>
              <button
                className="btn btn--sm"
                onClick={() => {
                  sendDraftToChat(fixCopy.draft)
                  navigate('/rewrite')
                }}
              >
                Send to Rewrite
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="section__head">
          <div className="section__head-titles">
            <span className="kicker">{hasQueryResults ? 'Test another query' : 'Step three · Query test'}</span>
            <h2 className="h-2">
              {hasQueryResults
                ? 'Re-run with a different target question.'
                : 'Run a target query to unlock the answer path.'}
            </h2>
          </div>
        </div>
        <div className="panel">
          <div className="vstack" style={{ gap: 8 }}>
            {!hasQueryResults && (
              <span className="caption">Baseline complete. Enter the question this page needs to answer for a citation engine.</span>
            )}
            <div className="query-row">
              <input
                id="query-input"
                className="query-row__input"
                placeholder="e.g. what is the best CRM for small business?"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (!queryAnalyzing && query.trim() && hasBaseline) handleAnalyze()
                  }
                }}
              />
              <button
                type="button"
                className="btn"
                onClick={handleAnalyze}
                disabled={queryAnalyzing || !query.trim() || !hasBaseline}
              >
                {queryAnalyzing
                  ? <><WanderingEyes style={{ height: '20px', width: '45px', marginRight: '6px' }} /> Analyzing…</>
                  : hasQueryResults ? 'Re-run query' : 'Run query test'}
              </button>
            </div>
            {!hasQueryResults && !competitorQueryLoading && competitorQuery && (
              <div className="suggestion-row">
                <button className="chip" onClick={() => setQuery(competitorQuery)}>{competitorQuery}</button>
              </div>
            )}
            {error && <div className="error-bar">{error}</div>}
          </div>
        </div>
      </section>

      <DrillDrawer
        open={!!drill}
        onClose={() => setDrillKey(null)}
        title={drill?.title || ''}
        kicker={drill?.kicker}
        caption={drill?.caption}
      >
        {drill?.body}
      </DrillDrawer>
    </>
  )
}
