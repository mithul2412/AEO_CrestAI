import { useCallback, useEffect, useRef, useState } from 'react'
import UrlInput from './components/UrlInput.jsx'
import ScoreDisplay from './components/ScoreDisplay.jsx'
import Chat from './components/Chat.jsx'
import IntelligencePanel from './components/IntelligencePanel.jsx'
import DiagnosticBrief from './components/DiagnosticBrief.jsx'
import WanderingEyes from './components/WanderingEyes.jsx'
import CrestLogo from './components/CrestLogo.jsx'
import { readApiError } from './utils/api.js'

const THEME_KEY = 'aeo-scorer-theme'
const LLMS_TXT_POINTS = 10
const API_BASE = '/api/v1'

async function runAnalyzeSse(payload) {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    throw new Error(await readApiError(res, `Analyze error: ${res.status}`))
  }

  const reader = res.body?.getReader()
  if (!reader) {
    throw new Error('Analyze response did not include a readable stream.')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() || ''

    for (const eventText of events) {
      const eventType = eventText.split('\n').find(line => line.startsWith('event: '))?.slice(7).trim()
      const dataLine = eventText.split('\n').find(line => line.startsWith('data: '))
      if (!eventType || !dataLine) continue
      const data = JSON.parse(dataLine.slice(6))
      if (eventType === 'error') {
        throw new Error(data.label || 'Analysis failed')
      }
      if (eventType === 'result') {
        return data.result
      }
    }
  }

  throw new Error('Analysis ended before a result was returned.')
}

function toCamelChunk(chunk = {}) {
  if (!chunk) return null
  return {
    ...chunk,
    chunkId: chunk.chunkId ?? chunk.chunk_id,
    wordCount: chunk.wordCount ?? chunk.word_count,
    startWord: chunk.startWord ?? chunk.start_word,
    endWord: chunk.endWord ?? chunk.end_word,
    retrievalScore: chunk.retrievalScore ?? chunk.retrieval_score,
    directAnswer: chunk.directAnswer ?? chunk.direct_answer,
    evidenceScore: chunk.evidenceScore ?? chunk.evidence_score,
    specificityScore: chunk.specificityScore ?? chunk.specificity_score,
    selfContainedScore: chunk.selfContainedScore ?? chunk.self_contained_score,
    sourceId: chunk.sourceId ?? chunk.source_id,
    sourceUrl: chunk.sourceUrl ?? chunk.source_url,
    sourceTitle: chunk.sourceTitle ?? chunk.source_title,
  }
}

function toCamelRetrieval(retrieval = {}) {
  if (!retrieval || Object.keys(retrieval).length === 0) return null
  return {
    ...retrieval,
    retrievalScore: retrieval.retrievalScore ?? retrieval.retrieval_score ?? 0,
    usedEmbeddings: retrieval.usedEmbeddings ?? retrieval.used_embeddings,
    usedReranker: retrieval.usedReranker ?? retrieval.used_reranker,
    topChunks: (retrieval.topChunks || retrieval.top_chunks || []).map(toCamelChunk),
  }
}

function toCamelAnswer(answer = {}) {
  if (!answer || Object.keys(answer).length === 0) return null
  return {
    ...answer,
    answerScore: answer.answerScore ?? answer.answer_score ?? 0,
    directAnswerFound: answer.directAnswerFound ?? answer.direct_answer_found ?? false,
  }
}

function toCamelCompetitorPage(page = {}) {
  return {
    ...page,
    sourceId: page.sourceId ?? page.source_id,
    chunkCount: page.chunkCount ?? page.chunk_count ?? page.chunks?.length ?? 0,
    snippet: page.snippet ?? page.content_snippet ?? page.content?.slice?.(0, 220) ?? '',
    chunks: (page.chunks || []).map(toCamelChunk),
    bestRetrievedChunk: toCamelChunk(page.bestRetrievedChunk || page.best_retrieved_chunk),
  }
}

