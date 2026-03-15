import { useCallback, useEffect, useState } from 'react'
import UrlInput from './components/UrlInput.jsx'
import ScoreDisplay from './components/ScoreDisplay.jsx'
import Verdicts from './components/Verdicts.jsx'
import Chat from './components/Chat.jsx'
import { readApiError } from './utils/api.js'

const THEME_KEY = 'aeo-scorer-theme'

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark'
  return window.localStorage.getItem(THEME_KEY) || 'dark'
}

function computeOverallScore(results) {
  const scores = [
    results?.contentScore,
    results?.geuScore,
    results?.llmContentScore,
    results?.queryScore,
  ].filter(score => typeof score === 'number')

  if (scores.length === 0) return null
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
}

function mergeResultsWithBaseline(nextResults, baselineResults) {
  const llmContentScore = nextResults.llmContentScore ?? baselineResults?.llmContentScore ?? null
  const llmContentModels = nextResults.llmContentModels?.length
    ? nextResults.llmContentModels
    : (baselineResults?.llmContentModels || [])
  const llmContentStatus = nextResults.llmContentStatus?.length
    ? nextResults.llmContentStatus
    : (baselineResults?.llmContentStatus || [])

  const merged = {
    ...nextResults,
    llmContentScore,
    llmContentModels,
    llmContentStatus,
  }

  return {
    ...merged,
    overallScore: computeOverallScore(merged),
    gapScore: merged.gapScore ?? (merged.queryScore != null ? merged.contentScore - merged.queryScore : null),
  }
}

