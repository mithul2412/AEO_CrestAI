import { discoverCompetitors } from './tavilyService.js'
import { buildQueryDiscovery } from './queryDiscoveryService.js'

const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map()

const TIER_BANDS = [
  { id: 'leader', label: 'Leader', min: 75 },
  { id: 'challenger', label: 'Challenger', min: 55 },
  { id: 'niche', label: 'Niche', min: 35 },
  { id: 'adjacent', label: 'Adjacent', min: 0 },
]

const COMMUNITY_DOMAINS = new Set(['reddit.com', 'quora.com', 'stackoverflow.com', 'news.ycombinator.com'])
const DIRECTORY_DOMAINS = new Set(['g2.com', 'capterra.com', 'trustradius.com', 'softwareadvice.com', 'getapp.com'])
const EDITORIAL_DOMAINS = new Set(['pcmag.com', 'forbes.com', 'techradar.com', 'zapier.com', 'nerdwallet.com', 'investopedia.com'])
const MULTI_PART_TLDS = new Set(['co.uk', 'com.au', 'com.br', 'com.mx', 'com.sg', 'co.in', 'co.jp', 'co.nz', 'co.za'])

function classifyTier(score) {
  for (const band of TIER_BANDS) {
    if (score >= band.min) return band
  }
  return TIER_BANDS[TIER_BANDS.length - 1]
}

