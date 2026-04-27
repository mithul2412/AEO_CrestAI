import { useCallback, useEffect, useRef, useState } from 'react'
import UrlInput from './components/UrlInput.jsx'
import ScoreDisplay from './components/ScoreDisplay.jsx'
import Verdicts from './components/Verdicts.jsx'
import Chat from './components/Chat.jsx'
import IntelligencePanel from './components/IntelligencePanel.jsx'
import WanderingEyes from './components/WanderingEyes.jsx'
import CrestLogo from './components/CrestLogo.jsx'
import { readApiError } from './utils/api.js'

const THEME_KEY = 'aeo-scorer-theme'
const LLMS_TXT_POINTS = 10

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light'
  return window.localStorage.getItem(THEME_KEY) || 'light'
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

function StatusBar({ fetchStatus, baselineStatus, resultsStatus, overallScore, gapScore, barRef }) {
  const steps = [
    { label: 'Fetch', status: fetchStatus, n: '1' },
    { label: 'Baseline', status: baselineStatus, n: '2' },
    { label: 'Verdicts', status: resultsStatus, n: '3' },
  ]

  return (
    <div ref={barRef} className="status-bar" aria-label="Analysis progress">
      <div className="status-track">
        {steps.map((step, index) => (
          <div key={step.label} className="status-track-segment">
            <div className={`status-node status-node--${step.status}`}>
              <div className="status-node-circle">
                {step.status === 'done' ? '✓' : step.n}
              </div>
              <span className="status-node-label">{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <div className={`status-connector${step.status === 'done' ? ' filled' : ''}`} />
            )}
          </div>
        ))}
      </div>
      {(overallScore != null || gapScore != null) && (
        <div className="status-metrics">
          {overallScore != null && (
            <span className="status-metric">Score <strong>{overallScore}</strong></span>
          )}
          {gapScore != null && (
            <span className="status-metric">Gap <strong>{gapScore >= 0 ? '+' : ''}{gapScore}</strong></span>
          )}
        </div>
      )}
    </div>
  )
}


function formatBrand(rawUrl) {
  if (!rawUrl) return 'this page'

  try {
    const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
    const hostname = new URL(normalizedUrl).hostname.replace(/^www\./, '')
    const base = hostname.split('.')[0] || hostname
    return base.charAt(0).toUpperCase() + base.slice(1)
  } catch {
    return 'this page'
  }
}

function buildQuerySuggestions(rawUrl) {
  const brand = formatBrand(rawUrl)
  return [
    `What is ${brand} pricing?`,
    `How does ${brand} compare to competitors?`,
    `What are the main ${brand} plans?`,
  ]
}

function buildLlmsTemplate(rawUrl) {
  const siteUrl = rawUrl || 'https://example.com/'
  return `# llms.txt\nsite: ${siteUrl}\nsummary: Add a one-sentence summary of what this page or site is for.\npreferred:\n- ${siteUrl}\n- ${siteUrl.replace(/\/?$/, '/pricing')}\npolicies:\n- cite current pricing only\n- prefer answer-first sections\n- use page headings as section labels`
}

function buildLlmsFullTemplate(rawUrl) {
  const siteUrl = rawUrl || 'https://example.com/'
  return `# llms-full.txt\nsite: ${siteUrl}\nsummary: Add a richer overview of the site, products, and audience.\nkey_pages:\n- ${siteUrl}\n- ${siteUrl.replace(/\/?$/, '/faq')}\nstructured_sections:\n- pricing\n- plans\n- eligibility\n- support\ncitation_rules:\n- quote official pricing pages\n- prefer FAQ and support docs for policy answers`
}

function buildSchemaGuide(rawUrl) {
  const siteUrl = rawUrl || 'https://example.com/'
  return `Use JSON-LD on the page so answer engines can read page intent faster.\n\nExample:\n{\n  "@context": "https://schema.org",\n  "@type": "WebPage",\n  "name": "Page title",\n  "url": "${siteUrl}",\n  "description": "One-sentence page summary",\n  "mainEntity": {\n    "@type": "Thing",\n    "name": "Primary answer topic"\n  }\n}`
}

