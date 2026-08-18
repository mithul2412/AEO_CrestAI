import {
  buildAngleQueries,
  buildCompetitorMap,
  buildWhyHere,
  clearCompetitorMapCache,
} from '../services/competitorMapService.js'

const samplePageIntelligence = {
  extraction: {
    title: 'Acme CRM Pricing | Acme',
    h1: 'Acme CRM pricing for small businesses',
    headings: ['Compare plans', 'FAQ'],
  },
}

const sampleMarkdown = `# Acme CRM pricing
Acme CRM is a small-business CRM. Compare plans below.
## Compare plans
- Starter at $19/mo
- Pro at $49/mo
## FAQ
What is the best CRM for small business?`

function buildFakeDiscover(angleResults) {
  const normalized = Object.fromEntries(
    Object.entries(angleResults).map(([key, value]) => [key.toLowerCase().trim(), value])
  )
  return ({ query }) => {
    const key = String(query || '').toLowerCase().trim()
    const match = normalized[key]
    if (!match) {
      return Promise.resolve({ status: 'disabled', reason: 'no fixture for query', searchPresence: { results: [] } })
    }
    return Promise.resolve(match)
  }
}

beforeEach(() => {
  clearCompetitorMapCache()
})

describe('buildAngleQueries', () => {
  test('produces up to 4 deduped angle queries from query+brand+category', () => {
    const angles = buildAngleQueries({
      query: 'best CRM for small business',
      sourceUrl: 'https://acme.com/pricing',
      pageIntelligence: samplePageIntelligence,
      markdown: sampleMarkdown,
    })

    expect(angles.length).toBeGreaterThanOrEqual(2)
    expect(angles.length).toBeLessThanOrEqual(4)
    expect(angles[0].query.toLowerCase()).toBe('best crm for small business')
    expect(angles.map(a => a.label)).toContain('Category Leaders')
    const uniqueKeys = new Set(angles.map(a => a.query.toLowerCase()))
    expect(uniqueKeys.size).toBe(angles.length)
  })

  test('returns target-only when no brand/category can be derived', () => {
    const angles = buildAngleQueries({
      query: 'why use answer engines',
      sourceUrl: '',
      pageIntelligence: {},
      markdown: '',
    })
    expect(angles.length).toBeGreaterThanOrEqual(1)
    expect(angles[0].query).toBe('why use answer engines')
  })
})

