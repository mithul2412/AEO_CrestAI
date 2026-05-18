import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractCanonicalProfile } from '../agentic/services/profileExtractor.js'
import { CANONICAL_PROFILE_VERSION, validateCanonicalProfile } from '../agentic/schemas/canonicalProfileSchema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.join(__dirname, 'fixtures', 'agenticSampleMarkdown.md')
const fixtureMarkdown = fs.readFileSync(fixturePath, 'utf8')

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

test('extractCanonicalProfile builds a valid canonical profile from a fixture', () => {
  const profile = buildProfile()
  const validation = validateCanonicalProfile(profile)

  expect(validation.ok).toBe(true)
  expect(profile.version).toBe(CANONICAL_PROFILE_VERSION)
  expect(profile.profileId).toBe('profile-crest-example')
  expect(profile.slug).toBe('crest-example')
  expect(profile.business.domain).toBe('crest.example')
  expect(profile.business.name).toBe('Crest AI Readiness Services')
  expect(profile.source.analysisScores.overallScore).toBe(72)
  expect(profile.pages[0]).toMatchObject({
    url: 'https://crest.example/services/ai-readiness',
    title: 'Crest AI Readiness Services',
    pageType: 'pricing_page',
  })
  expect(profile.pages[0].headings).toContain('Managed AI Readiness Service')
})

test('extractCanonicalProfile extracts source-grounded contacts and action links', () => {
  const profile = buildProfile()

  expect(profile.business.contact.email).toBe('readiness@crest.example')
  expect(profile.business.contact.phone).toBe('(415) 555-0188')
  expect(profile.business.contact.bookingUrl).toBe('https://crest.example/demo')
  expect(profile.business.contact.quoteUrl).toBe('https://crest.example/quote')
  expect(profile.business.contact.contactUrl).toBe('https://crest.example/contact')

  expect(profile.actions).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'book_demo', url: 'https://crest.example/demo' }),
    expect.objectContaining({ type: 'request_quote', url: 'https://crest.example/quote' }),
    expect.objectContaining({ type: 'contact', url: 'https://crest.example/contact' }),
    expect.objectContaining({ type: 'email', url: 'mailto:readiness@crest.example' }),
    expect.objectContaining({ type: 'call', url: 'tel:4155550188' }),
  ]))
})

test('extractCanonicalProfile extracts services, products, FAQs, pricing, and grounded claims', () => {
  const profile = buildProfile()

  expect(profile.services).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'service-managed-ai-readiness-service',
      name: 'Managed AI Readiness Service',
      sourceText: 'Managed AI Readiness Service',
    }),
  ]))
  expect(profile.products).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'product-product-metadata-platform',
      name: 'Product Metadata Platform',
      sourceText: 'Product Metadata Platform',
    }),
  ]))
  expect(profile.faqs).toHaveLength(2)
  expect(profile.faqs[0]).toMatchObject({
    question: 'What does Crest generate for AI systems?',
    answer: 'Crest generates llms.txt, Schema.org JSON-LD, action metadata, and a hosted AI-readable profile.',
    sourceUrl: 'https://crest.example/services/ai-readiness',
  })
  expect(profile.claims).toEqual(expect.arrayContaining([
    expect.objectContaining({
      claimType: 'pricing',
      sourceText: 'Pricing starts at $8,000 per month for managed readiness programs.',
    }),
    expect.objectContaining({
      claim: "According to Crest's public methodology, every generated claim should map back to source text.",
      sourceUrl: 'https://crest.example/services/ai-readiness',
    }),
  ]))
})

test('extractCanonicalProfile does not invent unsupported facts when markdown is sparse', () => {
  const profile = extractCanonicalProfile({
    url: 'https://example.com/',
    markdown: '# Example\n\nSimple page copy.',
    analysis: {},
    sourceSignals: { sourceUrl: 'https://example.com/', origin: 'https://example.com' },
  })

  expect(profile.business.domain).toBe('example.com')
  expect(profile.business.name).toBe('Example')
  expect(profile.business.contact.email).toBe('')
  expect(profile.business.contact.phone).toBe('')
  expect(profile.services).toEqual([])
  expect(profile.products).toEqual([])
  expect(profile.actions).toEqual([])
  expect(profile.claims).toEqual([])
  expect(profile.metadata.warnings).toContain('No service or product candidates detected.')
})
