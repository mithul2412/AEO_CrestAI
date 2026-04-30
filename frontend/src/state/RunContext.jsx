import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { readApiError } from '../utils/api.js'

const RunContext = createContext(null)
const THEME_KEY = 'aeo-scorer-theme'

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
    gapScore: merged.gapScore ?? (
      typeof merged.contentScore === 'number' && typeof merged.queryScore === 'number'
        ? merged.contentScore - merged.queryScore
        : null
    ),
  }
}

export function RunProvider({ children }) {
  const [url, setUrl] = useState('')
  const [normalizedUrl, setNormalizedUrl] = useState('')
  const [markdown, setMarkdown] = useState('')
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
  const [chatDraft, setChatDraft] = useState({ text: '', token: 0 })
  const [querySuggestions, setQuerySuggestions] = useState([])
  const [querySuggestionsLoading, setQuerySuggestionsLoading] = useState(false)
  const [querySuggestionsMeta, setQuerySuggestionsMeta] = useState(null)
  const querySuggestionsAbortRef = useRef(null)

  const cancelPendingQuerySuggestions = useCallback(() => {
    if (querySuggestionsAbortRef.current) {
      querySuggestionsAbortRef.current.abort()
      querySuggestionsAbortRef.current = null
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const generateQuerySuggestions = useCallback(async (nextMarkdown, nextPageIntelligence = null, nextNormalizedUrl = '') => {
    if (!nextMarkdown) return
    // Cancel any in-flight request before starting a new one
    cancelPendingQuerySuggestions()
    const controller = new AbortController()
    querySuggestionsAbortRef.current = controller

    setQuerySuggestionsLoading(true)
    setQuerySuggestionsMeta(null)
    try {
      const res = await fetch('/analyze/query-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown: nextMarkdown,
          sourceUrl: nextNormalizedUrl,
          pageIntelligence: nextPageIntelligence || {},
        }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(await readApiError(res, `Query suggestions error: ${res.status}`))
      const data = await res.json()
      setQuerySuggestions(Array.isArray(data.queries) ? data.queries : [])
      setQuerySuggestionsMeta({
        model: data.model || '',
        fallback: Boolean(data.fallback),
      })
    } catch (e) {
      if (e.name === 'AbortError') return
      setQuerySuggestions([])
      setQuerySuggestionsMeta({ error: e.message, fallback: true })
    } finally {
      if (querySuggestionsAbortRef.current === controller) {
        setQuerySuggestionsLoading(false)
      }
    }
  }, [cancelPendingQuerySuggestions])

  const handleBaselineAnalyze = useCallback(async (nextMarkdown, nextSourceSignals = {}, nextPageIntelligence = null, nextNormalizedUrl = '') => {
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
        }),
      })
      if (!res.ok) throw new Error(await readApiError(res, `Analyze error: ${res.status}`))
      const data = await res.json()
      setBaselineResults(mergeResultsWithBaseline(data, null))
    } catch (e) {
      setError(e.message)
    } finally {
      setContentAnalyzing(false)
    }
  }, [generateQuerySuggestions])

  const handleFetchComplete = useCallback((nextMarkdown, nextCharCount, nextSourceSignals = {}, nextPageIntelligence = null, nextNormalizedUrl = '') => {
    // Abort any in-flight query-suggestion request for the previous page
    cancelPendingQuerySuggestions()
    setMarkdown(nextMarkdown)
    setNormalizedUrl(nextNormalizedUrl || nextSourceSignals?.sourceUrl || url)
    setCharCount(nextCharCount)
    setSourceSignals(nextSourceSignals)
    setPageIntelligence(nextPageIntelligence)
    setQuery('')
    setQuerySuggestions([])
    setQuerySuggestionsMeta(null)
    setQuerySuggestionsLoading(false)
    setBaselineResults(null)
    setResults(null)
    void handleBaselineAnalyze(nextMarkdown, nextSourceSignals, nextPageIntelligence, nextNormalizedUrl || nextSourceSignals?.sourceUrl || url)
  }, [cancelPendingQuerySuggestions, handleBaselineAnalyze, url])

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
        }),
      })
      if (!res.ok) throw new Error(await readApiError(res, `Analyze error: ${res.status}`))
      const data = await res.json()
      setResults(mergeResultsWithBaseline(data, baselineResults))
    } catch (e) {
      setError(e.message)
    } finally {
      setQueryAnalyzing(false)
    }
  }, [baselineResults, markdown, normalizedUrl, pageIntelligence, query, sourceSignals])

  const startNewTest = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setUrl('')
    setNormalizedUrl('')
    setMarkdown('')
    setCharCount(0)
    setSourceSignals({})
    setPageIntelligence(null)
    setQuery('')
    setQuerySuggestions([])
    setQuerySuggestionsMeta(null)
    setQuerySuggestionsLoading(false)
    setBaselineResults(null)
    setResults(null)
    setError('')
    setChatDraft({ text: '', token: 0 })
  }, [])

  const sendDraftToChat = useCallback((draft) => {
    setChatDraft({ text: draft, token: Date.now() })
  }, [])

  const hasFetched = !!markdown
  const hasBaseline = !!baselineResults
  const hasQueryResults = !!results
  const activeResults = results || baselineResults

  const value = useMemo(() => ({
    // raw state
    url, normalizedUrl, markdown, charCount, sourceSignals, pageIntelligence,
    query, theme, baselineResults, results, activeResults,
    contentAnalyzing, queryAnalyzing, error,
    chatDraft, querySuggestions, querySuggestionsLoading, querySuggestionsMeta,

    // derived
    hasFetched, hasBaseline, hasQueryResults,

    // setters
    setUrl, setQuery, setTheme,

    // actions
    handleFetchComplete, handleAnalyze, handleBaselineAnalyze, generateQuerySuggestions,
    startNewTest, sendDraftToChat,
  }), [
    url, normalizedUrl, markdown, charCount, sourceSignals, pageIntelligence,
    query, theme, baselineResults, results, activeResults,
    contentAnalyzing, queryAnalyzing, error, chatDraft, querySuggestions, querySuggestionsLoading, querySuggestionsMeta,
    hasFetched, hasBaseline, hasQueryResults,
    handleFetchComplete, handleAnalyze, handleBaselineAnalyze, generateQuerySuggestions,
    startNewTest, sendDraftToChat,
  ])

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>
}

export function useRun() {
  const ctx = useContext(RunContext)
  if (!ctx) throw new Error('useRun must be used within RunProvider')
  return ctx
}
