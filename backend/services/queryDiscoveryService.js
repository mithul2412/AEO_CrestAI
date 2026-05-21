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
  // Comparative / superlative adjectives — never product categories
  'fewer', 'faster', 'easier', 'simpler', 'cheaper', 'harder', 'stronger', 'deeper',
  'wider', 'higher', 'lower', 'longer', 'larger', 'smaller', 'greater', 'newer',
  // Common landing-page adjectives and adverbs
  'smart', 'quick', 'clean', 'clear', 'light', 'heavy', 'ready', 'fully', 'truly',
  'easily', 'simply', 'really', 'directly', 'already', 'always', 'every', 'often',
  // Pronouns / determiners
  'their', 'these', 'those', 'other', 'about', 'along', 'since', 'while',
  'more', 'most', 'some', 'many', 'much', 'each', 'both', 'more', 'less',
  // Common verb forms in headings
  'get', 'gets', 'got', 'build', 'built', 'helps', 'makes', 'keeps', 'gives',
  'works', 'needs', 'runs', 'lets', 'using', 'being', 'doing', 'going', 'done',
  'start', 'after', 'again', 'could', 'would', 'might', 'should',
  // Common non-category nouns
  'users', 'teams', 'world', 'place', 'level', 'value', 'power', 'ways',
  'time', 'work', 'life', 'part', 'thing',
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

  // If only prepositions survived filtering, it's not a real category
  const PREPS = new Set(['for', 'with', 'without', 'near', 'by', 'to', 'from', 'in', 'on', 'at', 'of'])
  if (phrase.toLowerCase().split(/\s+/).every(w => PREPS.has(w))) return ''

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
  // Word-limited patterns: capture group uses [a-z0-9-]+ (no spaces) with optional extra words
  // to prevent greedy matching across entire heading sentences.
  const W = '[a-z][a-z0-9-]+'  // single hyphenated word
  const patterns = [
    /\bbest\s+([a-z][a-z0-9 -]{3,50})\b/i,
    new RegExp(`\\b(${W}(?:\\s+${W}){0,2})\\s+(?:software|platform|tool|service)s?\\s+for\\s+([a-z][a-z0-9 -]{3,50})\\b`, 'i'),
    new RegExp(`\\b(${W}(?:\\s+${W}){0,2})\\s+(?:software|platform|provider|providers|plans|tool|tools|service|services)\\b`, 'i'),
    /\b(?:software|platform|tool|service|provider)s?\s+for\s+([a-z][a-z0-9 -]{3,60})\b/i,
    /\b(?:compare|comparison of)\s+([a-z][a-z0-9 -]{3,60})\b/i,
  ]

  for (const pattern of patterns) {
    const match = source.match(pattern)
    if (match?.[1]) {
      const rawCategory = match[2] ? `${match[1]} for ${match[2]}` : match[1]
      const category = humanizeCategory(removeBrand(rawCategory, brand))
      if (category) return category
    }
  }

  // Near-last-resort: extract from H1/title directly (better signal than scattered headings)
  const titleSources = [
    pageIntelligence?.extraction?.h1,
    pageIntelligence?.extraction?.title,
  ].filter(Boolean)

  const TITLE_PREPS = new Set(['for', 'with', 'without', 'near', 'by', 'to', 'from', 'in', 'on', 'at', 'of'])
  for (const src of titleSources) {
    const parts = String(src).split(/[|–—]/).map(p => p.trim())
    for (const part of parts) {
      const cleaned = humanizeCategory(removeBrand(part, brand))
      if (!cleaned) continue
      // Trim at the first preposition so "issue tracker for teams" → "issue tracker"
      const words = cleaned.split(/\s+/)
      const prepIdx = words.findIndex(w => TITLE_PREPS.has(w.toLowerCase()))
      const trimmed = (prepIdx > 0 ? words.slice(0, prepIdx) : words).slice(0, 3).join(' ')
      if (trimmed) return trimmed
    }
  }

  return fallback
}