function clampScore(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function clip(value = '', limit = 220) {
  const text = compact(value)
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1).trim()}…`
}

function stableId(value = '') {
  return String(value || 'competitor')
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'competitor'
}

function classifyDomainType(domain = '') {
  const clean = String(domain || '').replace(/^www\./, '').toLowerCase()
  if (COMMUNITY_DOMAINS.has(clean)) return { id: 'community', label: 'Community Surface', penalty: 18 }
  if (DIRECTORY_DOMAINS.has(clean)) return { id: 'directory', label: 'Directory Surface', penalty: 12 }
  if (EDITORIAL_DOMAINS.has(clean)) return { id: 'editorial', label: 'Editorial Surface', penalty: 10 }
  return { id: 'brand', label: 'Competitor', penalty: 0 }
}

function comparableHost(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    return new URL(raw).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return raw.replace(/^www\./, '').toLowerCase()
  }
}

function comparableDomain(value = '') {
  const host = comparableHost(value)
  const parts = host.split('.').filter(Boolean)
  if (parts.length <= 2) return host

  const suffix = parts.slice(-2).join('.')
  if (MULTI_PART_TLDS.has(suffix) && parts.length >= 3) {
    return parts.slice(-3).join('.')
  }
  return parts.slice(-2).join('.')
}

function adjustPresenceScore(rawScore, domainType) {
  return clampScore(rawScore - (domainType?.penalty || 0))
}

function emptyMarketSummary({ reason = '', sourceDomain = '' } = {}) {
  return {
    searchedAngles: '0/0',
    visibleCompetitors: 0,
    sourceDomainPresence: sourceDomain
      ? `${sourceDomain} was not evaluated.`
      : 'Source domain was not evaluated.',
    topLeader: null,
    recommendedMove: reason || 'Run a target query with Tavily configured to populate competitor positioning.',
  }
}

function uniqueLower(values) {
  const seen = new Set()
  return values.filter(value => {
    const key = String(value || '').toLowerCase().trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function snippetSpecificityScore(snippet = '') {
  const text = String(snippet || '')
  if (!text) return 0
  const numericHits = (text.match(/\b\d+(?:\.\d+)?(?:%|x|k|m|b)?\b|\$\d+/gi) || []).length
  const namedHits = (text.match(/\b[A-Z][A-Za-z0-9&.-]+\b/g) || []).length
  const lengthBonus = Math.min(text.length, 360) / 360
  return clampScore(numericHits * 18 + Math.min(namedHits, 6) * 6 + lengthBonus * 30)
}

export function buildAngleQueries({ query = '', sourceUrl = '', pageIntelligence = {}, markdown = '' } = {}) {
  const cleanQuery = compact(query)
  const discovery = buildQueryDiscovery({
    query: cleanQuery,
    sourceUrl,
    markdown,
    pageIntelligence,
    maxQueries: 6,
  })
  const brand = discovery.brand
  const category = discovery.category

  const angles = []
  if (cleanQuery) {
    angles.push({ id: 'target', label: 'Target Query', query: cleanQuery })
  }
  if (category) {
    const categoryLeaderQuery = cleanQuery.toLowerCase() === `best ${category}`.toLowerCase()
      ? `top ${category} software`
      : `best ${category}`
    angles.push({ id: 'category', label: 'Category Leaders', query: categoryLeaderQuery })
  }
  if (brand) {
    angles.push({ id: 'alternatives', label: 'Alternatives', query: `${brand} alternatives` })
  } else if (category) {
    angles.push({ id: 'alternatives', label: 'Alternatives', query: `${category} alternatives` })
  }
  if (category && brand) {
    angles.push({ id: 'comparison', label: 'Comparison', query: `${category} comparison ${brand}` })
  } else if (category) {
    angles.push({ id: 'comparison', label: 'Comparison', query: `${category} comparison` })
  } else if (brand) {
    angles.push({ id: 'comparison', label: 'Comparison', query: `${brand} vs competitors` })
  }

  const seenQueries = new Set()
  return angles
    .filter(angle => {
      const key = angle.query.toLowerCase().trim()
      if (!key || seenQueries.has(key)) return false
      seenQueries.add(key)
      return true
    })
    .slice(0, 4)
    .concat(angles.length === 0 && cleanQuery ? [{ id: 'target', label: 'Target query', query: cleanQuery }] : [])
    .slice(0, 4)
}

function indexAnglesByDomain(angleResults, sourceDomain) {
  const map = new Map()

  angleResults.forEach(angle => {
    if (angle.status !== 'ok') return
    const seenInAngle = new Set()
    angle.results.forEach((result, index) => {
      const domain = comparableDomain(result.url)
      if (!domain || domain === sourceDomain) return
      if (seenInAngle.has(domain)) return
      seenInAngle.add(domain)

      const rank = index + 1
      if (!map.has(domain)) {
        map.set(domain, {
          domain,
          appearances: [],
          firstResult: result,
        })
      }

      map.get(domain).appearances.push({
        angleId: angle.angleId,
        angleLabel: angle.angleLabel,
        angleQuery: angle.angleQuery,
        rank,
        url: result.url,
        title: result.title,
        snippet: result.snippet,
        tavilyScore: typeof result.tavilyScore === 'number' ? result.tavilyScore : null,
      })
    })
  })

  return map
}

function presenceScore({ angleCount, appearances }) {
  if (appearances.length === 0 || angleCount === 0) return 0

  const coverage = appearances.length / angleCount
  const ranks = appearances.map(a => a.rank)
  const bestRank = Math.min(...ranks)
  const avgRank = ranks.reduce((sum, r) => sum + r, 0) / ranks.length
  const rankInverse = Math.max(0, 1 - (avgRank - 1) / 9)
  const tavilyScores = appearances.map(a => a.tavilyScore).filter(score => typeof score === 'number')
  const tavilyMean = tavilyScores.length > 0
    ? tavilyScores.reduce((sum, s) => sum + s, 0) / tavilyScores.length
    : 0.4
  const snippetScores = appearances.map(a => snippetSpecificityScore(a.snippet))
  const snippetMean = snippetScores.length > 0
    ? snippetScores.reduce((sum, s) => sum + s, 0) / snippetScores.length / 100
    : 0

  const composite =
    40 * coverage +
    25 * rankInverse +
    25 * tavilyMean +
    10 * snippetMean

  return { score: clampScore(composite), bestRank, avgRank, coverage }
}

export function buildWhyHere({ appearances, score, bestRank, coverage, angleCount }) {
  if (appearances.length === 0) return 'Did not surface in any of the searched angles.'

  const coveragePct = Math.round(coverage * 100)
  const strongestAngle = [...appearances].sort((a, b) => a.rank - b.rank)[0]
  const angleSummary = strongestAngle
    ? `strongest on "${strongestAngle.angleLabel}" at rank #${strongestAngle.rank}`
    : ''

  const tier = classifyTier(score).label
  const headline = `${tier} · presence ${score}/100`

  const angleClause = `Appears in ${appearances.length}/${angleCount} angles (${coveragePct}% coverage)`
  const rankClause = bestRank ? `, best rank #${bestRank}` : ''
  const strengthClause = angleSummary ? `, ${angleSummary}` : ''

  return `${headline}. ${angleClause}${rankClause}${strengthClause}.`
}

