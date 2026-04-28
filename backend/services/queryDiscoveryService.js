import { getHeadings, getWords } from '../utils/contentSignals.js'
import { getDomain } from './tavilyService.js'

const GENERIC_BRAND_WORDS = new Set([
  'home', 'page', 'pricing', 'plans', 'features', 'solutions', 'services', 'products',
  'article', 'guide', 'blog', 'learn', 'support', 'official',
])

function titleCase(value) {
  return String(value || '')
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function domainBrand(sourceUrl = '') {
  const domain = getDomain(sourceUrl)
  const label = domain.split('.')[0] || ''
  return titleCase(label.replace(/[^a-z0-9-]/gi, ' '))
}

function extractBrand({ sourceUrl = '', pageIntelligence = {}, markdown = '' } = {}) {
  const title = pageIntelligence.extraction?.title || ''
  const h1 = pageIntelligence.extraction?.h1 || ''
  const domain = domainBrand(sourceUrl)
  const candidates = [domain, h1, title]
    .map(value => compact(value).split(/[|:–-]/)[0])
    .filter(value => value && !GENERIC_BRAND_WORDS.has(value.toLowerCase()))
  if (candidates[0]) return candidates[0]

  const properNoun = compact(markdown).match(/\b[A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+){0,2}\b/)
  return properNoun?.[0] || domain || 'the brand'
}

function extractCategory({ pageIntelligence = {}, markdown = '', fallback = 'service' } = {}) {
  const headings = [
    pageIntelligence.extraction?.h1,
    ...(pageIntelligence.extraction?.headings || []),
    ...getHeadings(markdown).map(heading => heading.replace(/^#{1,6}\s+/, '')),
  ].filter(Boolean)

  const source = compact(headings.join(' ') || markdown)
  const patterns = [
    /\bbest\s+([a-z][a-z0-9 -]{3,70})\b/i,
    /\b([a-z][a-z0-9 -]{3,50})\s+(?:software|platform|provider|providers|plans|tool|tools|service|services)\b/i,
    /\b(?:compare|comparison of)\s+([a-z][a-z0-9 -]{3,70})\b/i,
  ]

  for (const pattern of patterns) {
    const match = source.match(pattern)
    if (match?.[1]) {
      return compact(match[1]).replace(/\b(the|best|top)\b/gi, '').trim() || fallback
    }
  }

  const words = getWords(source.toLowerCase())
    .map(word => word.replace(/[^a-z0-9-]/g, ''))
    .filter(word => word.length > 4 && !GENERIC_BRAND_WORDS.has(word))
  return words.slice(0, 3).join(' ') || fallback
}

function uniq(values) {
  const seen = new Set()
  return values
    .map(value => compact(value).replace(/[?.!]+$/, ''))
    .filter(Boolean)
    .filter(value => {
      const key = value.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function buildQueryDiscovery({
  query = '',
  sourceUrl = '',
  markdown = '',
  pageIntelligence = {},
  maxQueries = 5,
} = {}) {
  const brand = extractBrand({ sourceUrl, pageIntelligence, markdown })
  const category = extractCategory({ pageIntelligence, markdown, fallback: 'provider' })
  const cleanQuery = compact(query)

  const candidates = uniq([
    cleanQuery,
    `what is ${brand} best for`,
    `${brand} plans`,
    `best ${category}`,
    `${brand} vs competitors`,
    `is ${brand} a good ${category}`,
  ]).slice(0, maxQueries)

  return {
    status: 'ok',
    brand,
    category,
    primaryQuery: cleanQuery || candidates[0] || '',
    candidates,
  }
}