function toCamelCompetitiveGap(gap = null) {
  if (!gap) return null
  return {
    ...gap,
    userTopChunk: toCamelChunk(gap.userTopChunk),
    competitorTopChunk: toCamelChunk(gap.competitorTopChunk),
  }
}

function adaptAnalyzeResult(apiResult = {}) {
  const original = apiResult.original_aeo || {}
  const scorecard = apiResult.scorecard || {}
  const queryMatch = apiResult.query_match || {}
  const citation = apiResult.citation_intelligence || {}
  const grounding = apiResult.competitor_grounding || {}
  const optimization = apiResult.optimization_plan || {}
  const competitiveGap = toCamelCompetitiveGap(apiResult.competitive_gap || citation.competitiveGap)
  const contentScore = original.content_score ?? null
  const geuScore = original.geu_score ?? null
  const queryScore = queryMatch.query_match_score ?? null
  const llmContentScore = scorecard.overall_score ?? original.overall_baseline_score ?? null
  const modelReadouts = queryMatch.model_readouts || []
  const competitorPages = (grounding.pages || grounding.competitors || []).map(toCamelCompetitorPage)
  const retrieval = toCamelRetrieval(apiResult.retrieval || citation.retrieval)
  const answerExtraction = toCamelAnswer(citation.answerExtraction)
  const citationReadiness = citation.citationReadiness || null

  return {
    rawResult: apiResult,
    contentScore,
    geuScore,
    llmContentScore,
    llmContentModels: llmContentScore == null ? [] : [
      {
        model: 'SOTA scorecard',
        llmContentScore,
        briefReason: scorecard.score_rationale || 'Deterministic original AEO plus citation readiness.',
      },
    ],
    llmContentStatus: llmContentScore == null ? [] : [{ model: 'SOTA scorecard', status: 'ok' }],
    queryScore,
    gapScore: apiResult.gap_score ?? (
      typeof contentScore === 'number' && typeof queryScore === 'number'
        ? contentScore - queryScore
        : null
    ),
    checks: original.checks || [],
    geuChecks: original.geu_checks || [],
    verdicts: modelReadouts.map(readout => ({
      model: readout.model,
      queryMatchScore: readout.queryMatchScore,
      verdict: readout.verdict,
      topGap: readout.topGap,
      suggestedFix: readout.suggestedFix,
      failureMode: queryMatch.top_gap || competitiveGap?.failureMode || '',
    })),
    modelStatus: modelReadouts.map(readout => ({ model: readout.model, status: 'ok' })),
    intelligence: {
      chunks: (citation.chunks || []).map(toCamelChunk),
      retrieval,
      answerExtraction,
      citationReadiness,
      competitorIntelligence: {
        status: grounding.status || (competitorPages.length || competitiveGap ? 'ok' : 'insufficient_data'),
        discovery: {
          status: grounding.status || (grounding.results?.length ? 'ok' : 'insufficient_data'),
          query: apiResult.target_query,
          competitors: grounding.results || [],
          reason: grounding.reason,
        },
        competitors: competitorPages,
        failures: grounding.failures || [],
        gap: competitiveGap,
      },
      highestImpactFix: optimization.highest_impact_fix,
    },
  }
}

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
    { label: 'Fetch Page', status: fetchStatus, n: '1' },
    { label: 'Baseline', status: baselineStatus, n: '2' },
    { label: 'Query Test', status: resultsStatus, n: '3' },
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