export function buildRankReason({ appearances, score, bestRank, coverage, angleCount }) {
  if (!appearances.length) return 'No angle produced this domain.'
  const strongest = [...appearances].sort((a, b) => a.rank - b.rank)[0]
  const coverageText = `${appearances.length}/${angleCount} angles`
  const rankText = bestRank ? `best rank #${bestRank}` : 'rank unavailable'
  const angleText = strongest?.angleLabel ? `strongest in ${strongest.angleLabel}` : 'angle signal unavailable'
  if (score >= 75) return `High market presence: ${coverageText}, ${rankText}, ${angleText}.`
  if (coverage >= 0.5) return `Broad presence: ${coverageText} with ${rankText}.`
  return `Narrow but visible presence: ${rankText}, ${angleText}.`
}

function pickTopStrengths({ appearances }) {
  const sortedByRank = [...appearances].sort((a, b) => a.rank - b.rank)
  const strengths = []
  if (sortedByRank[0]) {
    strengths.push(`Rank #${sortedByRank[0].rank} on "${sortedByRank[0].angleLabel}"`)
  }
  if (appearances.length >= 2) {
    strengths.push(`Surfaces in ${appearances.length} angles`)
  }
  const numericRich = appearances.find(a => /\b\d+(?:\.\d+)?%|\$\d+/.test(a.snippet || ''))
  if (numericRich) {
    strengths.push('Numeric proof in snippet')
  }
  return strengths.slice(0, 2)
}

function buildMarketSummary({ angleResults = [], competitors = [], yourPresence = null } = {}) {
  const okAngles = angleResults.filter(angle => angle.status === 'ok')
  const leadingBrand = competitors.find(competitor => competitor.domainType === 'brand') || competitors[0]
  const topLeader = leadingBrand
    ? {
        domain: leadingBrand.domain,
        tier: leadingBrand.tierLabel,
        presenceScore: leadingBrand.presenceScore,
        bestRank: leadingBrand.bestRank,
      }
    : null
  const sourceDomainPresence = yourPresence?.summary || 'Source domain presence was not evaluated.'
  const recommendedMove = (() => {
    if (!competitors.length) return 'No competitor domains were visible in the searched angles.'
    if (!yourPresence?.appearances?.length) {
      return `Your domain is missing from these result sets. Build a direct answer block and comparison proof against ${leadingBrand.domain}.`
    }
    if (leadingBrand.presenceScore >= 75) {
      return `Close the market gap by matching ${leadingBrand.domain}'s strongest angle with clearer proof and comparison copy.`
    }
    return 'The market is fragmented. Strengthen the exact query answer and make the page easier to quote.'
  })()

  return {
    searchedAngles: `${okAngles.length}/${angleResults.length}`,
    visibleCompetitors: competitors.length,
    sourceDomainPresence,
    topLeader,
    recommendedMove,
  }
}

