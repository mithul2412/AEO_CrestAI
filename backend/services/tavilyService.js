import { tavily } from '@tavily/core'

const DEFAULT_TAVILY_SEARCH_LIMIT = 8

export function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

export function isBadResult(url) {
  const lower = String(url || '').toLowerCase()
  return (
    !lower ||
    lower.endsWith('.pdf') ||
    lower.includes('/login') ||
    lower.includes('/signup') ||
    lower.includes('/careers') ||
    lower.includes('/privacy') ||
    lower.includes('/terms')
  )
}

function getClient(apiKey = process.env.TAVILY_API_KEY) {
  return apiKey ? tavily({ apiKey }) : null
}

export function normalizeTavilyCompetitors(results = [], { sourceUrl = '', maxResults = 5 } = {}) {
  const sourceDomain = getDomain(sourceUrl)
  const seen = new Set()

  return results
    .filter(result => result?.url)
    .filter(result => {
      const domain = getDomain(result.url)
      if (!domain || domain === sourceDomain || seen.has(result.url) || isBadResult(result.url)) return false
      seen.add(result.url)
      return true
    })
    .slice(0, maxResults)
    .map(result => ({
      title: result.title || '',
      url: result.url,
      snippet: result.content || '',
      tavilyScore: typeof result.score === 'number' ? result.score : null,
    }))
}

export function normalizeSearchResults(results = [], { maxResults = 10 } = {}) {
  return results
    .filter(result => result?.url)
    .slice(0, maxResults)
    .map((result, index) => ({
      rank: index + 1,
      title: result.title || '',
      url: result.url,
      domain: getDomain(result.url),
      snippet: result.content || '',
      tavilyScore: typeof result.score === 'number' ? result.score : null,
    }))
}

export function buildSearchPresence(results = [], { sourceUrl = '', maxResults = 10 } = {}) {
  const sourceDomain = getDomain(sourceUrl)
  const normalized = normalizeSearchResults(results, { maxResults })
  const sourceResult = normalized.find(result => result.domain === sourceDomain) || null

  return {
    status: 'ok',
    sourceDomain,
    domainRank: sourceResult?.rank || null,
    sourceResult,
    results: normalized,
  }
}

export async function discoverCompetitors({
  query,
  sourceUrl,
  maxResults = 5,
  client = getClient(),
} = {}) {
  const cleanQuery = String(query || '').trim()

  if (!cleanQuery) {
    return {
      status: 'disabled',
      reason: 'query is required',
      searchPresence: {
        status: 'disabled',
        reason: 'query is required',
        sourceDomain: getDomain(sourceUrl),
        domainRank: null,
        sourceResult: null,
        results: [],
      },
      competitors: [],
    }
  }

  if (!client) {
    return {
      status: 'disabled',
      reason: 'TAVILY_API_KEY is missing',
      searchPresence: {
        status: 'disabled',
        reason: 'TAVILY_API_KEY is missing',
        sourceDomain: getDomain(sourceUrl),
        domainRank: null,
        sourceResult: null,
        results: [],
      },
      competitors: [],
    }
  }

  const response = await client.search(cleanQuery, {
    searchDepth: 'basic',
    maxResults: Math.max(DEFAULT_TAVILY_SEARCH_LIMIT, maxResults),
    includeAnswer: false,
    includeRawContent: false,
    includeImages: false,
    includeUsage: true,
  })

  const rawResults = response.results || []

  return {
    status: 'ok',
    query: cleanQuery,
    competitors: normalizeTavilyCompetitors(rawResults, { sourceUrl, maxResults }),
    searchPresence: buildSearchPresence(rawResults, {
      sourceUrl,
      maxResults: Math.max(DEFAULT_TAVILY_SEARCH_LIMIT, maxResults),
    }),
    usage: response.usage || null,
    requestId: response.requestId || null,
  }
}

export async function searchQueryPresence({
  query,
  sourceUrl,
  maxResults = 10,
  client = getClient(),
} = {}) {
  const cleanQuery = String(query || '').trim()

  if (!cleanQuery) {
    return {
      status: 'disabled',
      reason: 'query is required',
      sourceDomain: getDomain(sourceUrl),
      domainRank: null,
      sourceResult: null,
      results: [],
    }
  }

  if (!client) {
    return {
      status: 'disabled',
      reason: 'TAVILY_API_KEY is missing',
      sourceDomain: getDomain(sourceUrl),
      domainRank: null,
      sourceResult: null,
      results: [],
    }
  }

  const response = await client.search(cleanQuery, {
    searchDepth: 'basic',
    maxResults,
    includeAnswer: false,
    includeRawContent: false,
    includeImages: false,
    includeUsage: true,
  })
  return {
    ...buildSearchPresence(response.results || [], { sourceUrl, maxResults }),
    query: cleanQuery,
    usage: response.usage || null,
    requestId: response.requestId || null,
  }
}
