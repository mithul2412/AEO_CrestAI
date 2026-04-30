import { getHeadings, getWords } from '../utils/contentSignals.js'
import { getDomain } from './tavilyService.js'

const GENERIC_BRAND_WORDS = new Set([
  'home', 'page', 'pricing', 'plans', 'features', 'solutions', 'services', 'products',
  'article', 'guide', 'blog', 'learn', 'support', 'official',
])

const CATEGORY_STOP_WORDS = new Set([
  'what', 'which', 'who', 'where', 'when', 'why', 'how', 'is', 'are', 'was', 'were',
  'the', 'a', 'an', 'best', 'top', 'leading', 'good', 'better', 'great', 'recommended',
  'compare', 'comparison', 'compared', 'versus', 'vs', 'alternative', 'alternatives',
  'competitor', 'competitors', 'pricing', 'price', 'prices', 'plans', 'plan', 'cost',
  'costs', 'review', 'reviews', 'tool', 'tools', 'platform', 'platforms', 'software',
  'service', 'services', 'provider', 'providers', 'solution', 'solutions',
  'choose', 'select', 'find',
])

const PRESERVED_CATEGORY_TERMS = ['crm', 'seo', 'aeo', 'geo', 'cms', 'erp', 'hris', 'api', 'ai']

const CATEGORY_TRAILING_PHRASES = [
  /\b(?:in|for)\s+20\d{2}\b/gi,
  /\b(?:near me|online|today|right now)\b/gi,
  /\b(?:pricing|prices|plans|cost|costs|reviews?|alternatives?|competitors?)\b.*$/gi,
]

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