function buildYourPresence({ angleResults, sourceDomain }) {
  if (!sourceDomain) return null
  const appearances = []

  angleResults.forEach(angle => {
    if (angle.status !== 'ok') return
    angle.results.forEach((result, index) => {
      if (comparableDomain(result.url) === sourceDomain) {
        appearances.push({
          angleId: angle.angleId,
          angleLabel: angle.angleLabel,
          angleQuery: angle.angleQuery,
          rank: index + 1,
          url: result.url,
          title: result.title,
        })
      }
    })
  })

  if (appearances.length === 0) {
    return {
      domain: sourceDomain,
      appearances: [],
      summary: `${sourceDomain} did not appear in any of the searched angles.`,
    }
  }

  const ranks = appearances.map(a => a.rank)
  const bestRank = Math.min(...ranks)
  const angleCount = angleResults.filter(a => a.status === 'ok').length
  return {
    domain: sourceDomain,
    appearances,
    bestRank,
    coverage: appearances.length / Math.max(angleCount, 1),
    summary: `${sourceDomain} appears in ${appearances.length}/${angleCount} angles (best rank #${bestRank}).`,
  }
}

async function runAnglesParallel({ angles, sourceUrl, discover, maxResults, signal }) {
  const settled = await Promise.allSettled(
    angles.map(angle =>
      discover({
        query: angle.query,
        sourceUrl,
        maxResults,
        signal,
      })
    )
  )

  return settled.map((result, index) => {
    const angle = angles[index]
    if (result.status === 'fulfilled' && result.value?.status === 'ok') {
      return {
        angleId: angle.id,
        angleLabel: angle.label,
        angleQuery: angle.query,
        status: 'ok',
        results: result.value.searchPresence?.results || [],
        usage: result.value.usage || null,
      }
    }
    return {
      angleId: angle.id,
      angleLabel: angle.label,
      angleQuery: angle.query,
      status: result.status === 'rejected' ? 'error' : (result.value?.status || 'disabled'),
      reason: result.status === 'rejected'
        ? (result.reason?.message || 'Tavily request failed')
        : (result.value?.reason || 'Tavily disabled'),
      results: [],
    }
  })
}

function buildCacheKey({ query, sourceUrl }) {
  const sourceDomain = comparableDomain(sourceUrl)
  const normalizedQuery = compact(query).toLowerCase()
  return `${sourceDomain}::${normalizedQuery}`
}

export function clearCompetitorMapCache() {
  cache.clear()
}

