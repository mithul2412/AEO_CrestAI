import express from 'express'
import analyzeRoute from '../routes/analyze.js'
import { chunkMarkdown } from '../services/chunkService.js'
import { evaluateRobots } from '../services/crawlService.js'
import { extractPageIntelligence } from '../services/extractService.js'
import { buildQueryIntelligence } from '../services/intelligenceScorer.js'
import { generateHighestImpactFix } from '../services/fixGeneratorService.js'
import { analyzeRetrieval } from '../services/retrievalService.js'
import { buildCompetitorCorpus } from '../services/competitorCorpusService.js'
import { compareUserVsCompetitors } from '../services/competitorGapService.js'
import { buildQueryDiscovery } from '../services/queryDiscoveryService.js'
import { buildSearchPresence, discoverCompetitors, normalizeTavilyCompetitors } from '../services/tavilyService.js'

const app = express()
app.use(express.json())
app.use('/analyze', analyzeRoute)

let portCounter = 4500

async function postJSON(path, body) {
  const port = portCounter++
  return new Promise((resolve, reject) => {
    const server = app.listen(port, async () => {
      try {
        const { default: fetch } = await import('node-fetch')
        const res = await fetch(`http://localhost:${port}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        server.close(() => resolve({ status: res.status, data }))
      } catch (e) {
        server.close(() => reject(e))
      }
    })
  })
}

const richMarkdown = `# Sales Enablement Platform

Sales Enablement Platform is a software category that helps mid-market SaaS teams onboard reps, centralize content, and improve sales execution.
According to Example Research, teams reduced ramp time by 43% in 2025.
See https://example.com/research and https://example.com/report for methodology.

## Best sales enablement platform for mid-market SaaS

The best sales enablement platform for mid-market SaaS teams gives reps searchable playbooks, onboarding paths, buyer content, and analytics in one workspace.
It helps revenue leaders reduce ramp time and compare content performance across teams.

## Pricing and implementation

- Setup time: 30 days
- Best for: mid-market SaaS
- Proof: based on 200 customer accounts`

test('robots parsing detects blocked and allowed AI crawlers', () => {
  const robots = evaluateRobots({
    robotsUrl: 'https://example.com/robots.txt',
    targetUrl: 'https://example.com/page',
    robotsText: `User-agent: OAI-SearchBot
Disallow: /

User-agent: GPTBot
Allow: /

User-agent: *
Allow: /`,
  })

  expect(robots.oaiSearchBot).toBe('blocked')
  expect(robots.gptBot).toBe('allowed')
  expect(robots.googlebot).toBe('allowed')
})

test('extractPageIntelligence reads metadata, schema, robots directives, and warnings', () => {
  const html = `<!doctype html>
  <html>
    <head>
      <title>Best Sales Enablement Platform</title>
      <meta name="description" content="Sales enablement comparison">
      <meta name="robots" content="noindex,max-snippet:120">
      <link rel="canonical" href="https://example.com/sales">
      <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question"}]}</script>
    </head>
    <body>
      <h1>Sales Enablement for Modern Teams</h1>
      <h2>How it works</h2>
      <table><tr><td>Pricing</td></tr></table>
    </body>
  </html>`

  const extraction = extractPageIntelligence({
    html,
    markdown: '# Sales Enablement\n\nReadable text.',
    url: 'https://example.com/sales',
  })

  expect(extraction.title).toBe('Best Sales Enablement Platform')
  expect(extraction.h1).toBe('Sales Enablement for Modern Teams')
  expect(extraction.canonical).toBe('https://example.com/sales')
  expect(extraction.schemaTypes).toContain('FAQPage')
  expect(extraction.robotsMeta.noindex).toBe(true)
  expect(extraction.warnings.join(' ')).toMatch(/noindex|tables/i)
})

test('chunkMarkdown preserves sections and stable chunk ids', () => {
  const chunks = chunkMarkdown(`${richMarkdown}\n\n${Array(220).fill('supporting detail').join(' ')}`)
  expect(chunks.length).toBeGreaterThan(0)
  expect(chunks[0].chunkId).toBe('c1')
  expect(chunks[0]).toHaveProperty('section')
  expect(chunks[0].position).toBeGreaterThanOrEqual(0)
})

test('retrieval scoring ranks the query-matched chunk and detects direct answer', () => {
  const chunks = chunkMarkdown(richMarkdown)
  const retrieval = analyzeRetrieval({
    chunks,
    query: 'best sales enablement platform for mid-market SaaS',
  })

  expect(retrieval.retrievalScore).toBeGreaterThan(50)
  expect(retrieval.topChunks[0].section).toMatch(/sales enablement/i)
  expect(retrieval.topChunks[0].directAnswer).toBe(true)
})

test('query intelligence returns readiness, answer diagnosis, and a fix', () => {
  const pageIntelligence = {
    access: {
      statusCode: 200,
      indexable: true,
      robots: { googlebot: 'allowed', oaiSearchBot: 'allowed', gptBot: 'allowed', perplexityBot: 'allowed' },
      warnings: [],
    },
    extraction: {
      title: 'Sales Enablement Platform',
      h1: 'Sales Enablement Platform',
      headings: ['Sales Enablement Platform', 'Best sales enablement platform for mid-market SaaS'],
      schemaTypes: ['Article'],
      wordCount: 150,
      warnings: [],
    },
  }
  const intelligence = buildQueryIntelligence({
    markdown: richMarkdown,
    query: 'best sales enablement platform for mid-market SaaS',
    pageIntelligence,
  })
  const fix = generateHighestImpactFix({
    query: 'best sales enablement platform for mid-market SaaS',
    intelligence,
    pageIntelligence,
  })

  expect(intelligence.citationReadiness.score).toBeGreaterThan(0)
  expect(intelligence.retrieval.topChunks.length).toBeGreaterThan(0)
  expect(intelligence.answerExtraction).toHaveProperty('answerScore')
  expect(fix).toHaveProperty('failureMode')
})

test('POST /analyze query mode preserves scoring output and adds intelligence output', async () => {
  const { status, data } = await postJSON('/analyze', {
    markdown: richMarkdown,
    query: 'best sales enablement platform for mid-market SaaS',
    pageIntelligence: {
      access: {
        statusCode: 200,
        indexable: true,
        robots: { googlebot: 'allowed', oaiSearchBot: 'allowed', gptBot: 'allowed', perplexityBot: 'allowed' },
        warnings: [],
      },
      extraction: {
        title: 'Sales Enablement Platform',
        h1: 'Sales Enablement Platform',
        headings: ['Sales Enablement Platform'],
        schemaTypes: ['Article'],
        wordCount: 100,
        warnings: [],
      },
    },
  })

  expect(status).toBe(200)
  expect(data).toHaveProperty('contentScore')
  expect(data).toHaveProperty('geuScore')
  expect(data).toHaveProperty('queryScore')
  expect(data.intelligence.retrieval).toHaveProperty('retrievalScore')
  expect(data.intelligence.highestImpactFix).toHaveProperty('fix')
})

test('Tavily competitor filtering excludes source domain, duplicate, and bad URLs', () => {
  const competitors = normalizeTavilyCompetitors([
    { title: 'Own page', url: 'https://example.com/guide', content: 'Own domain', score: 0.99 },
    { title: 'PDF', url: 'https://other.com/report.pdf', content: 'PDF', score: 0.9 },
    { title: 'Login', url: 'https://other.com/login', content: 'Login', score: 0.8 },
    { title: 'Good result', url: 'https://competitor.com/best-sales-enablement', content: 'Compare sales tools', score: 0.7 },
    { title: 'Duplicate', url: 'https://competitor.com/best-sales-enablement', content: 'Duplicate', score: 0.6 },
  ], {
    sourceUrl: 'https://example.com/page',
    maxResults: 3,
  })

  expect(competitors).toHaveLength(1)
  expect(competitors[0].url).toBe('https://competitor.com/best-sales-enablement')
  expect(competitors[0].snippet).toBe('Compare sales tools')
})

test('query discovery builds brand and category query candidates', () => {
  const discovery = buildQueryDiscovery({
    query: 'best mobile providers',
    sourceUrl: 'https://www.xfinity.com/mobile/',
    markdown: '# Xfinity Mobile plans\n\nXfinity Mobile offers unlimited and by-the-gig wireless plans.',
    pageIntelligence: {
      extraction: {
        title: 'Xfinity Mobile Plans',
        h1: 'Xfinity Mobile plans',
        headings: ['Xfinity Mobile plans', 'Unlimited data options'],
      },
    },
  })

  expect(discovery.status).toBe('ok')
  expect(discovery.brand).toMatch(/xfinity/i)
  expect(discovery.candidates).toContain('best mobile providers')
  expect(discovery.candidates.join(' ')).toMatch(/xfinity/i)
})

test('search presence reports source-domain rank from raw search results', () => {
  const presence = buildSearchPresence([
    { title: 'Competitor', url: 'https://competitor.com/mobile', content: 'Other mobile plans', score: 0.9 },
    { title: 'Xfinity Mobile', url: 'https://www.xfinity.com/mobile/', content: 'Xfinity mobile plans', score: 0.8 },
  ], {
    sourceUrl: 'https://www.xfinity.com/mobile/',
    maxResults: 10,
  })

  expect(presence.status).toBe('ok')
  expect(presence.sourceDomain).toBe('xfinity.com')
  expect(presence.domainRank).toBe(2)
  expect(presence.sourceResult.title).toBe('Xfinity Mobile')
})

test('Tavily discovery returns disabled state without an API key', async () => {
  const result = await discoverCompetitors({
    query: 'best sales enablement platform',
    sourceUrl: 'https://example.com/page',
    client: null,
  })

  expect(result.status).toBe('disabled')
  expect(result.reason).toMatch(/TAVILY_API_KEY/i)
  expect(result.competitors).toEqual([])
})

test('competitor corpus keeps successful pages when one competitor fetch fails', async () => {
  const corpus = await buildCompetitorCorpus({
    query: 'best sales enablement platform',
    sourceUrl: 'https://example.com/page',
    discover: async () => ({
      status: 'ok',
      query: 'best sales enablement platform',
      competitors: [
        { title: 'Winner guide', url: 'https://competitor.com/guide', snippet: 'A strong guide.' },
        { title: 'Broken guide', url: 'https://broken.com/guide', snippet: 'Broken.' },
      ],
    }),
    fetchMarkdown: async (url) => {
      if (url.includes('broken.com')) throw new Error('Jina failed for broken competitor')
      return {
        markdown: '# Best sales enablement platform\n\nThe best sales enablement platform for mid-market SaaS is one that includes onboarding paths, searchable playbooks, analytics, and 2025 customer proof.',
        charCount: 180,
      }
    },
  })

  expect(corpus.competitors).toHaveLength(1)
  expect(corpus.competitors[0].sourceId).toBe('competitor-1')
  expect(corpus.competitors[0].chunks.length).toBeGreaterThan(0)
  expect(corpus.failures.join(' ')).toMatch(/Jina failed/i)
})

test('competitor gap chooses competitor and explains answer/evidence advantages', () => {
  const userChunks = [
    {
      chunkId: 'c1',
      section: 'Features',
      position: 0.78,
      text: 'Revenue teams often struggle with scattered content, slow onboarding, and inconsistent follow-up across accounts.',
      wordCount: 13,
    },
  ]
  const competitorPages = [
    {
      title: 'Best Sales Enablement Software',
      url: 'https://competitor.com/best-sales-enablement',
      sourceId: 'competitor-1',
      chunks: [
        {
          chunkId: 'competitor-1-c1',
          sourceId: 'competitor-1',
          section: 'Best sales enablement platform for mid-market SaaS',
          position: 0.08,
          text: 'The best sales enablement platform for mid-market SaaS is software that gives reps onboarding paths, searchable playbooks, buyer content, analytics, and 2025 proof. According to Example Research, teams reduced ramp time by 43%.',
          wordCount: 31,
        },
      ],
    },
  ]

  const gap = compareUserVsCompetitors({
    query: 'best sales enablement platform for mid-market SaaS',
    userChunks,
    competitorPages,
  })

  expect(gap.status).toBe('ok')
  expect(gap.winner).toBe('competitor')
  expect(gap.failureMode).toBe('Answer Failure')
  expect(gap.missingAttributes).toContain('direct answer')
  expect(gap.missingAttributes).toContain('stronger evidence')
  expect(gap.winningCompetitor.url).toBe('https://competitor.com/best-sales-enablement')
})

test('POST /analyze with sourceUrl adds disabled competitor intelligence when Tavily is not configured', async () => {
  const originalTavilyKey = process.env.TAVILY_API_KEY
  delete process.env.TAVILY_API_KEY

  try {
    const { status, data } = await postJSON('/analyze', {
      markdown: richMarkdown,
      query: 'best sales enablement platform for mid-market SaaS',
      sourceUrl: 'https://example.com/sales-enablement',
      pageIntelligence: {
        access: {
          statusCode: 200,
          indexable: true,
          robots: { googlebot: 'allowed', oaiSearchBot: 'allowed', gptBot: 'allowed', perplexityBot: 'allowed' },
          warnings: [],
        },
        extraction: {
          title: 'Sales Enablement Platform',
          h1: 'Sales Enablement Platform',
          headings: ['Sales Enablement Platform'],
          schemaTypes: ['Article'],
          wordCount: 100,
          warnings: [],
        },
      },
    })

    expect(status).toBe(200)
    expect(data.intelligence.competitorIntelligence.status).toBe('disabled')
    expect(data.intelligence.competitorIntelligence.discovery.reason).toMatch(/TAVILY_API_KEY/i)
    expect(data).toHaveProperty('contentScore')
    expect(data).toHaveProperty('verdicts')
  } finally {
    if (originalTavilyKey) process.env.TAVILY_API_KEY = originalTavilyKey
  }
})
