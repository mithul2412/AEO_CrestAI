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
      competitors: [],
    }
  }

  if (!client) {
    return {
      status: 'disabled',
      reason: 'TAVILY_API_KEY is missing',
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

  return {
    status: 'ok',
    query: cleanQuery,
    competitors: normalizeTavilyCompetitors(response.results || [], { sourceUrl, maxResults }),
    usage: response.usage || null,
    requestId: response.requestId || null,
  }
}