function buildAdvancedOptimizations({ checks = [], sourceSignals = {}, url, hasFetched }) {
  const opportunities = []
  const schemaCheck = checks.find(check => check.id === 'schema')
  const llmsCheck = checks.find(check => check.id === 'llmstxt')

  if (schemaCheck && !schemaCheck.passed) {
    opportunities.push({
      id: 'schema',
      label: 'Structured data / schema',
      headline: `Unlock +${schemaCheck.weight} pts - Add structured data`,
      detail: 'Add JSON-LD so engines can identify the page, entity, and answer target faster.',
      points: schemaCheck.weight,
      actionLabel: 'Learn what this is',
      drawerTitle: 'Structured data / schema',
      drawerIntro: 'Use schema markup to make the page easier to classify and reuse.',
      drawerContent: buildSchemaGuide(url),
      drawerMode: 'guide',
    })
  }

  if (hasFetched && !sourceSignals?.llmsTxt?.present) {
    opportunities.push({
      id: 'llms.txt',
      label: 'llms.txt',
      headline: `Unlock +${llmsCheck?.weight || LLMS_TXT_POINTS} pts - Add llms.txt`,
      detail: 'Create a machine-readable summary so answer engines know which pages to prefer.',
      points: llmsCheck?.weight || LLMS_TXT_POINTS,
      actionLabel: 'See template',
      drawerTitle: 'llms.txt starter template',
      drawerIntro: 'Use this as a starter file and adapt the summary, preferred pages, and rules.',
      drawerContent: buildLlmsTemplate(url),
      drawerMode: 'template',
    })
  }

  if (hasFetched && !sourceSignals?.llmsFullTxt?.present) {
    opportunities.push({
      id: 'llms-full.txt',
      label: 'llms-full.txt',
      headline: 'Add richer model-readable context with llms-full.txt',
      detail: 'Use a fuller file when the site needs more structured instructions than the base file.',
      points: 0,
      actionLabel: 'See template',
      drawerTitle: 'llms-full.txt starter template',
      drawerIntro: 'Use this when you want to expose a fuller map of the site to AI systems.',
      drawerContent: buildLlmsFullTemplate(url),
      drawerMode: 'template',
    })
  }

  const points = opportunities.reduce((sum, opportunity) => sum + opportunity.points, 0)
  return { opportunities, points }
}

function buildChatDraft(query, verdict) {
  return [
    `Goal: improve the page for the query "${query || '<target query>'}"`,
    verdict.topGap ? `Top gap: ${verdict.topGap}` : '',
    verdict.suggestedFix ? `Suggested fix: ${verdict.suggestedFix}` : '',
    verdict.verdict ? `Model verdict: ${verdict.verdict}` : '',
    'Format: issues + rewrite + expected score impact',
  ].filter(Boolean).join('\n')
}