describe('buildWhyHere', () => {
  test('summarizes appearances, coverage, best rank, and tier', () => {
    const text = buildWhyHere({
      appearances: [
        { angleId: 'target', angleLabel: 'Target query', rank: 2 },
        { angleId: 'category', angleLabel: 'Best CRM', rank: 1 },
        { angleId: 'alternatives', angleLabel: 'Acme alternatives', rank: 4 },
      ],
      score: 78,
      bestRank: 1,
      coverage: 0.75,
      angleCount: 4,
    })
    expect(text).toMatch(/Leader/)
    expect(text).toMatch(/3\/4 angles/)
    expect(text).toMatch(/best rank #1/)
    expect(text).toMatch(/Best CRM/)
  })

  test('handles zero appearances cleanly', () => {
    const text = buildWhyHere({
      appearances: [],
      score: 0,
      bestRank: null,
      coverage: 0,
      angleCount: 4,
    })
    expect(text).toMatch(/Did not surface/i)
  })
})

describe('buildCompetitorMap', () => {
  const originalEnv = process.env.TAVILY_API_KEY

  afterEach(() => {
    process.env.TAVILY_API_KEY = originalEnv
  })

  test('returns disabled when TAVILY_API_KEY is missing', async () => {
    delete process.env.TAVILY_API_KEY
    const result = await buildCompetitorMap({
      query: 'best CRM for small business',
      sourceUrl: 'https://acme.com/pricing',
    })
    expect(result.status).toBe('disabled')
    expect(result.reason).toMatch(/TAVILY_API_KEY/)
  })

  test('returns disabled when query is empty', async () => {
    process.env.TAVILY_API_KEY = 'fake'
    const result = await buildCompetitorMap({
      query: '',
      sourceUrl: 'https://acme.com/pricing',
    })
    expect(result.status).toBe('disabled')
  })

  test('aggregates across multiple angles, classifies tiers, builds whyHere, and excludes source domain', async () => {
    process.env.TAVILY_API_KEY = 'fake'

    const angleCalls = []
    const discover = ({ query }) => {
      angleCalls.push(query)
      const lower = String(query || '').toLowerCase()
      const isTarget = lower.includes('best crm') || lower === 'best crm for small business'
      const isAlternatives = lower.includes('alternative')
      const isVs = lower.includes('vs')
      return Promise.resolve({
        status: 'ok',
        searchPresence: {
          results: [
            { url: 'https://hubspot.com/crm', title: 'HubSpot CRM', domain: 'hubspot.com', tavilyScore: isTarget ? 0.92 : 0.78, snippet: '40% of small business teams use HubSpot. $0 free tier.' },
            { url: 'https://pipedrive.com/', title: 'Pipedrive', domain: 'pipedrive.com', tavilyScore: isAlternatives ? 0.85 : 0.7, snippet: 'Pipedrive helps small business close 28% more deals.' },
            { url: 'https://acme.com/pricing', title: 'Acme', domain: 'acme.com', tavilyScore: 0.5 },
            { url: 'https://zoho.com/crm', title: 'Zoho CRM', domain: 'zoho.com', tavilyScore: isVs ? 0.6 : 0.55, snippet: 'Zoho CRM for small business teams.' },
          ],
        },
      })
    }

    const result = await buildCompetitorMap({
      query: 'best CRM for small business',
      sourceUrl: 'https://acme.com/pricing',
      markdown: sampleMarkdown,
      pageIntelligence: samplePageIntelligence,
      discover,
    })

    expect(result.status).toBe('ok')
    expect(result.angles.length).toBeGreaterThanOrEqual(2)
    expect(result.competitors.length).toBeGreaterThan(0)
    expect(result.competitors.some(c => c.domain === 'acme.com')).toBe(false)
    const hubspot = result.competitors.find(c => c.domain === 'hubspot.com')
    expect(hubspot).toBeDefined()
    expect(hubspot.id).toBe('hubspot-com')
    expect(hubspot.presenceScore).toBeGreaterThan(40)
    expect(['leader', 'challenger', 'niche', 'adjacent']).toContain(hubspot.tier)
    expect(hubspot.whyHere).toMatch(/angles/)
    expect(hubspot.rankReason).toMatch(/presence|rank/i)
    expect(hubspot.strongestAngleId).toBeTruthy()
    expect(hubspot.appearances.length).toBeGreaterThanOrEqual(2)
    expect(result.marketSummary.visibleCompetitors).toBe(result.competitors.length)
    expect(result.marketSummary.searchedAngles).toMatch(/\d+\/\d+/)
  })

  test('keeps research surfaces visible but recommends direct brand competitors first', async () => {
    process.env.TAVILY_API_KEY = 'fake'

    const discover = () => Promise.resolve({
      status: 'ok',
      searchPresence: {
        results: [
          { url: 'https://reddit.com/r/sales/comments/crm', title: 'CRM discussion', domain: 'reddit.com', tavilyScore: 0.99, snippet: 'Reddit thread comparing CRM tools for 2026.' },
          { url: 'https://salesforce.com/crm/small-business', title: 'Salesforce CRM', domain: 'salesforce.com', tavilyScore: 0.86, snippet: 'Salesforce CRM supports small business sales teams with automation.' },
          { url: 'https://pcmag.com/picks/the-best-crm-software', title: 'Best CRM Software', domain: 'pcmag.com', tavilyScore: 0.84, snippet: 'PCMag reviews CRM platforms for small business teams.' },
        ],
      },
    })

    const result = await buildCompetitorMap({
      query: 'best CRM for small business',
      sourceUrl: 'https://acme.com/pricing',
      markdown: sampleMarkdown,
      pageIntelligence: samplePageIntelligence,
      discover,
    })

    const reddit = result.competitors.find(c => c.domain === 'reddit.com')
    const salesforce = result.competitors.find(c => c.domain === 'salesforce.com')

    expect(reddit.domainType).toBe('community')
    expect(reddit.rawPresenceScore).toBeGreaterThan(reddit.presenceScore)
    expect(reddit.rankReason).toMatch(/downweighted/i)
    expect(salesforce.domainType).toBe('brand')
    expect(result.marketSummary.topLeader.domain).toBe('salesforce.com')
    expect(result.marketSummary.recommendedMove).toMatch(/salesforce\.com/i)
  })

  test('caches results within TTL window', async () => {
    process.env.TAVILY_API_KEY = 'fake'
    let calls = 0
    const cacheStore = new Map()
    const discover = ({ query }) => {
      calls += 1
      return Promise.resolve({
        status: 'ok',
        searchPresence: {
          results: [
            { url: 'https://example.com/a', title: 'A', domain: 'example.com', tavilyScore: 0.6 },
          ],
        },
      })
    }

    const args = {
      query: 'best widgets',
      sourceUrl: 'https://acme.com',
      markdown: sampleMarkdown,
      pageIntelligence: samplePageIntelligence,
      discover,
      cacheStore,
      cacheTtlMs: 60_000,
    }

    const first = await buildCompetitorMap(args)
    const callsAfterFirst = calls
    const second = await buildCompetitorMap(args)
    expect(second.cached).toBe(true)
    expect(calls).toBe(callsAfterFirst)
    expect(first.competitors.length).toBe(second.competitors.length)
  })

  test('reports yourPresence when source domain appears in results', async () => {
    process.env.TAVILY_API_KEY = 'fake'
    const fixture = {
      'best widgets': {
        status: 'ok',
        searchPresence: {
          results: [
            { url: 'https://other.com', title: 'Other', domain: 'other.com', tavilyScore: 0.6 },
            { url: 'https://blog.acme.com/widgets', title: 'Acme widgets', domain: 'blog.acme.com', tavilyScore: 0.55 },
          ],
        },
      },
    }
    const result = await buildCompetitorMap({
      query: 'best widgets',
      sourceUrl: 'https://acme.com/widgets',
      markdown: sampleMarkdown,
      pageIntelligence: samplePageIntelligence,
      discover: buildFakeDiscover(fixture),
    })
    expect(result.status).toBe('ok')
    expect(result.competitors.some(c => c.domain === 'blog.acme.com' || c.domain === 'acme.com')).toBe(false)
    expect(result.yourPresence).toBeDefined()
    if (result.yourPresence?.appearances?.length) {
      expect(result.yourPresence.domain).toBe('acme.com')
    }
  })
})
