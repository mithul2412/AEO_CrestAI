import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileArtifacts } from '../agentic/services/artifactCompiler.js'
import { validateArtifacts } from '../agentic/services/artifactValidator.js'
import { computeEngineReadiness } from '../agentic/services/engineReadinessService.js'
import { extractCanonicalProfile } from '../agentic/services/profileExtractor.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtureMarkdown = fs.readFileSync(path.join(__dirname, 'fixtures', 'agenticSampleMarkdown.md'), 'utf8')

function buildProfile() {
  return extractCanonicalProfile({
    url: 'https://crest.example/services/ai-readiness',
    markdown: fixtureMarkdown,
    query: 'what does crest generate for ai systems?',
    analysis: {
      overallScore: 72,
      contentScore: 74,
      geuScore: 68,
      queryScore: 61,
      gapScore: 13,
    },
    sourceSignals: {
      sourceUrl: 'https://crest.example/services/ai-readiness',
      origin: 'https://crest.example',
      llmsTxt: { present: false, url: null },
      llmsFullTxt: { present: false, url: null },
    },
  })
}

test('compileArtifacts returns every required artifact from the canonical profile', () => {
  const profile = buildProfile()
  const artifacts = compileArtifacts(profile, { profileBaseUrl: 'http://localhost:3001/agent' })

  expect(artifacts.llmsTxt).toContain('# Crest AI Readiness Services')
  expect(artifacts.llmsTxt).toContain('http://localhost:3001/agent/crest-example')
  expect(artifacts.llmsFullTxt).toContain('Source URL: https://crest.example/services/ai-readiness')
  expect(artifacts.alternateLinkSnippet).toBe('<link rel="alternate" type="application/json" href="http://localhost:3001/agent/crest-example.json" title="AI-readable business profile" />')
  expect(artifacts.faqBlock).toHaveLength(2)
  expect(artifacts.actionMetadata).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'book_demo', url: 'https://crest.example/demo' }),
    expect.objectContaining({ type: 'request_quote', url: 'https://crest.example/quote' }),
    expect.objectContaining({ type: 'email', url: 'mailto:readiness@crest.example' }),
  ]))
  expect(artifacts.claimSourceMap).toEqual(expect.arrayContaining([
    expect.objectContaining({
      claimType: 'pricing',
      sourceText: 'Pricing starts at $8,000 per month for managed readiness programs.',
      approvalRequired: true,
    }),
  ]))
  expect(artifacts.structuredServiceProductData).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'service', name: 'Managed AI Readiness Service' }),
    expect.objectContaining({ type: 'product', name: 'Product Metadata Platform' }),
  ]))
  expect(artifacts.robotsRecommendations.map(item => item.engine)).toEqual(['ChatGPT', 'Perplexity', 'Google', 'Claude'])
})

test('JSON-LD generator returns valid sourced schema objects without ratings or reviews', () => {
  const artifacts = compileArtifacts(buildProfile())

  expect(artifacts.jsonLd.length).toBeGreaterThanOrEqual(5)
  artifacts.jsonLd.forEach(item => {
    expect(item).toHaveProperty('@context', 'https://schema.org')
    expect(item).toHaveProperty('@type')
    expect(() => JSON.stringify(item)).not.toThrow()
  })
  expect(artifacts.jsonLd).toEqual(expect.arrayContaining([
    expect.objectContaining({ '@type': 'Organization', name: 'Crest AI Readiness Services' }),
    expect.objectContaining({ '@type': 'WebPage', url: 'https://crest.example/services/ai-readiness' }),
    expect.objectContaining({ '@type': 'Service', name: 'Managed AI Readiness Service' }),
    expect.objectContaining({ '@type': 'Product', name: 'Product Metadata Platform' }),
    expect.objectContaining({ '@type': 'FAQPage' }),
  ]))
  expect(JSON.stringify(artifacts.jsonLd)).not.toMatch(/AggregateRating|Review/)
})

test('validateArtifacts passes fixture artifacts and flags approval-required pricing', () => {
  const profile = buildProfile()
  const artifacts = compileArtifacts(profile)
  const validation = validateArtifacts(profile, artifacts)

  expect(validation.ok).toBe(true)
  expect(validation.errors).toEqual([])
  expect(validation.approvalRequired).toBe(true)
  expect(validation.warnings).toEqual(expect.arrayContaining([
    expect.stringContaining('pricing claim requires approval'),
  ]))
  expect(validation.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'jsonld-array', status: 'pass' }),
    expect.objectContaining({ id: 'llms-text', status: 'pass' }),
    expect.objectContaining({ id: 'llms-full-text', status: 'pass' }),
  ]))
})

test('validateArtifacts warns on invalid action URLs, missing claim sources, and risky claims', () => {
  const profile = buildProfile()
  profile.actions.push({
    id: 'action-bad-url',
    type: 'contact',
    label: 'Bad URL',
    url: 'javascript:alert(1)',
    status: 'active',
    sourceUrl: profile.source.sourceUrl,
    fallbackContact: '',
    confidence: 0.2,
  })
  profile.claims.push({
    claim: 'Crest is the #1 guaranteed platform.',
    sourceUrl: '',
    sourceText: '',
    claimType: 'trust',
    riskLevel: 'high',
    confidence: 0.1,
  })

  const validation = validateArtifacts(profile, compileArtifacts(profile))

  expect(validation.ok).toBe(true)
  expect(validation.approvalRequired).toBe(true)
  expect(validation.warnings).toEqual(expect.arrayContaining([
    expect.stringContaining('invalid URL'),
    expect.stringContaining('claim missing source'),
    expect.stringContaining('risky claim requires review'),
  ]))
})

test('computeEngineReadiness scores all target engines from universal artifacts', () => {
  const profile = buildProfile()
  const artifacts = compileArtifacts(profile)
  const readiness = computeEngineReadiness(profile, artifacts, {
    llmsTxt: { present: false, url: null },
    llmsFullTxt: { present: false, url: null },
  })

  expect(Object.keys(readiness)).toEqual(['chatgpt', 'perplexity', 'google', 'claude'])
  expect(readiness.chatgpt.score).toBeGreaterThan(70)
  expect(readiness.perplexity.score).toBeGreaterThan(70)
  expect(readiness.google.score).toBeGreaterThan(70)
  expect(readiness.claude.score).toBeGreaterThan(70)
  expect(readiness.chatgpt.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'oai-searchbot', passed: true }),
  ]))
})