export async function buildCompetitorMap({
  query = '',
  sourceUrl = '',
  markdown = '',
  pageIntelligence = {},
  maxResults = 8,
  discover = discoverCompetitors,
  cacheStore = cache,
  cacheTtlMs = CACHE_TTL_MS,
  now = () => Date.now(),
} = {}) {
  const cleanQuery = compact(query)
  if (!cleanQuery) {
    return {
      status: 'disabled',
      reason: 'query is required',
      angleCount: 0,
      angles: [],
      competitors: [],
      grouped: {},
      yourPresence: null,
      marketSummary: emptyMarketSummary({ reason: 'query is required', sourceDomain: comparableDomain(sourceUrl) }),
    }
  }

  if (!process.env.TAVILY_API_KEY) {
    return {
      status: 'disabled',
      reason: 'TAVILY_API_KEY is missing',
      angleCount: 0,
      angles: [],
      competitors: [],
      grouped: {},
      yourPresence: null,
      marketSummary: emptyMarketSummary({ reason: 'TAVILY_API_KEY is missing', sourceDomain: comparableDomain(sourceUrl) }),
    }
  }

  const cacheKey = buildCacheKey({ query: cleanQuery, sourceUrl })
  const cached = cacheStore.get(cacheKey)
  if (cached && now() - cached.cachedAt < cacheTtlMs) {
    return { ...cached.payload, cached: true }
  }

  const angles = buildAngleQueries({ query: cleanQuery, sourceUrl, pageIntelligence, markdown })
  if (angles.length === 0) {
    return {
      status: 'disabled',
      reason: 'no usable angles could be derived',
      angleCount: 0,
      angles: [],
      competitors: [],
      grouped: {},
      yourPresence: null,
      marketSummary: emptyMarketSummary({ reason: 'no usable angles could be derived', sourceDomain: comparableDomain(sourceUrl) }),
    }
  }

  let angleResults
  try {
    angleResults = await runAnglesParallel({ angles, sourceUrl, discover, maxResults })
  } catch (err) {
    return {
      status: 'error',
      reason: err?.message || 'angle searches failed',
      angleCount: 0,
      angles: angles.map(a => ({ angleId: a.id, angleLabel: a.label, angleQuery: a.query, status: 'error', results: [] })),
      competitors: [],
      grouped: {},
      yourPresence: null,
      marketSummary: emptyMarketSummary({ reason: err?.message || 'angle searches failed', sourceDomain: comparableDomain(sourceUrl) }),
    }
  }

  const okAngles = angleResults.filter(angle => angle.status === 'ok')
  if (okAngles.length === 0) {
    return {
      status: 'error',
      reason: angleResults[0]?.reason || 'all angle searches failed',
      angleCount: 0,
      angles: angleResults,
      competitors: [],
      grouped: {},
      yourPresence: null,
      marketSummary: emptyMarketSummary({ reason: angleResults[0]?.reason || 'all angle searches failed', sourceDomain: comparableDomain(sourceUrl) }),
    }
  }

  const sourceDomain = comparableDomain(sourceUrl)
  const angleCount = okAngles.length
  const domainMap = indexAnglesByDomain(angleResults, sourceDomain)

  const competitors = [...domainMap.values()].map(entry => {
    const { score: rawScore, bestRank, avgRank, coverage } = presenceScore({ angleCount, appearances: entry.appearances })
    const domainType = classifyDomainType(entry.domain)
    const score = adjustPresenceScore(rawScore, domainType)
    const tier = classifyTier(score)
    const angleLabels = uniqueLower(entry.appearances.map(a => a.angleLabel))
    const strongestAppearance = [...entry.appearances].sort((a, b) => a.rank - b.rank)[0] || null
    return {
      id: stableId(entry.domain),
      domain: entry.domain,
      url: entry.firstResult.url,
      title: compact(entry.firstResult.title) || entry.domain,
      domainType: domainType.id,
      domainTypeLabel: domainType.label,
      tier: tier.id,
      tierLabel: tier.label,
      presenceScore: score,
      rawPresenceScore: rawScore,
      bestRank,
      avgRank: Number(avgRank.toFixed(2)),
      coverage: Number(coverage.toFixed(2)),
      strongestAngleId: strongestAppearance?.angleId || null,
      appearances: entry.appearances,
      angleLabels,
      snippetPreview: clip(strongestAppearance?.snippet || entry.firstResult.snippet || ''),
      strengths: pickTopStrengths({ appearances: entry.appearances }),
      rankReason: [
        buildRankReason({
          appearances: entry.appearances,
          score,
          bestRank,
          coverage,
          angleCount,
        }),
        domainType.id !== 'brand' ? `${domainType.label} results are downweighted against direct competitors.` : '',
      ].filter(Boolean).join(' '),
      whyHere: buildWhyHere({
        appearances: entry.appearances,
        score,
        bestRank,
        coverage,
        angleCount,
      }),
    }
  }).sort((a, b) => b.presenceScore - a.presenceScore)
   .slice(0, 12)

  const grouped = TIER_BANDS.reduce((acc, band) => {
    acc[band.id] = competitors.filter(c => c.tier === band.id)
    return acc
  }, {})

  const yourPresence = buildYourPresence({ angleResults, sourceDomain })
  const marketSummary = buildMarketSummary({ angleResults, competitors, yourPresence })

  const payload = {
    status: 'ok',
    angles: angleResults.map(angle => ({
      angleId: angle.angleId,
      angleLabel: angle.angleLabel,
      angleQuery: angle.angleQuery,
      status: angle.status,
      reason: angle.reason || null,
      resultCount: angle.results.length,
    })),
    angleCount,
    competitors,
    grouped,
    yourPresence,
    marketSummary,
  }

  cacheStore.set(cacheKey, { cachedAt: now(), payload })

  return payload
}
