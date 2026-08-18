import { buildQueryDiscovery, extractCategory } from '../services/queryDiscoveryService.js'

const crmPage = {
  extraction: {
    title: 'HubSpot CRM Software',
    h1: 'CRM Software for Small Businesses',
    headings: ['Pricing', 'Alternatives'],
  },
}

describe('query discovery category extraction', () => {
  test('uses query intent first and preserves product category', () => {
    expect(extractCategory({
      query: 'best CRM for small business',
      brand: 'HubSpot',
      pageIntelligence: crmPage,
    })).toBe('CRM for small business')
  })

  test('removes brand and pricing intent from category queries', () => {
    expect(extractCategory({
      query: 'HubSpot pricing plans',
      brand: 'HubSpot',
      pageIntelligence: crmPage,
    })).toBe('CRM for small business')
  })

  test('keeps alternatives intent category-specific rather than brand-specific', () => {
    expect(extractCategory({
      query: 'HubSpot alternatives for small business CRM',
      brand: 'HubSpot',
      pageIntelligence: crmPage,
    })).toBe('CRM for small business')
  })

  test('extracts comparison categories instead of treating the other brand as the category', () => {
    expect(extractCategory({
      query: 'Salesforce vs HubSpot for small business CRM',
      brand: 'HubSpot',
      pageIntelligence: crmPage,
    })).toBe('CRM for small business')
  })

  test('keeps generic product categories from non-branded pages', () => {
    expect(extractCategory({
      query: 'how to choose payroll software for startups',
      brand: '',
      pageIntelligence: {},
      markdown: '',
    })).toBe('payroll for startups')
  })

  test('falls back to page identity for generic queries', () => {
    expect(extractCategory({
      query: 'is this worth it',
      brand: 'HubSpot',
      pageIntelligence: crmPage,
    })).toBe('CRM for small business')
  })

  test('buildQueryDiscovery emits category-aware candidates', () => {
    const discovery = buildQueryDiscovery({
      query: 'best CRM for small business',
      sourceUrl: 'https://www.hubspot.com/products/crm',
      pageIntelligence: crmPage,
      markdown: '# HubSpot CRM',
    })

    expect(discovery.brand).toBe('Hubspot')
    expect(discovery.category).toBe('CRM for small business')
    expect(discovery.candidates).toContain('is Hubspot a good CRM for small business')
  })
})