function stripQuestionNoise(value = '') {
  let text = compact(value)
    .replace(/[?!]+$/g, '')
    .replace(/[“”"]/g, '')
  CATEGORY_TRAILING_PHRASES.forEach(pattern => {
    text = text.replace(pattern, '')
  })
  return compact(text)
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function removeBrand(value = '', brand = '') {
  const text = compact(value)
  const cleanBrand = compact(brand)
  if (!cleanBrand || cleanBrand === 'the brand') return text
  return compact(text.replace(new RegExp(`\\b${escapeRegex(cleanBrand)}\\b`, 'ig'), ''))
}

function isAcronym(word = '') {
  return /^[A-Z0-9&.-]{2,}$/.test(word)
}

function humanizeCategory(value = '') {
  const cleaned = stripQuestionNoise(value)
    .replace(/[^\w&.+#/\s-]/g, ' ')
    .replace(/\b(?:for|with|without|near|by|to|from|in|on|at|of)\s*$/i, '')

  const words = compact(cleaned).split(/\s+/).filter(Boolean)
  const filtered = words.filter((word, index) => {
    const normalized = word.toLowerCase().replace(/[^a-z0-9&.+#-]/g, '')
    if (!normalized) return false
    if (index === 0 && CATEGORY_STOP_WORDS.has(normalized)) return false
    if (['for', 'with', 'without', 'near', 'by', 'to', 'from', 'in', 'on', 'at', 'of'].includes(normalized)) return true
    return !CATEGORY_STOP_WORDS.has(normalized)
  })

  const phrase = filtered.join(' ')
  if (!phrase) return ''

  return phrase
    .split(/\s+/)
    .map(word => {
      const normalized = word.toLowerCase()
      if (isAcronym(word) || ['crm', 'seo', 'aeo', 'geo', 'cms', 'erp', 'hris', 'api', 'ai'].includes(normalized)) {
        return normalized.toUpperCase()
      }
      if (['for', 'with', 'without', 'near', 'by', 'to', 'from', 'in', 'on', 'at', 'of'].includes(normalized)) {
        return normalized
      }
      return normalized
    })
    .join(' ')
    .replace(/^(?:for|with|without|near|by|to|from|in|on|at|of)\s+/i, '')
    .replace(/\bsmall business(es)?\b/i, 'small business')
    .replace(/\bmid market\b/i, 'mid-market')
    .replace(/\bb2b\b/i, 'B2B')
}

function extractPreservedCategory(value = '') {
  const text = compact(value)
  const categoryMatch = text.match(new RegExp(`\\b(${PRESERVED_CATEGORY_TERMS.join('|')})\\b`, 'i'))
  if (!categoryMatch) return ''

  const category = categoryMatch[1].toUpperCase()
  const beforeCategory = text.slice(0, categoryMatch.index)
  const forMatch = beforeCategory.match(/\bfor\s+(.+)$/i)
  if (!forMatch) return category

  const audience = humanizeCategory(forMatch[1])
  return audience ? `${category} for ${audience}` : category
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

export function extractCategory({ query = '', brand = '', pageIntelligence = {}, markdown = '', fallback = 'service' } = {}) {
  const headings = [
    pageIntelligence.extraction?.h1,
    ...(pageIntelligence.extraction?.headings || []),
    ...getHeadings(markdown).map(heading => heading.replace(/^#{1,6}\s+/, '')),
  ].filter(Boolean)

  const querySource = removeBrand(stripQuestionNoise(query), brand)
  if (/\b(?:vs|versus|compare|comparison|compared)\b/i.test(querySource)) {
    const comparisonCategory = extractPreservedCategory(querySource)
    if (comparisonCategory) return comparisonCategory
  }

  const queryPatterns = [
    /\bbest\s+(.+)$/i,
    /\btop\s+(.+)$/i,
    /\b(?:compare|comparison of)\s+(.+)$/i,
    /\balternatives?\s+for\s+(.+)$/i,
    /^(.+?)\s+(?:alternatives?|competitors?)$/i,
    /^(.+?)\s+(?:pricing|plans|costs?)$/i,
    /\b(?:choose|select|find)\s+(.+)$/i,
    /\b(?:what|which)\s+(?:is|are)\s+(?:the\s+)?(?:best\s+)?(.+)$/i,
  ]

  for (const pattern of queryPatterns) {
    const match = querySource.match(pattern)
    const category = humanizeCategory(match?.[1] || '')
    if (category) return category
  }

  const directQueryCategory = humanizeCategory(querySource)
  if (
    directQueryCategory &&
    getWords(directQueryCategory).length <= 7 &&
    /\b(CRM|SEO|AEO|GEO|CMS|ERP|HRIS|API|AI|software|platform|tool|service|provider)\b/i.test(querySource)
  ) {
    return directQueryCategory
  }

  const source = compact(headings.join(' ') || markdown)
  const patterns = [
    /\bbest\s+([a-z][a-z0-9 -]{3,70})\b/i,
    /\b([a-z0-9&.+#/-]{2,30})\s+(?:software|platform|tool|service)s?\s+for\s+([a-z][a-z0-9 -]{3,50})\b/i,
    /\b([a-z][a-z0-9 -]{1,50})\s+(?:software|platform|provider|providers|plans|tool|tools|service|services)\b/i,
    /\b(?:software|platform|tool|service|provider)s?\s+for\s+([a-z][a-z0-9 -]{3,70})\b/i,
    /\b(?:compare|comparison of)\s+([a-z][a-z0-9 -]{3,70})\b/i,
  ]

  for (const pattern of patterns) {
    const match = source.match(pattern)
    if (match?.[1]) {
      const rawCategory = match[2] ? `${match[1]} for ${match[2]}` : match[1]
      const category = humanizeCategory(removeBrand(rawCategory, brand))
      if (category) return category
    }
  }

  const words = getWords(source.toLowerCase())
    .map(word => word.replace(/[^a-z0-9-]/g, ''))
    .filter(word => word.length > 4 && !GENERIC_BRAND_WORDS.has(word) && !CATEGORY_STOP_WORDS.has(word))
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
  const category = extractCategory({ query, brand, pageIntelligence, markdown, fallback: 'provider' })
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