function JourneyBar({ fetchStatus, queryStatus, resultsStatus }) {
  const steps = [
    {
      label: 'Fetch',
      status: fetchStatus,
      detail: fetchStatus === 'done'
        ? 'Ready'
        : fetchStatus === 'active'
          ? 'Live'
          : 'Pending',
    },
    {
      label: 'Baseline',
      status: queryStatus,
      detail: queryStatus === 'done'
        ? 'Ready'
        : queryStatus === 'active'
          ? 'Running'
          : 'Locked',
    },
    {
      label: 'Verdicts',
      status: resultsStatus,
      detail: resultsStatus === 'done'
        ? 'Ready'
        : resultsStatus === 'active'
          ? 'Running'
          : 'Locked',
    },
  ]

  return (
    <div className="journey-bar" aria-label="Analysis progress">
      {steps.map((step, index) => (
        <div className={`journey-item ${step.status}`} key={step.label}>
          <div className="journey-step-track" aria-hidden="true">
            <span className="journey-state" />
            {index < steps.length - 1 && <span className="journey-line" />}
          </div>
          <div className="journey-step-copy">
            <span className="journey-label">{step.label}</span>
            <span className="journey-caption">{step.detail}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function getHeroContent({ hasFetched, hasQueryResults, contentAnalyzing, queryAnalyzing }) {
  if (!hasFetched && !contentAnalyzing) {
    return {
      eyebrow: 'Pre-publish answer engine review',
      title: 'Score a live page before you ship it.',
      description: 'Fetch the page, read the baseline, then test one exact query.',
    }
  }

  if (contentAnalyzing) {
    return {
      eyebrow: 'Baseline in progress',
      title: 'Building the baseline.',
      description: 'Fetching the page and reading structure signals.',
    }
  }

  if (queryAnalyzing) {
    return {
      eyebrow: 'Query comparison in progress',
      title: 'Scoring the target query.',
      description: 'Comparing direct-answer quality against the baseline.',
    }
  }

  if (hasQueryResults) {
    return {
      eyebrow: 'Decision-ready readout',
      title: 'The page is scored and ready for fixes.',
      description: 'Use the gap, verdicts, and chat to decide what to rewrite first.',
    }
  }

  return {
    eyebrow: 'Baseline ready',
    title: 'Baseline ready. Add the query.',
    description: 'Run one exact question to see whether the answer lands fast enough.',
  }
}

function getNextMove({ hasFetched, hasBaseline, hasQueryResults, contentAnalyzing, queryAnalyzing, query }) {
  if (!hasFetched && !contentAnalyzing) {
    return 'Fetch a live URL.'
  }

  if (contentAnalyzing) {
    return 'Wait for the baseline to finish.'
  }

  if (!query.trim()) {
    return 'Add the exact question you want to score.'
  }

  if (queryAnalyzing) {
    return 'Wait for the query comparison to finish.'
  }

  if (hasQueryResults) {
    return 'Review the biggest gap, then rewrite the weakest section.'
  }

  if (hasBaseline) {
    return 'Run the query score next.'
  }

  return 'Fetch the page to begin.'
}

function getSignalTone(isPositive, isReady) {
  if (!isReady) return 'idle'
  return isPositive ? 'good' : 'muted'
}

function formatSnapshotUrl(rawUrl) {
  if (!rawUrl) return '--'

  try {
    const parsed = new URL(rawUrl)
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname
    return `${parsed.hostname}${pathname}`
  } catch {
    return rawUrl.replace(/^https?:\/\//, '')
  }
}

export default function App() {
  const [url, setUrl] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [charCount, setCharCount] = useState(0)
  const [sourceSignals, setSourceSignals] = useState({})
  const [query, setQuery] = useState('')
  const [baselineResults, setBaselineResults] = useState(null)
  const [results, setResults] = useState(null)
  const [contentAnalyzing, setContentAnalyzing] = useState(false)
  const [queryAnalyzing, setQueryAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const handleBaselineAnalyze = useCallback(async (nextMarkdown, nextSourceSignals = {}) => {
    setContentAnalyzing(true)
    setError('')
    try {
      const res = await fetch('/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: nextMarkdown, sourceSignals: nextSourceSignals })
      })
      if (!res.ok) {
        throw new Error(await readApiError(res, `Analyze error: ${res.status}`))
      }
      const data = await res.json()
      setBaselineResults(mergeResultsWithBaseline(data, null))
    } catch (e) {
      setError(e.message)
    } finally {
      setContentAnalyzing(false)
    }
  }, [])

  const handleFetchComplete = useCallback((nextMarkdown, nextCharCount, nextSourceSignals = {}) => {
    setMarkdown(nextMarkdown)
    setCharCount(nextCharCount)
    setSourceSignals(nextSourceSignals)
    setQuery('')
    setBaselineResults(null)
    setResults(null)
    void handleBaselineAnalyze(nextMarkdown, nextSourceSignals)
  }, [handleBaselineAnalyze])

  const handleAnalyze = useCallback(async () => {
    if (!markdown) return

    setQueryAnalyzing(true)
    setError('')

    try {
      const res = await fetch('/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown,
          query: query.trim() || undefined,
          sourceSignals,
          baselineLlmContentScore: baselineResults?.llmContentScore ?? null,
        })
      })

      if (!res.ok) {
        throw new Error(await readApiError(res, `Analyze error: ${res.status}`))
      }

      const data = await res.json()
      setResults(mergeResultsWithBaseline(data, baselineResults))
    } catch (e) {
      setError(e.message)
    } finally {
      setQueryAnalyzing(false)
    }
  }, [baselineResults, markdown, query, sourceSignals])

  const hasBaseline = !!baselineResults
  const hasFetched = !!markdown
  const hasQueryResults = !!results
  const activeResults = results || baselineResults

  const showBaseline = hasFetched || contentAnalyzing
  const showQueryInput = hasFetched
  const showQueryResults = hasQueryResults

  const fetchStatus = hasFetched
    ? 'done'
    : contentAnalyzing
      ? 'active'
      : 'idle'
  const baselineStatus = hasQueryResults
    ? 'done'
    : hasBaseline
      ? 'active'
      : hasFetched || contentAnalyzing
        ? 'active'
        : 'idle'
  const resultsStatus = hasQueryResults
    ? 'done'
    : queryAnalyzing
      ? 'active'
      : 'idle'

  const chatStage = results?.verdicts?.length
    ? 'post-verdict'
    : query.trim()
      ? 'post-query'
      : 'post-fetch'

  const heroContent = getHeroContent({ hasFetched, hasQueryResults, contentAnalyzing, queryAnalyzing })
  const nextMove = getNextMove({
    hasFetched,
    hasBaseline,
    hasQueryResults,
    contentAnalyzing,
    queryAnalyzing,
    query,
  })

  const heroStats = [
    {
      label: hasFetched ? 'Captured' : 'Fetch mode',
      value: hasFetched ? `${Math.max(1, Math.round(charCount / 1000))}k` : 'SSE',
      detail: hasFetched ? `${charCount.toLocaleString()} chars normalized.` : 'Live markdown into the UI.',
    },
    {
      label: hasBaseline ? 'Baseline' : 'Scoring layers',
      value: hasBaseline ? `${activeResults?.overallScore ?? '--'}` : '4',
      detail: hasBaseline ? 'Combined page score.' : 'Content, GEU, LLM, query.',
    },
    {
      label: hasQueryResults ? 'Current gap' : 'Model coverage',
      value: hasQueryResults && typeof results?.gapScore === 'number'
        ? `${results.gapScore >= 0 ? '+' : ''}${results.gapScore}`
        : '2',
      detail: hasQueryResults ? 'Content minus query.' : 'Llama + Nemotron.',
    },
  ]

  const sourceSignalCards = [
    {
      label: 'llms.txt',
      value: sourceSignals?.llmsTxt?.present ? 'Present' : hasFetched ? 'Missing' : 'Pending',
      detail: sourceSignals?.llmsTxt?.present
        ? sourceSignals.llmsTxt.url
        : 'No file found.',
      tone: getSignalTone(sourceSignals?.llmsTxt?.present, hasFetched),
    },
    {
      label: 'llms-full.txt',
      value: sourceSignals?.llmsFullTxt?.present ? 'Present' : hasFetched ? 'Missing' : 'Pending',
      detail: sourceSignals?.llmsFullTxt?.present
        ? sourceSignals.llmsFullTxt.url
        : 'No file found.',
      tone: getSignalTone(sourceSignals?.llmsFullTxt?.present, hasFetched),
    },
    {
      label: 'Page state',
      value: hasQueryResults ? 'Scored' : hasBaseline ? 'Baseline ready' : hasFetched ? 'Fetched' : 'Idle',
      detail: !hasFetched
        ? 'Waiting for URL.'
        : hasQueryResults
          ? 'Ready for fixes.'
          : hasBaseline
            ? 'Ready for query.'
            : 'Analyzing page.',
      tone: hasQueryResults || hasBaseline ? 'good' : hasFetched ? 'muted' : 'idle',
    },
  ]

  const snapshotItems = [
    {
      label: 'URL',
      value: formatSnapshotUrl(url),
      note: url ? 'Current page' : 'No page yet',
      emphasis: 'url',
    },
    {
      label: 'Overall',
      value: activeResults?.overallScore ?? '--',
      note: activeResults ? 'Blended score' : 'Fetch a page first',
    },
    {
      label: 'Query',
      value: results?.queryScore ?? '--',
      note: query.trim() ? query.trim() : 'Add a query',
    },
    {
      label: 'Gap',
      value: typeof results?.gapScore === 'number'
        ? `${results.gapScore >= 0 ? '+' : ''}${results.gapScore}`
        : '--',
      note: results?.gapScore != null ? 'Content minus query' : 'Available after query',
    },
  ]

  return (
    <div className="app">
      <div className="sr-only" role="status" aria-live="polite">
        {contentAnalyzing
          ? 'Analyzing baseline content signals...'
          : queryAnalyzing
            ? 'Re-scoring against target query...'
            : ''}
      </div>

      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-mark" aria-hidden="true">
            <div className="topbar-mark-core" />
          </div>
          <div className="topbar-brand-copy">
            <span className="topbar-name">AEO Scorer</span>
            <span className="topbar-tagline">Pre-publish answer engine review</span>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="theme-toggle" role="group" aria-label="Color theme">
            <button
              type="button"
              className={`theme-btn${theme === 'light' ? ' active' : ''}`}
              onClick={() => setTheme('light')}
            >Light</button>
            <button
              type="button"
              className={`theme-btn${theme === 'dark' ? ' active' : ''}`}
              onClick={() => setTheme('dark')}
            >Dark</button>
          </div>
        </div>
      </header>

      <main className="main">
        <section className="hero-shell">
          <div className="panel panel-hero">
            <div className="hero-eyebrow">{heroContent.eyebrow}</div>
            <h1>{heroContent.title}</h1>
            <p className="hero-copy-text">{heroContent.description}</p>

            <div className="hero-stat-grid">
              {heroStats.map(stat => (
                <div key={stat.label} className="hero-stat-card">
                  <span className="hero-stat-label">{stat.label}</span>
                  <strong className="hero-stat-value">{stat.value}</strong>
                  <span className="hero-stat-detail">{stat.detail}</span>
                </div>
              ))}
            </div>

            <div className="hero-guidance">
              <span className="hero-guidance-label">Next move</span>
              <p>{nextMove}</p>
            </div>
          </div>
        </section>

        <section className="overview-grid">
          <div className="panel overview-card overview-card-snapshot" style={{ animationDelay: '0.02s' }}>
            <div className="rail-card-header">
              <div>
                <div className="rail-card-title">Analysis snapshot</div>
                <div className="rail-card-subtitle">Page, score, query, and gap.</div>
              </div>
            </div>

            <div className="snapshot-grid">
              {snapshotItems.map(item => (
                <div
                  key={item.label}
                  className={`snapshot-item${item.emphasis ? ` snapshot-item--${item.emphasis}` : ''}`}
                >
                  <span className="snapshot-label">{item.label}</span>
                  <strong className={`snapshot-value${item.emphasis ? ` snapshot-value--${item.emphasis}` : ''}`}>
                    {item.value}
                  </strong>
                  <span className="snapshot-note">{item.note}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel overview-card overview-card-tracker" style={{ animationDelay: '0.04s' }}>
            <div className="rail-card-header">
              <div>
                <div className="rail-card-title">Progress</div>
                <div className="rail-card-subtitle">Small tracker for the current flow.</div>
              </div>
              <span className={`summary-pill ${hasFetched ? 'ok' : 'warn'}`}>
                {hasQueryResults ? 'Verdicts ready' : hasBaseline ? 'Baseline ready' : hasFetched ? 'Fetched' : 'Waiting'}
              </span>
            </div>

            <JourneyBar
              fetchStatus={fetchStatus}
              queryStatus={baselineStatus}
              resultsStatus={resultsStatus}
            />
          </div>

          <div className="panel overview-card overview-card-signals" style={{ animationDelay: '0.06s' }}>
            <div className="rail-card-header">
              <div>
                <div className="rail-card-title">Source signals</div>
                <div className="rail-card-subtitle">llms.txt and page state.</div>
              </div>
            </div>
            <div className="signal-stack">
              {sourceSignalCards.map(signal => (
                <div key={signal.label} className={`signal-card ${signal.tone}`}>
                  <div className="signal-card-top">
                    <span className="signal-card-label">{signal.label}</span>
                    <span className="signal-card-value">{signal.value}</span>
                  </div>
                  <div className="signal-card-detail">{signal.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="analysis-stack">
          <div className="section panel section-fetch" style={{ animationDelay: '0.06s' }}>
            <div className="section-head">
              <div>
                <div className="section-kicker">Phase 01 / Fetch the live page</div>
                <div className="section-title">Start with the source your users will actually land on</div>
              </div>
              <div className="section-note">Live page to markdown.</div>
            </div>
            <UrlInput
              url={url}
              onUrlChange={setUrl}
              onFetchComplete={handleFetchComplete}
            />
          </div>

          {showBaseline && (
            <div className="section panel section-baseline" style={{ animationDelay: '0.12s' }}>
              <div className="section-head">
                <div>
                  <div className="section-kicker">Phase 02 / Baseline score</div>
                  <div className="section-title">Read the page before you optimize the answer</div>
                </div>
              <div className="section-note">Structural score before query.</div>
              </div>
              <ScoreDisplay
                results={activeResults}
                loading={contentAnalyzing}
                error={!activeResults ? error : ''}
                onRetry={hasFetched ? () => void handleBaselineAnalyze(markdown, sourceSignals) : null}
              />
            </div>
          )}

          {showQueryInput && (
            <div className="section panel section-query-input" style={{ animationDelay: '0.16s' }}>
              <div className="section-head">
                <div>
                  <div className="section-kicker">Phase 03 / Target query</div>
                  <div className="section-title">Stress-test the exact question the page needs to answer</div>
                </div>
                <div className="section-note">Score one exact question.</div>
              </div>

              <div className="query-helper">
                Add the exact question to unlock Query Match, Gap, and verdicts.
              </div>

              <input
                className="query-input"
                placeholder="e.g. what is the best CRM for small business?"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
              />

              <div className="query-actions">
                <button
                  className={`btn-send btn-rescore${queryAnalyzing ? ' loading' : ''}`}
                  onClick={handleAnalyze}
                  disabled={queryAnalyzing || !query.trim() || !hasBaseline}
                >
                  {queryAnalyzing
                    ? <><span className="spinner" /> Analyzing...</>
                    : 'Re-Score with Query'}
                </button>
                <span className="query-last-scored">
                  {results
                    ? <>Last scored against: <em>{query || '(no query)'}</em></>
                    : !hasBaseline
                      ? 'Baseline running.'
                      : 'Baseline ready for query scoring.'}
                </span>
              </div>
              {error && <div className="error-bar">{error}</div>}
            </div>
          )}

          {showQueryResults && (
            <div className="section panel section-query-results" style={{ animationDelay: '0.2s' }}>
              <div className="section-head">
                <div>
                  <div className="section-kicker">Phase 04 / Query results</div>
                  <div className="section-title">See how well the page answers the question, not just whether it looks complete</div>
                </div>
                <div className="section-note">See what to fix first.</div>
              </div>

              <Verdicts
                verdicts={results.verdicts}
                queryScore={results.queryScore}
                contentScore={results.contentScore}
                gapScore={results.gapScore}
                modelStatus={results.modelStatus || []}
              />
            </div>
          )}
        </section>
      </main>

      {markdown && (
        <section className="ask-expert-section">
          <div className="ask-expert-inner">
            <div className="ask-expert-header">
              <div>
                <div className="ask-expert-kicker">Ask The Expert</div>
                <h2 className="ask-expert-heading">Turn the analysis into a cleaner rewrite plan.</h2>
                <p className="ask-expert-text">
                  Use the page context and model toggle to draft the next rewrite.
                </p>
              </div>
              <div className="ask-expert-summary">
                <span className="summary-pill ok">Context loaded</span>
                {query.trim() && <span className="summary-pill warn">Query in focus</span>}
              </div>
            </div>

            <Chat markdown={markdown} stage={chatStage} query={query.trim()} />
          </div>
        </section>
      )}
    </div>
  )
}
