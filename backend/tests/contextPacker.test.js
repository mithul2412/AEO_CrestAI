import {
  packContextForBaseline,
  packContextForChat,
  packContextForQuery,
} from '../services/contextPacker.js'

const intro = '# Acme CRM\nAcme is a CRM for small business teams. ' + 'introduction '.repeat(500)
const middle = '\n\n## Pricing tiers\nStarter is $19 per month. Pro is $49 per month. Enterprise is custom. ' +
  'According to a 2025 Forrester report, 40% of small businesses pick the Pro tier. ' + 'pricing '.repeat(500)
const tail = '\n\n## FAQ\nWhat is the best CRM for small business? Acme CRM is the best for small business teams under 50 seats because it provides a $19 starter plan and includes 24/7 support. ' + 'faq '.repeat(300)

const longMarkdown = intro + middle + tail

const pageIntelligence = {
  extraction: {
    title: 'Acme CRM | Pricing',
    h1: 'Acme CRM pricing',
    metaDescription: 'Compare Acme CRM plans for small business.',
    headings: ['Pricing tiers', 'FAQ'],
  },
}

function tokensToWords(tokens) {
  return Math.max(40, Math.floor(tokens * 0.75))
}

describe('packContextForQuery', () => {
  test('surfaces a section that does NOT appear in the first 1000 words when the query targets it', () => {
    const packed = packContextForQuery({
      markdown: longMarkdown,
      query: 'what is the best CRM for small business',
      pageIntelligence,
      budgetTokens: 1500,
    })
    expect(packed).toMatch(/PAGE SKELETON/)
    expect(packed).toMatch(/TOP CHUNKS RANKED BY QUERY RELEVANCE/)
    expect(packed.toLowerCase()).toContain('faq')
    expect(packed.toLowerCase()).toContain('best crm for small business')
  })

  test('respects token budget approximately (within 10% of word budget)', () => {
    const budget = 1500
    const packed = packContextForQuery({
      markdown: longMarkdown,
      query: 'pricing tiers',
      pageIntelligence,
      budgetTokens: budget,
    })
    const words = packed.split(/\s+/).filter(Boolean).length
    expect(words).toBeLessThanOrEqual(Math.ceil(tokensToWords(budget) * 1.15))
  })

  test('falls back to baseline when query is empty', () => {
    const packed = packContextForQuery({
      markdown: longMarkdown,
      query: '',
      pageIntelligence,
      budgetTokens: 1200,
    })
    expect(packed).toMatch(/PAGE SKELETON/)
    expect(packed).toMatch(/STRUCTURAL SAMPLE/)
  })

  test('handles empty markdown gracefully', () => {
    const packed = packContextForQuery({
      markdown: '',
      query: 'best CRM',
      pageIntelligence,
      budgetTokens: 1000,
    })
    expect(packed).toMatch(/PAGE SKELETON/)
    expect(packed).toMatch(/NO RETRIEVABLE CHUNKS/)
  })
})

describe('packContextForBaseline', () => {
  test('emits skeleton and structural sample sections', () => {
    const packed = packContextForBaseline({
      markdown: longMarkdown,
      pageIntelligence,
      budgetTokens: 1500,
    })
    expect(packed).toMatch(/PAGE SKELETON/)
    expect(packed).toMatch(/STRUCTURAL SAMPLE/)
  })

  test('surfaces high-evidence chunk content (numbers/dates)', () => {
    const packed = packContextForBaseline({
      markdown: longMarkdown,
      pageIntelligence,
      budgetTokens: 1500,
    })
    expect(packed).toMatch(/2025|Forrester|40%/)
  })
})

describe('packContextForChat', () => {
  test('routes to query packer when query is present', () => {
    const packed = packContextForChat({
      markdown: longMarkdown,
      query: 'best CRM',
      pageIntelligence,
      budgetTokens: 1500,
    })
    expect(packed).toMatch(/TOP CHUNKS RANKED BY QUERY RELEVANCE/)
  })

  test('routes to baseline packer when query is empty', () => {
    const packed = packContextForChat({
      markdown: longMarkdown,
      query: '',
      pageIntelligence,
      budgetTokens: 1500,
    })
    expect(packed).toMatch(/STRUCTURAL SAMPLE/)
  })
})
