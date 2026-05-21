// Tests for analyze route — scoring algorithms, validation, edge cases
import express from 'express'
import { computeGeoScore } from '../utils/geoScorer.js'
import { computeGeuScore } from '../utils/geuScorer.js'
import analyzeRoute, {
  FAILURE_MODES,
  fallbackQuerySuggestions,
  dynamicFixFromVerdicts,
  normalizeDynamicFixPayload,
  normalizeQueryPayload,
  normalizeQuerySuggestionsPayload,
} from '../routes/analyze.js'

const app = express()
app.use(express.json())
app.use('/analyze', analyzeRoute)

let portCounter = 4200

async function postJSON(path, body) {
  const port = portCounter++
  return new Promise((resolve, reject) => {
    const server = app.listen(port, async () => {
      try {
        const { default: fetch } = await import('node-fetch')
        const res = await fetch(`http://localhost:${port}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        const data = await res.json()
        server.close(() => resolve({ status: res.status, data }))
      } catch (e) {
        server.close(() => reject(e))
      }
    })
  })
}

const sampleMarkdown = `# Test Page
This is a test page with content about AEO optimization.
It provides information about answer engines.
According to MIT Research, 40% of queries are answered directly.
See https://example.com and https://research.example.com for more.
- Item one
- Item two
- Item three
`

const minimalMarkdown = 'Hello world.'

const emptyMarkdown = ''

/* ── GEO/GEU scoring (unit) ───────────────── */

test('no query -> contentScore and geuScore still computed', () => {
  const { score: contentScore, checks } = computeGeoScore(sampleMarkdown)
  const { score: geuScore, checks: geuChecks } = computeGeuScore(sampleMarkdown)
  expect(contentScore).toBeGreaterThanOrEqual(0)
  expect(geuScore).toBeGreaterThanOrEqual(0)
  expect(checks).toHaveLength(7)
  expect(geuChecks).toHaveLength(4)
})

test('checks array has correct structure', () => {
  const { checks } = computeGeoScore(sampleMarkdown)
  checks.forEach(c => {
    expect(c).toHaveProperty('id')
    expect(c).toHaveProperty('label')
    expect(c).toHaveProperty('weight')
    expect(c).toHaveProperty('passed')
    expect(typeof c.passed).toBe('boolean')
  })
})

test('geuChecks array has correct structure', () => {
  const { checks } = computeGeuScore(sampleMarkdown)
  checks.forEach(c => {
    expect(c).toHaveProperty('id')
    expect(c).toHaveProperty('label')
    expect(c).toHaveProperty('weight')
    expect(c).toHaveProperty('passed')
  })
})

/* ── Edge: empty and minimal content ──────── */

test('empty markdown produces zero GEO score', () => {
  const { score, checks } = computeGeoScore(emptyMarkdown)
  expect(score).toBe(0)
  expect(checks.every(c => !c.passed)).toBe(true)
})

test('empty markdown produces valid GEU result', () => {
  const { score, checks } = computeGeuScore(emptyMarkdown)
  expect(score).toBeGreaterThanOrEqual(0)
  expect(score).toBeLessThanOrEqual(100)
  expect(checks).toHaveLength(4)
})

test('minimal markdown scores low on GEO', () => {
  const { score } = computeGeoScore(minimalMarkdown)
  expect(score).toBeLessThan(50)
})

/* ── Route validation ─────────────────────── */

test('missing markdown returns 400', async () => {
  const { status, data } = await postJSON('/analyze', {})
  expect(status).toBe(400)
  expect(data.error).toMatch(/markdown/i)
})

test('null markdown returns 400', async () => {
  const { status, data } = await postJSON('/analyze', { markdown: null })
  expect(status).toBe(400)
  expect(data.error).toMatch(/markdown/i)
})

test('empty string markdown returns 400', async () => {
  const { status, data } = await postJSON('/analyze', { markdown: '' })
  expect(status).toBe(400)
  expect(data.error).toMatch(/markdown/i)
})

/* ── GEO check-specific edge cases ────────── */

test('FAQ check requires 3+ questions AND a heading question', () => {
  const withFaq = `# What is AEO?
Is it helpful? Does it work? Can I use it?`
  const { checks } = computeGeoScore(withFaq)
  const faq = checks.find(c => c.id === 'faq')
  expect(faq.passed).toBe(true)
})

test('FAQ check fails with questions but no heading question', () => {
  const noHeadingQ = `# AEO Guide
Is it helpful? Does it work? Can I use it?`
  const { checks } = computeGeoScore(noHeadingQ)
  const faq = checks.find(c => c.id === 'faq')
  expect(faq.passed).toBe(false)
})

test('stats check requires 2+ stat patterns', () => {
  const withStats = 'Revenue grew 40% and we have 5 million users worldwide.'
  const { checks } = computeGeoScore(withStats)
  const stats = checks.find(c => c.id === 'stats')
  expect(stats.passed).toBe(true)
})

test('stats check fails with only 1 stat', () => {
  const onestat = 'Revenue grew 40% last quarter.'
  const { checks } = computeGeoScore(onestat)
  const stats = checks.find(c => c.id === 'stats')
  expect(stats.passed).toBe(false)
})

test('citations check requires 2+ https URLs', () => {
  const withCitations = 'See https://a.com and https://b.com for details.'
  const { checks } = computeGeoScore(withCitations)
  const citations = checks.find(c => c.id === 'citations')
  expect(citations.passed).toBe(true)
})

test('citations check fails with 0-1 URLs', () => {
  const oneUrl = 'See https://a.com for details.'
  const { checks } = computeGeoScore(oneUrl)
  const citations = checks.find(c => c.id === 'citations')
  expect(citations.passed).toBe(false)
})

test('schema check detects schema.org', () => {
  const withSchema = 'This page uses schema.org/Article structured data.'
  const { checks } = computeGeoScore(withSchema)
  const schema = checks.find(c => c.id === 'schema')
  expect(schema.passed).toBe(true)
})

test('comparison check detects vs/versus/alternative', () => {
  const withComp = 'Product A vs Product B comparison shows clear differences.'
  const { checks } = computeGeoScore(withComp)
  const comparison = checks.find(c => c.id === 'comparison')
  expect(comparison.passed).toBe(true)
})

test('comparison check fails without comparison words', () => {
  const noComp = 'Product A is great for small businesses.'
  const { checks } = computeGeoScore(noComp)
  const comparison = checks.find(c => c.id === 'comparison')
  expect(comparison.passed).toBe(false)
})

test('llmstxt check detects llms.txt mention', () => {
  const withLlms = 'We serve a llms.txt file for AI crawlers.'
  const { checks } = computeGeoScore(withLlms)
  const llmstxt = checks.find(c => c.id === 'llmstxt')
  expect(llmstxt.passed).toBe(true)
})

/* ── GEU check-specific edge cases ────────── */

test('standalone sentences check requires 3+ subject-verb sentences', () => {
  const good = 'AEO is important. Content provides value. Strategy helps businesses.'
  const { checks } = computeGeuScore(good)
  const standalone = checks.find(c => c.id === 'standalone')
  expect(standalone.passed).toBe(true)
})

test('standalone sentences check fails with fragments', () => {
  const bad = 'Important stuff. Very good. Nice.'
  const { checks } = computeGeuScore(bad)
  const standalone = checks.find(c => c.id === 'standalone')
  expect(standalone.passed).toBe(false)
})

test('frontloaded check requires answer-like words in first 20%', () => {
  const good = 'AEO is a methodology that helps content rank in AI engines. ' +
    Array(200).fill('filler word').join(' ')
  const { checks } = computeGeuScore(good)
  const frontloaded = checks.find(c => c.id === 'frontloaded')
  expect(frontloaded.passed).toBe(true)
})

test('sourced claims check requires 2+ sourced patterns', () => {
  const good = 'According to Stanford University research, 40% of queries use AI.'
  const { checks } = computeGeuScore(good)
  const sourced = checks.find(c => c.id === 'sourced')
  expect(sourced.passed).toBe(true)
})

test('coherent opening fails when first sentence starts with pronoun', () => {
  const bad = 'It is a system for optimization. They use it widely.'
  const { checks } = computeGeuScore(bad)
  const coherent = checks.find(c => c.id === 'coherent')
  expect(coherent.passed).toBe(false)
})

test('coherent opening passes with proper noun start', () => {
  const good = 'AEO stands for Answer Engine Optimization. Marketing teams adopt it.'
  const { checks } = computeGeuScore(good)
  const coherent = checks.find(c => c.id === 'coherent')
  expect(coherent.passed).toBe(true)
})

/* ── Score determinism ────────────────────── */

test('same markdown produces same GEO score', () => {
  const { score: s1 } = computeGeoScore(sampleMarkdown)
  const { score: s2 } = computeGeoScore(sampleMarkdown)
  expect(s1).toBe(s2)
})

test('query payload normalizer preserves controlled failureMode enum', () => {
  const payload = normalizeQueryPayload('Qwen 3.6 Plus', {
    verdict: 'The answer is related but indirect.',
    queryMatchScore: 52,
    failureMode: 'Intent Mismatch',
    topGap: 'Missing exact plan answer.',
    suggestedFix: 'Add a direct answer block.',
  })

  expect(FAILURE_MODES).toContain(payload.failureMode)
  expect(payload.failureMode).toBe('Intent Mismatch')
})

test('query payload normalizer falls back for invalid failureMode', () => {
  const payload = normalizeQueryPayload('Nemotron 120B', {
    verdict: 'The answer is weak.',
    queryMatchScore: 38,
    failureMode: 'Vibes Failure',
  })

  expect(payload.failureMode).toBe('Answer Failure')
})

test('query suggestion normalizer returns three clean questions', () => {
  const payload = normalizeQuerySuggestionsPayload('Qwen 3.6 Plus', {
    queries: [
      'What is Test pricing',
      'How does Test compare to competitors?',
      'How does Test compare to competitors?',
      'What are the main Test plans?',
    ],
  }, ['Fallback one?', 'Fallback two?', 'Fallback three?'])

  expect(payload.queries).toEqual([
    'What is Test pricing?',
    'How does Test compare to competitors?',
    'What are the main Test plans?',
  ])
})

test('query suggestion normalizer falls back when model returns too few queries', () => {
  const fallback = ['Fallback one?', 'Fallback two?', 'Fallback three?']
  const payload = normalizeQuerySuggestionsPayload('Qwen 3.6 Plus', {
    queries: ['Only one query?'],
  }, fallback)

  expect(payload.queries).toBe(fallback)
})

test('fallback query suggestions are derived from page identity', () => {
  const suggestions = fallbackQuerySuggestions({
    sourceUrl: 'https://developer.example.com/pricing',
    pageIntelligence: { extraction: { title: 'Developer Pricing | Example' } },
  })

  expect(suggestions).toHaveLength(3)
  expect(suggestions[0]).toMatch(/Developer/i)
})

test('dynamic fix normalizer preserves model-specific recommendation', () => {
  const fallback = {
    failureMode: 'Retrieval Failure',
    fix: 'Fallback fix',
    whereToEdit: 'Opening',
    why: 'Fallback reason',
    exampleCopy: 'Fallback copy',
    expectedLift: { retrievalScore: '+5', answerScore: '+4', evidenceScore: '+0' },
    confidence: 'medium',
  }
  const payload = normalizeDynamicFixPayload('Qwen 3.6 Plus', {
    failureMode: 'Evidence Failure',
    fix: 'Add a sourced answer sentence that names the target query.',
    whereToEdit: 'First pricing section',
    why: 'The page needs proof attached to the exact answer.',
    exampleCopy: 'Developer pricing starts at $X and includes Y, according to Z.',
    expectedLift: { retrievalScore: '+8', answerScore: '+10', evidenceScore: '+12' },
    confidence: 'high',
  }, fallback)

  expect(payload.fix).toMatch(/sourced answer/i)
  expect(payload.failureMode).toBe('Evidence Failure')
  expect(payload.fallback).toBe(false)
  expect(payload.model).toBe('Qwen 3.6 Plus')
})

test('dynamic fix normalizer falls back when required fields are missing', () => {
  const fallback = {
    failureMode: 'Retrieval Failure',
    fix: 'Fallback fix',
    whereToEdit: 'Opening',
    why: 'Fallback reason',
    expectedLift: { retrievalScore: '+5', answerScore: '+4', evidenceScore: '+0' },
    confidence: 'medium',
  }
  const payload = normalizeDynamicFixPayload('Qwen 3.6 Plus', {
    fix: '',
  }, fallback)

  expect(payload.fix).toBe('Fallback fix')
  expect(payload.fallback).toBe(true)
})

test('dynamic fix can be derived from model verdicts before static fallback', () => {
  const fallback = {
    failureMode: 'Retrieval Failure',
    fix: 'Static fallback fix',
    whereToEdit: 'Opening',
    why: 'Static fallback reason',
    expectedLift: { retrievalScore: '+5', answerScore: '+4', evidenceScore: '+0' },
    confidence: 'medium',
  }
  const fix = dynamicFixFromVerdicts([{
    model: 'Nemotron 120B',
    failureMode: 'Answer Failure',
    suggestedFix: 'Add a direct answer sentence for the exact query.',
    topGap: 'The answer is implied but not stated.',
  }], fallback)

  expect(fix.fix).toMatch(/direct answer sentence/i)
  expect(fix.why).toMatch(/implied/i)
  expect(fix.source).toBe('model-verdict')
  expect(fix.fallback).toBe(false)
})

test('same markdown produces same GEU score', () => {
  const { score: s1 } = computeGeuScore(sampleMarkdown)
  const { score: s2 } = computeGeuScore(sampleMarkdown)
  expect(s1).toBe(s2)
})

/* ── Max score achievable ─────────────────── */

test('rich content with all signals scores high on GEO', () => {
  const rich = `# What is AEO?
Is AEO important? Does it help? Can it improve rankings?

## How does AEO work?
AEO works by optimizing 40% of content. It supports 5 million users.

See https://example.com and https://research.com for details.

Uses application/ld+json schema.

AEO vs SEO: AEO is better than traditional SEO.

### Why choose AEO?
- Point one for structure
- Point two for clarity
- Point three for extractability
- Point four for good measure

${Array(200).fill('additional content word').join(' ')}

Compliant with llms.txt standards.`
  const { score } = computeGeoScore(rich)
  expect(score).toBe(100)
})