export default function App() {
  const [url, setUrl] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [normalizedUrl, setNormalizedUrl] = useState('')
  const [charCount, setCharCount] = useState(0)
  const [sourceSignals, setSourceSignals] = useState({})
  const [pageIntelligence, setPageIntelligence] = useState(null)
  const [query, setQuery] = useState('')
  const [baselineResults, setBaselineResults] = useState(null)
  const [results, setResults] = useState(null)
  const [contentAnalyzing, setContentAnalyzing] = useState(false)
  const [queryAnalyzing, setQueryAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState(getInitialTheme)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [drawer, setDrawer] = useState(null)
  const [chatDraft, setChatDraft] = useState({ text: '', token: 0 })
  const [activeMode, setActiveMode] = useState('score')
  const queryInputRef = useRef(null)
  const topbarRef = useRef(null)
  const statusBarRef = useRef(null)
  const lastScrollY = useRef(0)

  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY
      const scrollingDown = y > lastScrollY.current
      lastScrollY.current = y

      if (topbarRef.current) {
        const hidden = y > 60
        topbarRef.current.style.opacity = hidden ? '0' : '1'
        topbarRef.current.style.transform = hidden ? 'translateY(-100%)' : 'translateY(0)'
        topbarRef.current.style.pointerEvents = hidden ? 'none' : ''
      }

      if (statusBarRef.current) {
        const hide = scrollingDown && y > 80
        statusBarRef.current.style.transform = hide ? 'translateY(-110%)' : 'translateY(0)'
        statusBarRef.current.style.opacity = hide ? '0' : '1'
        statusBarRef.current.style.pointerEvents = hide ? 'none' : ''
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const handleBaselineAnalyze = useCallback(async (nextMarkdown, nextSourceSignals = {}, nextPageIntelligence = null) => {
    setContentAnalyzing(true)
    setError('')
    try {
      const res = await fetch('/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown: nextMarkdown,
          sourceSignals: nextSourceSignals,
          pageIntelligence: nextPageIntelligence || {},
        })
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

  const handleFetchComplete = useCallback((nextMarkdown, nextCharCount, nextSourceSignals = {}, nextPageIntelligence = null, nextNormalizedUrl = '') => {
    setMarkdown(nextMarkdown)
    setNormalizedUrl(nextNormalizedUrl || nextSourceSignals?.sourceUrl || url)
    setCharCount(nextCharCount)
    setSourceSignals(nextSourceSignals)
    setPageIntelligence(nextPageIntelligence)
    setQuery('')
    setBaselineResults(null)
    setResults(null)
    setDrawer(null)
    setActiveMode('score')
    void handleBaselineAnalyze(nextMarkdown, nextSourceSignals, nextPageIntelligence)
  }, [handleBaselineAnalyze, url])

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
          sourceUrl: normalizedUrl,
          sourceSignals,
          baselineLlmContentScore: baselineResults?.llmContentScore ?? null,
          pageIntelligence: pageIntelligence || {},
        })
      })

      if (!res.ok) {
        throw new Error(await readApiError(res, `Analyze error: ${res.status}`))
      }

      const data = await res.json()
      setResults(mergeResultsWithBaseline(data, baselineResults))
      setActiveMode('intelligence')
    } catch (e) {
      setError(e.message)
    } finally {
      setQueryAnalyzing(false)
    }
  }, [baselineResults, markdown, normalizedUrl, pageIntelligence, query, sourceSignals])

  const hasBaseline = !!baselineResults
  const hasFetched = !!markdown
  const hasQueryResults = !!results
  const activeResults = results || baselineResults

  const showBaseline = hasFetched || contentAnalyzing
  const showQueryInput = hasFetched
  const showQueryResults = hasQueryResults
  const isFocusGate = !hasFetched && !contentAnalyzing
  const isBaselineGate = hasFetched && !hasQueryResults
  const isDiagnosticGate = hasQueryResults
  const gateClass = isFocusGate ? 'app--focus-gate' : isDiagnosticGate ? 'app--diagnostic-gate' : 'app--baseline-gate'

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

  const querySuggestions = buildQuerySuggestions(url)
  const { opportunities, points: opportunityPoints } = buildAdvancedOptimizations({
    checks: activeResults?.checks || [],
    sourceSignals,
    url,
    hasFetched,
  })
  const opportunitySummary = opportunities.length === 0
    ? 'No opportunities'
    : `${opportunities.length} opportunit${opportunities.length === 1 ? 'y' : 'ies'} - +${opportunityPoints} pts potential`

  const handleSendToChat = useCallback((verdict) => {
    const draft = buildChatDraft(query.trim(), verdict)
    setChatDraft({ text: draft, token: Date.now() })
    document.getElementById('ask-expert')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [query])

  const focusQueryInput = useCallback(() => {
    queryInputRef.current?.focus()
  }, [])

  const handleCopyDrawer = useCallback(() => {
    if (!drawer?.drawerContent) return
    navigator.clipboard?.writeText(drawer.drawerContent)
  }, [drawer])

  return (
    <div className={`app ${gateClass}`}>
      <div className="sr-only" role="status" aria-live="polite">
        {contentAnalyzing
          ? 'Analyzing baseline content signals...'
          : queryAnalyzing
            ? 'Re-scoring against target query...'
            : ''}
      </div>

      <header ref={topbarRef} className="topbar">
        <div className="topbar-brand">
          <CrestLogo size="small" />
        </div>
        <div className="topbar-actions">
          <div className="mode-toggle" role="group" aria-label="Workspace mode">
            <button
              type="button"
              className={`mode-btn${activeMode === 'score' ? ' active' : ''}`}
              onClick={() => setActiveMode('score')}
            >Score</button>
            <button
              type="button"
              className={`mode-btn${activeMode === 'intelligence' ? ' active' : ''}`}
              onClick={() => setActiveMode('intelligence')}
            >Intelligence</button>
          </div>
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

      {!isFocusGate && (
        <StatusBar
          fetchStatus={fetchStatus}
          baselineStatus={baselineStatus}
          resultsStatus={resultsStatus}
          overallScore={activeResults?.overallScore ?? null}
          gapScore={typeof results?.gapScore === 'number' ? results.gapScore : null}
          barRef={statusBarRef}
        />
      )}

      <main className={`main ${isFocusGate ? 'main--focus' : ''}`}>
        <section className={`analysis-stack ${isFocusGate ? 'analysis-stack--focus' : ''}`}>
          <div className={`section panel section-fetch ${isFocusGate ? 'section-fetch--focus' : 'section-fetch--locked'}`} style={{ animationDelay: '0.06s' }}>
            <div className="section-fetch-layout">
              <div className="section-fetch-heading">
                {isFocusGate && <CrestLogo size="hero" />}
                <div className="section-kicker">Gate 01 / Fetch the live page</div>
                <h1 className="section-title">
                  {isFocusGate ? 'Test AI Citation Readiness' : 'Source page locked for diagnosis'}
                </h1>
                <p className="gate-copy">
                  {isFocusGate
                    ? 'Paste a live page URL. Crest.ai will read the AI-visible markdown, check crawler access, and prepare the page for query diagnosis.'
                    : normalizedUrl || url}
                </p>
              </div>
              <div className="section-fetch-input">
                <UrlInput
                  url={url}
                  onUrlChange={setUrl}
                  onFetchComplete={handleFetchComplete}
                />
              </div>
            </div>
          </div>

          {activeMode === 'score' && showBaseline && (
            <div className="section panel section-baseline" style={{ animationDelay: '0.12s' }}>
              <div className="section-head">
                <div>
                  <div className="section-kicker">Gate 02 / Baseline waiting room</div>
                  <div className="section-title">Read the page before you optimize the answer</div>
                </div>
              </div>
              <ScoreDisplay
                results={activeResults}
                loading={contentAnalyzing}
                error={!activeResults ? error : ''}
                onRetry={hasFetched ? () => void handleBaselineAnalyze(markdown, sourceSignals, pageIntelligence) : null}
              />
            </div>
          )}

          {activeMode === 'score' && hasBaseline && (
            <div className="section panel section-optimizations" style={{ animationDelay: '0.14s' }}>
              <div className="section-head">
                <div>
                  <div className="section-kicker">Technical wins</div>
                  <div className="section-title">Quick fixes that don't need a rewrite</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className={`summary-pill ${opportunities.length > 0 ? 'warn' : 'ok'}`}>{opportunitySummary}</span>
                  <button
                    type="button"
                    className="chip"
                    aria-label={advancedOpen ? 'Hide optimizations' : 'Show optimizations'}
                    aria-expanded={advancedOpen}
                    onClick={() => setAdvancedOpen(v => !v)}
                  >
                    {advancedOpen ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {advancedOpen && (
                <div className="optimization-accordion-body">
                  <div className="signal-stack">
                    {opportunities.length > 0 ? opportunities.map(opportunity => (
                      <div key={opportunity.id} className="signal-card opportunity">
                        <div className="signal-card-top">
                          <span className="signal-card-label">{opportunity.label}</span>
                          <span className="signal-card-value">
                            {opportunity.points > 0 ? `+${opportunity.points} pts` : 'Info'}
                          </span>
                        </div>
                        <div className="signal-card-opportunity">{opportunity.headline}</div>
                        <div className="signal-card-detail">{opportunity.detail}</div>
                        <button type="button" className="chip" onClick={() => setDrawer(opportunity)}>
                          {opportunity.actionLabel}
                        </button>
                      </div>
                    )) : (
                      <div className="signal-card good">
                        <div className="signal-card-top">
                          <span className="signal-card-label">State</span>
                          <span className="signal-card-value">Clear</span>
                        </div>
                        <div className="signal-card-detail">No high-signal technical opportunities are open right now.</div>
                      </div>
                    )}
                  </div>

                  {drawer && (
                    <div className="template-drawer" aria-labelledby={`template-drawer-${drawer.id}`}>
                      <div className="template-drawer-head">
                        <div>
                          <div id={`template-drawer-${drawer.id}`} className="details-heading">{drawer.drawerTitle}</div>
                          <div className="details-subheading">{drawer.drawerIntro}</div>
                        </div>
                        <button type="button" className="chip" onClick={() => setDrawer(null)}>Close</button>
                      </div>
                      <pre className="template-drawer-code">{drawer.drawerContent}</pre>
                      <div className="template-drawer-actions">
                        {drawer.drawerMode === 'template' && (
                          <button type="button" className="chip chip-primary" onClick={handleCopyDrawer}>
                            Copy template
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {showQueryInput && (
            <div className={`section panel section-query-input ${isBaselineGate ? 'section-query-input--unlock' : ''}`} style={{ animationDelay: '0.16s' }}>
              <div className="section-fetch-layout">
                <div className="section-fetch-heading">
                  <div className="section-kicker">{isDiagnosticGate ? 'Gate 03 / Query in focus' : 'Gate 03 / Unlock Intelligence'}</div>
                  <div className="section-title">
                    {isDiagnosticGate ? 'The diagnostic engine is ready' : 'Run a target query to open the answer path'}
                  </div>
                  <div className="query-helper">
                    {isDiagnosticGate
                      ? 'Refine the question and re-score when you want to test another retrieval path.'
                      : 'Baseline complete. To analyze retrieval, extraction, and competitor gaps, run a target query.'}
                  </div>
                </div>

                <div className="section-fetch-input">
                  <div className={`query-input-shell${!query.trim() ? ' query-input-shell--primed' : ''}`}>
                    <input
                      ref={queryInputRef}
                      className="query-input query-input-prominent"
                      placeholder="e.g. what is the best CRM for small business?"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                    />
                  </div>

                  <div className="query-suggestion-row">
                    {querySuggestions.map(suggestion => (
                      <button
                        key={suggestion}
                        type="button"
                        className="chip query-suggestion-chip"
                        onClick={() => setQuery(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>

                  <div className="query-actions">
                    <button
                      className={`btn-send btn-rescore${queryAnalyzing ? ' loading' : ''}`}
                      onClick={handleAnalyze}
                      disabled={queryAnalyzing || !query.trim() || !hasFetched}
                    >
                      {queryAnalyzing
                        ? <><WanderingEyes className="wandering-eyes-button" title="Analyzing target query" /> Analyzing...</>
                        : 'Re-Score with Query'}
                    </button>
                  </div>
                </div>
              </div>

              {!query.trim() && hasBaseline && !hasQueryResults && (
                <div className="query-locked-preview">
                  <div className="query-locked-card">
                    <span className="query-locked-label">Query Match</span>
                    <strong className="query-locked-value">Locked</strong>
                    <span className="query-locked-copy">Add a query to preview direct answer quality.</span>
                  </div>
                  <div className="query-locked-card">
                    <span className="query-locked-label">Model verdicts</span>
                    <strong className="query-locked-value">Locked</strong>
                    <span className="query-locked-copy">Unlock side-by-side fixes from both models.</span>
                  </div>
                  <div className="query-locked-card query-locked-card--action">
                    <span className="query-locked-label">Unlock</span>
                    <strong className="query-locked-value">Next step</strong>
                    <span className="query-locked-copy">Run one exact query to activate answer-path scoring and verdicts.</span>
                    <button type="button" className="chip chip-primary" onClick={focusQueryInput}>
                      Add a query to unlock
                    </button>
                  </div>
                </div>
              )}

              {error && <div className="error-bar">{error}</div>}
            </div>
          )}

          {activeMode === 'intelligence' && hasFetched && !hasQueryResults && (
            <div className="section panel intelligence-gate-hold" style={{ animationDelay: '0.18s' }}>
              <div>
                <div className="section-kicker">Intelligence locked</div>
                <div className="section-title">Run a target query to open the diagnostic timeline</div>
                <p className="gate-copy">Access and extraction have been collected. Retrieval, answer extraction, competitor gap, and the highest-impact fix unlock after query scoring.</p>
              </div>
              <button type="button" className="chip chip-primary" onClick={focusQueryInput}>
                Add query
              </button>
            </div>
          )}

          {activeMode === 'intelligence' && (!hasFetched || hasQueryResults) && (
            <IntelligencePanel
              markdown={markdown}
              pageIntelligence={pageIntelligence}
              results={results || baselineResults}
              query={query.trim()}
              queryAnalyzing={queryAnalyzing}
            />
          )}

          {activeMode === 'score' && showQueryResults && (
            <div className="section panel section-query-results" style={{ animationDelay: '0.2s' }}>
              <div className="section-head">
                <div>
                  <div className="section-kicker">Phase 04 / Query results</div>
                  <div className="section-title">See how well the page answers the question, not just whether it looks complete</div>
                </div>
              </div>

              <Verdicts
                verdicts={results.verdicts}
                queryScore={results.queryScore}
                contentScore={results.contentScore}
                gapScore={results.gapScore}
                modelStatus={results.modelStatus || []}
                onSendToChat={handleSendToChat}
              />
            </div>
          )}
        </section>
      </main>

      {markdown && (
        <section id="ask-expert" className="ask-expert-section">
          <div className="ask-expert-inner">
            <div className="ask-expert-header">
              <div className="ask-expert-kicker">Ask The Expert</div>
              <h2 className="ask-expert-heading">Turn the analysis into a cleaner rewrite plan.</h2>
              <div className="ask-expert-summary">
                <span className="summary-pill ok">Context loaded</span>
                {query.trim() && <span className="summary-pill warn">Query in focus</span>}
              </div>
            </div>

            <Chat
              markdown={markdown}
              stage={chatStage}
              query={query.trim()}
              draft={chatDraft.text}
              draftToken={chatDraft.token}
            />
          </div>
        </section>
      )}
    </div>
  )
}