function getExecutiveStatus({ hasFetched, hasBaseline, hasQueryResults, contentAnalyzing, queryAnalyzing, activeResults }) {
  if (queryAnalyzing) {
    return {
      label: 'Testing query',
      tone: 'active',
      detail: 'Ranking chunks, checking answer quality, and looking for competitor gaps.',
    }
  }

  if (contentAnalyzing || (hasFetched && !hasBaseline)) {
    return {
      label: 'Reading page',
      tone: 'active',
      detail: 'Crest.ai is preparing the baseline before query testing.',
    }
  }

  if (!hasFetched) {
    return {
      label: 'New test',
      tone: 'idle',
      detail: 'Fetch a live URL to start the diagnostic workflow.',
    }
  }

  if (hasQueryResults) {
    const queryScore = activeResults?.queryScore
    const gapScore = activeResults?.gapScore
    if (typeof queryScore === 'number' && queryScore >= 70 && (typeof gapScore !== 'number' || gapScore <= 12)) {
      return {
        label: 'Answer path in focus',
        tone: 'ok',
        detail: 'The page has a usable path for this target question. Review Diagnostics for evidence.',
      }
    }

    return {
      label: 'Answer path needs work',
      tone: 'warn',
      detail: 'The target question exposed a citation risk. Review Diagnostics for evidence.',
    }
  }

  const score = activeResults?.overallScore
  if (typeof score === 'number' && score >= 75) {
    return {
      label: 'Baseline ready',
      tone: 'ok',
      detail: 'The page passed the first read. Add a target query to test citation fit.',
    }
  }

  return {
    label: 'Baseline ready with risks',
    tone: 'warn',
    detail: 'The page can be scored, but the query test will show whether it can be cited.',
  }
}

function getStepChips({ hasFetched, hasBaseline, hasQueryResults, contentAnalyzing, queryAnalyzing }) {
  return [
    {
      label: hasFetched ? 'Page fetched' : contentAnalyzing ? 'Fetching page' : 'Fetch page',
      status: hasFetched ? 'done' : contentAnalyzing ? 'active' : 'idle',
    },
    {
      label: hasBaseline ? 'Baseline ready' : hasFetched || contentAnalyzing ? 'Reading baseline' : 'Baseline',
      status: hasBaseline ? 'done' : hasFetched || contentAnalyzing ? 'active' : 'idle',
    },
    {
      label: hasQueryResults ? 'Query tested' : queryAnalyzing ? 'Testing query' : 'Query waiting',
      status: hasQueryResults ? 'done' : queryAnalyzing ? 'active' : 'idle',
    },
  ]
}

function WorkspaceModeToggle({ activeMode, onChange, disabled = false }) {
  return (
    <div className="mode-toggle workspace-mode-toggle" role="group" aria-label="Workspace view">
      <button
        type="button"
        className={`mode-btn${activeMode === 'score' ? ' active' : ''}`}
        onClick={() => onChange('score')}
        disabled={disabled}
      >
        Summary
      </button>
      <button
        type="button"
        className={`mode-btn${activeMode === 'intelligence' ? ' active' : ''}`}
        onClick={() => onChange('intelligence')}
        disabled={disabled}
      >
        Diagnostics
      </button>
    </div>
  )
}

function ThemeIconButton({ theme, onToggle }) {
  const isDark = theme === 'dark'
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <button
      type="button"
      className="theme-icon-btn"
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      {isDark ? (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 4.5V2.2M12 21.8v-2.3M4.5 12H2.2M21.8 12h-2.3M6.7 6.7 5.1 5.1M18.9 18.9l-1.6-1.6M17.3 6.7l1.6-1.6M5.1 18.9l1.6-1.6" />
          <circle cx="12" cy="12" r="4.2" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M20.2 15.2A7.7 7.7 0 0 1 8.8 3.8 8.7 8.7 0 1 0 20.2 15.2Z" />
        </svg>
      )}
    </button>
  )
}