const REFERENCE_URL_PATTERNS = [
  /developer\.mozilla\.org\//i,
  /\.wikipedia\.org\//i,
  /docs\.[a-z0-9-]+\.[a-z]{2,}\//i,
  /\/docs?\//i,
  /\/glossary\//i,
  /\/reference\//i,
  /\/api(?:\/|$)/i,
  /\/spec(?:s)?\//i,
  /developer\.[a-z0-9-]+\.[a-z]{2,}\//i,
]

const COMPARISON_HINTS = /\b(vs\.?|versus|compare|comparison|alternatives?|competitors?)\b/i
const FAQ_HINTS = /\b(faq|frequently asked|q&a|questions and answers)\b/i
const PRICING_HINTS = /\b(pricing|plans?|tier|tiers|cost|cost(s|ing))\b/i
const PRODUCT_HINTS = /\b(features|how it works|why\s+\w+|book a demo|get started|sign up)\b/i

function looksLikeReferenceShape({ headings = [], wordCount = 0, h1 = '' }) {
  const headingsLower = headings.map(heading => String(heading || '').toLowerCase())
  const refSignals = headingsLower.filter(heading =>
    /\bdefinition\b|\bsyntax\b|\bsee also\b|\bexamples?\b|\bspecification(s)?\b|\bbrowser compat/i.test(heading)
  ).length
  const shortBody = wordCount > 0 && wordCount < 1500
  const titleHintsConcept = /^[\w\-+#./ ]{1,40}$/.test(String(h1 || '').trim())
  return refSignals >= 2 || (shortBody && refSignals >= 1) || (shortBody && titleHintsConcept && refSignals === 0 && headingsLower.some(h => /(see also|further reading|related)/i.test(h)))
}

export function detectPageType({ sourceUrl = '', pageIntelligence = {}, markdown = '' } = {}) {
  const extraction = pageIntelligence?.extraction || {}
  const url = String(sourceUrl || '')
  const title = String(extraction.title || '').toLowerCase()
  const h1 = String(extraction.h1 || '')
  const headings = Array.isArray(extraction.headings) ? extraction.headings : []
  const wordCount = Number(extraction.wordCount) || getWords(markdown).length

  if (REFERENCE_URL_PATTERNS.some(pattern => pattern.test(url))) return 'reference'
  if (looksLikeReferenceShape({ headings, wordCount, h1 })) return 'reference'

  const allText = [title, h1, headings.join(' ')].join(' ').toLowerCase()
  if (FAQ_HINTS.test(allText)) return 'faq'
  if (COMPARISON_HINTS.test(allText)) return 'comparison'
  if (PRICING_HINTS.test(allText)) return 'pricing'
  if (PRODUCT_HINTS.test(allText)) return 'product'
  return 'commercial'
}

const REFERENCE_FALLBACK_NOISE_HEADINGS = /^(see also|further reading|references?|related|external links|browser compatibility|specifications?)$/i

export function isReferenceNoiseSection(section = '') {
  return REFERENCE_FALLBACK_NOISE_HEADINGS.test(String(section || '').trim())
}

export function fallbackQueriesForPageType({ pageType = 'commercial', brand = '', h1 = '', category = '' } = {}) {
  const subject = String(h1 || brand || 'this page').trim() || 'this page'
  const brandName = String(brand || subject).trim() || 'this page'
  const cat = String(category || 'provider').trim() || 'provider'

  if (pageType === 'reference') {
    return [
      `What is ${subject}?`,
      `How does ${subject} work?`,
      `${subject} vs related concepts?`,
    ]
  }
  if (pageType === 'faq') {
    return [
      `What does ${brandName} cover?`,
      `Common questions about ${cat}?`,
      `When should I use a ${cat}?`,
    ]
  }
  // Commercial / product / pricing / comparison: 1 named-brand question + 2 category questions
  // (the category questions test whether this page can be cited for generic "best X" searches).
  if (pageType === 'pricing') {
    return [
      `How much does ${brandName} cost?`,
      `Best ${cat} pricing for small business?`,
      `Most affordable ${cat}?`,
    ]
  }
  if (pageType === 'comparison') {
    return [
      `Is ${brandName} better than alternatives?`,
      `Best ${cat} for small business?`,
      `Top ${cat} this year?`,
    ]
  }
  return [
    `What is ${brandName} best for?`,
    `Best ${cat} for small business?`,
    `Top ${cat} for growing teams?`,
  ]
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