function DiagnosticContextBar({
  hasFetched,
  hasBaseline,
  hasQueryResults,
  contentAnalyzing,
  queryAnalyzing,
  activeResults,
  activeMode,
  onModeChange,
  onPrimaryAction,
  normalizedUrl,
  query,
}) {
  const status = getExecutiveStatus({
    hasFetched,
    hasBaseline,
    hasQueryResults,
    contentAnalyzing,
    queryAnalyzing,
    activeResults,
  })
  const chips = getStepChips({
    hasFetched,
    hasBaseline,
    hasQueryResults,
    contentAnalyzing,
    queryAnalyzing,
  })
  const actionLabel = !hasFetched || contentAnalyzing
    ? 'Fetch a page first'
    : !hasQueryResults
      ? 'Run Query Test'
      : activeMode !== 'intelligence'
        ? 'Review Diagnostics'
        : 'Open Rewrite Help'
  const sourceLabel = normalizedUrl || 'No page loaded'
  const queryLabel = query?.trim() || 'No target query yet'

  return (
    <div className="diagnostic-context-bar" aria-label="Diagnostic workspace status">
      <div className="diagnostic-context-main">
        <span className={`context-verdict context-verdict--${status.tone}`}>{status.label}</span>
        <div>
          <strong>{hasQueryResults ? 'Citation diagnosis is ready' : hasFetched ? 'Current test is loaded' : 'Start with a source page'}</strong>
          <p>{status.detail}</p>
        </div>
      </div>

      <div className="diagnostic-context-evidence" aria-label="Workflow state">
        {chips.map(chip => (
          <span key={chip.label} className={`context-chip context-chip--${chip.status}`}>
            {chip.label}
          </span>
        ))}
      </div>

      <div className="diagnostic-context-meta">
        <span title={sourceLabel}>{sourceLabel}</span>
        {hasFetched && <span title={queryLabel}>{queryLabel}</span>}
      </div>

      {hasFetched && (
        <WorkspaceModeToggle
          activeMode={activeMode}
          onChange={onModeChange}
        />
      )}

      <button
        type="button"
        className="context-primary-action"
        onClick={onPrimaryAction}
        disabled={!hasFetched || contentAnalyzing || queryAnalyzing}
      >
        {actionLabel}
      </button>
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
  const [rewriteActive, setRewriteActive] = useState(false)
  const [activeMode, setActiveMode] = useState('score')
  const queryInputRef = useRef(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const handleBaselineAnalyze = useCallback(async (nextMarkdown, nextSourceSignals = {}, nextPageIntelligence = null) => {
    setContentAnalyzing(true)
    setError('')
    try {
      const apiResult = await runAnalyzeSse({
        url: nextSourceSignals?.sourceUrl || normalizedUrl || url,
        draft_content: nextMarkdown,
        target_query: '',
        run_legacy_llm_scorecard: false,
        include_llm_rewrite: false,
        run_competitor_grounding: false,
      })
      const data = adaptAnalyzeResult(apiResult)
      setBaselineResults(mergeResultsWithBaseline(data, null))
    } catch (e) {
      setError(e.message)
    } finally {
      setContentAnalyzing(false)
    }
  }, [normalizedUrl, url])

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
    setRewriteActive(false)
    setActiveMode('score')
    void handleBaselineAnalyze(nextMarkdown, nextSourceSignals, nextPageIntelligence)
  }, [handleBaselineAnalyze, url])

  const handleAnalyze = useCallback(async () => {
    if (!markdown) return

    setQueryAnalyzing(true)
    setError('')

    try {
      const apiResult = await runAnalyzeSse({
        url: normalizedUrl || sourceSignals?.sourceUrl || url,
        draft_content: markdown,
        target_query: query.trim() || undefined,
        run_legacy_llm_scorecard: false,
        include_llm_rewrite: false,
        run_competitor_grounding: true,
      })
      const data = adaptAnalyzeResult(apiResult)
      setResults(mergeResultsWithBaseline(data, baselineResults))
      setRewriteActive(false)
      setActiveMode('score')
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

  const handleSendDraftToChat = useCallback((draft) => {
    setChatDraft({ text: draft, token: Date.now() })
    setRewriteActive(true)
    window.setTimeout(() => {
      document.getElementById('ask-expert')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 0)
  }, [])

  const focusQueryInput = useCallback(() => {
    queryInputRef.current?.focus()
  }, [])

  const scrollToRewrite = useCallback(() => {
    setRewriteActive(true)
    window.setTimeout(() => {
      document.getElementById('ask-expert')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }, [])

  const startNewTest = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setUrl('')
    setMarkdown('')
    setNormalizedUrl('')
    setCharCount(0)
    setSourceSignals({})
    setPageIntelligence(null)
    setQuery('')
    setBaselineResults(null)
    setResults(null)
    setError('')
    setAdvancedOpen(false)
    setDrawer(null)
    setChatDraft({ text: '', token: 0 })
    setRewriteActive(false)
    setActiveMode('score')
  }, [])

  const handleContextPrimaryAction = useCallback(() => {
    if (!hasFetched || contentAnalyzing || queryAnalyzing) return

    if (!hasQueryResults) {
      document.querySelector('.section-query-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      focusQueryInput()
      return
    }

    if (activeMode !== 'intelligence') {
      setActiveMode('intelligence')
      document.getElementById('analysis-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    scrollToRewrite()
  }, [activeMode, contentAnalyzing, focusQueryInput, hasFetched, hasQueryResults, queryAnalyzing, scrollToRewrite])

  const handleCopyDrawer = useCallback(() => {
    if (!drawer?.drawerContent) return
    navigator.clipboard?.writeText(drawer.drawerContent)
  }, [drawer])

  return (
    <div className={`app ${gateClass}${rewriteActive ? ' app--rewrite-active' : ''}`}>
      <div className="sr-only" role="status" aria-live="polite">
        {contentAnalyzing
          ? 'Analyzing baseline content signals...'
          : queryAnalyzing
            ? 'Re-scoring against target query...'
            : ''}
      </div>

      <header className="topbar">
        <div className="topbar-brand">
          <CrestLogo size="small" />
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="topbar-command-btn"
            onClick={startNewTest}
            disabled={isFocusGate && !url.trim()}
          >
            New Test
          </button>
          <ThemeIconButton
            theme={theme}
            onToggle={() => setTheme(current => current === 'light' ? 'dark' : 'light')}
          />
        </div>
      </header>

      {!isFocusGate && (
        <DiagnosticContextBar
          hasFetched={hasFetched}
          hasBaseline={hasBaseline}
          hasQueryResults={hasQueryResults}
          contentAnalyzing={contentAnalyzing}
          queryAnalyzing={queryAnalyzing}
          activeResults={activeResults}
          activeMode={activeMode}
          onModeChange={setActiveMode}
          onPrimaryAction={handleContextPrimaryAction}
          normalizedUrl={normalizedUrl || url}
          query={query}
        />
      )}

      <div className={`diagnostic-workspace${rewriteActive ? ' diagnostic-workspace--rewrite-active' : ''}`}>
      <main id="analysis-workspace" className={`main ${isFocusGate ? 'main--focus' : ''}`}>
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

          {activeMode === 'score' && showQueryResults && (
            <DiagnosticBrief
              results={results}
              markdown={markdown}
              pageIntelligence={pageIntelligence}
              query={query.trim()}
              normalizedUrl={normalizedUrl || url}
              onSendToRewrite={handleSendDraftToChat}
            />
          )}

          {activeMode === 'score' && showBaseline && !hasQueryResults && (
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
                onRunQueryTest={focusQueryInput}
              />
            </div>
          )}

          {activeMode === 'score' && hasBaseline && !hasQueryResults && (
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
                  <div className="section-kicker">{isDiagnosticGate ? 'Step Three / Query Test' : 'Step Three / Query Test'}</div>
                  <div className="section-title">
                    {isDiagnosticGate ? 'The target question is in focus' : 'Run a target query to open the answer path'}
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
                  <div className="query-locked-card query-locked-card--action">
                    <span className="query-locked-label">Next action</span>
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
                <div className="section-kicker">Diagnostics locked</div>
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

        </section>
      </main>

      {markdown && rewriteActive && (
        <section id="ask-expert" className="ask-expert-section">
          <div className="ask-expert-inner">
            <div className="ask-expert-header">
              <div className="ask-expert-kicker">Step Five / Rewrite Help</div>
              <h2 className="ask-expert-heading">Turn the diagnosis into better page copy.</h2>
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
    </div>
  )
}
