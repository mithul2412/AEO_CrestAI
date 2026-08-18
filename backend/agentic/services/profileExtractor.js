import { createEmptyCanonicalProfile } from '../schemas/canonicalProfileSchema.js'
import { cleanText, getBulletItems, getHeadings, getLines, getMarkdownLinks, getPageTitle, getParagraphs, getSentences } from '../utils/markdown.js'
import { slugFromDomain, stableId } from '../utils/slug.js'
import { getDomainFromUrl, getOriginFromUrl, toAbsoluteUrl } from '../utils/urlUtils.js'

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const PHONE_REGEX = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g
const PRICE_REGEX = /\$\s?\d[\d,]*(?:\.\d{2})?(?:\s?(?:\/|per)\s?(?:month|mo|year|yr|hour|project))?|\b(?:starts at|starting at|from|price range|pricing starts)\b[^.!?\n]{0,90}/gi
const RISKY_CLAIM_REGEX = /\b(best|#1|leading|guarantee|guaranteed|certified|award-winning|HIPAA|SOC 2|FDA|refund)\b/i
const SERVICE_HEADING_REGEX = /\b(service|services|solution|solutions|consulting|implementation|managed|support|strategy|audit|optimization|platform)\b/i
const PRODUCT_HEADING_REGEX = /\b(product|products|plan|plans|package|packages|software|tool|platform)\b/i
const ACTION_TYPE_PATTERNS = [
  ['book_demo', /\b(book|schedule)\b.*\b(demo|consultation|call)\b|\bdemo\b/i],
  ['request_quote', /\b(quote|estimate|proposal)\b/i],
  ['buy', /\b(buy|purchase|checkout|order)\b/i],
  ['contact', /\b(contact|talk to|speak with|get in touch)\b/i],
  ['schedule', /\b(schedule|appointment)\b/i],
  ['download', /\b(download)\b/i],
  ['start_trial', /\b(start|try)\b.*\b(trial|free)\b|\bfree trial\b/i],
]

function titleCaseDomain(domain) {
  const base = String(domain || '').split('.')[0] || ''
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : ''
}

function normalizeConfidence(value) {
  return Math.max(0, Math.min(1, Number(value) || 0))
}

function uniqueBy(items, keyFn) {
  const seen = new Set()
  const results = []
  for (const item of items) {
    const key = keyFn(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    results.push(item)
  }
  return results
}

function classifyPageType(url, headings) {
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase()
    } catch {
      return ''
    }
  })()
  const headingText = headings.map(heading => heading.text).join(' ').toLowerCase()
  const combined = `${path} ${headingText}`

  if (/\b(pricing|plans|rates)\b/.test(combined)) return 'pricing_page'
  if (/\b(faq|frequently-asked|questions)\b/.test(combined)) return 'faq_page'
  if (/\b(about|company|team)\b/.test(combined)) return 'about_page'
  if (/\b(contact|get-in-touch)\b/.test(combined)) return 'contact_page'
  if (/\b(product|products|platform|software)\b/.test(combined)) return 'product_page'
  if (/\b(service|services|solutions|consulting)\b/.test(combined)) return 'service_page'
  if (!path || path === '/') return 'home_page'
  return 'unknown'
}

function extractDescription(markdown) {
  const paragraphs = getParagraphs(markdown)
  return paragraphs.find(paragraph => {
    const words = paragraph.split(/\s+/).length
    return words >= 8 && !paragraph.endsWith('?')
  }) || ''
}

function extractContact(markdown) {
  const source = String(markdown || '')
  const emails = [...source.matchAll(EMAIL_REGEX)].map(match => match[0])
  const phones = [...source.matchAll(PHONE_REGEX)].map(match => match[0])

  return {
    email: emails[0] || '',
    phone: phones[0] || '',
  }
}

function inferActionType(label, url) {
  const haystack = `${label} ${url}`
  for (const [type, pattern] of ACTION_TYPE_PATTERNS) {
    if (pattern.test(haystack)) return type
  }
  if (/^mailto:/i.test(url)) return 'email'
  if (/^tel:/i.test(url)) return 'call'
  return 'unknown'
}

function extractActions(markdown, sourceUrl) {
  const actions = []

  for (const link of getMarkdownLinks(markdown)) {
    const absoluteUrl = toAbsoluteUrl(link.url, sourceUrl)
    const type = inferActionType(link.label, absoluteUrl)
    if (type === 'unknown') continue

    actions.push({
      id: stableId('action', `${type}-${link.label}-${absoluteUrl}`),
      type,
      label: link.label || type,
      url: absoluteUrl,
      method: 'GET',
      sourceUrl,
      fallbackContact: '',
      status: absoluteUrl ? 'active' : 'needs_review',
      confidence: normalizeConfidence(absoluteUrl ? 0.9 : 0.55),
      sourceText: link.sourceText,
    })
  }

  const contact = extractContact(markdown)
  if (contact.email) {
    actions.push({
      id: stableId('action', `email-${contact.email}`),
      type: 'email',
      label: `Email ${contact.email}`,
      url: `mailto:${contact.email}`,
      method: 'GET',
      sourceUrl,
      fallbackContact: contact.email,
      status: 'active',
      confidence: 0.95,
      sourceText: contact.email,
    })
  }
  if (contact.phone) {
    actions.push({
      id: stableId('action', `call-${contact.phone}`),
      type: 'call',
      label: `Call ${contact.phone}`,
      url: `tel:${contact.phone.replace(/[^\d+]/g, '')}`,
      method: 'GET',
      sourceUrl,
      fallbackContact: contact.phone,
      status: 'active',
      confidence: 0.9,
      sourceText: contact.phone,
    })
  }

  return uniqueBy(actions, action => `${action.type}:${action.url || action.label}`)
}

function extractServicesAndProducts(markdown, sourceUrl) {
  const headings = getHeadings(markdown)
  const bulletItems = getBulletItems(markdown)
  const services = []
  const products = []

  for (const heading of headings) {
    if (heading.level > 4 || heading.text.endsWith('?')) continue
    const isService = SERVICE_HEADING_REGEX.test(heading.text)
    const isProduct = PRODUCT_HEADING_REGEX.test(heading.text)
    const target = isProduct ? products : isService ? services : null
    if (!target) continue

    target.push({
      id: stableId(isProduct ? 'product' : 'service', heading.text),
      name: heading.text,
      description: '',
      audience: '',
      priceRange: '',
      sourceUrl,
      sourceText: heading.text,
      status: 'active',
      confidence: 0.72,
    })
  }

  for (const item of bulletItems) {
    const isService = SERVICE_HEADING_REGEX.test(item)
    const isProduct = PRODUCT_HEADING_REGEX.test(item)
    if (!isService && !isProduct) continue

    const target = isProduct ? products : services
    target.push({
      id: stableId(isProduct ? 'product' : 'service', item),
      name: item.split(/[.:;-]/)[0].trim() || item,
      description: item,
      audience: '',
      priceRange: '',
      sourceUrl,
      sourceText: item,
      status: 'active',
      confidence: 0.65,
    })
  }

  return {
    services: uniqueBy(services, service => service.name.toLowerCase()).slice(0, 12),
    products: uniqueBy(products, product => product.name.toLowerCase()).slice(0, 12),
  }
}

function extractFaqs(markdown, sourceUrl) {
  const lines = getLines(markdown)
  const faqs = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const qMatch = line.match(/^(?:#{1,6}\s*)?(?:Q:\s*)?(.+\?)$/i)
    if (!qMatch) continue

    const nextLine = lines[index + 1] || ''
    const answer = cleanText(nextLine.replace(/^A:\s*/i, ''))
    if (!answer || answer.endsWith('?')) continue

    faqs.push({
      question: cleanText(qMatch[1]),
      answer,
      sourceUrl,
      sourceText: `${cleanText(line)} ${answer}`.trim(),
      confidence: /^A:/i.test(nextLine) ? 0.95 : 0.72,
    })
  }

  return uniqueBy(faqs, faq => faq.question.toLowerCase()).slice(0, 10)
}

function extractPricingClaims(markdown, sourceUrl) {
  const claims = []
  for (const sentence of getSentences(markdown)) {
    PRICE_REGEX.lastIndex = 0
    if (!PRICE_REGEX.test(sentence)) continue
    claims.push({
      claim: sentence,
      sourceUrl,
      sourceText: sentence,
      claimType: 'pricing',
      riskLevel: 'medium',
      confidence: 0.8,
    })
  }
  return claims
}

function extractGroundedClaims(markdown, sourceUrl) {
  const claims = []
  for (const sentence of getSentences(markdown)) {
    const hasClaimSignal = /\b(is|are|offers|provides|includes|supports|helps|serves|specializes|certified|guaranteed|starts at|pricing|according to)\b/i.test(sentence)
    const hasGroundingSignal = /\d|https?:\/\/|according to|research|study|report|certified|guaranteed|\$/i.test(sentence)
    if (!hasClaimSignal || !hasGroundingSignal) continue

    claims.push({
      claim: sentence,
      sourceUrl,
      sourceText: sentence,
      claimType: PRICE_REGEX.test(sentence) ? 'pricing' : RISKY_CLAIM_REGEX.test(sentence) ? 'trust' : 'other',
      riskLevel: RISKY_CLAIM_REGEX.test(sentence) ? 'high' : 'low',
      confidence: 0.7,
    })
  }

  return uniqueBy([...extractPricingClaims(markdown, sourceUrl), ...claims], claim => claim.claim.toLowerCase()).slice(0, 20)
}

function populateContactUrls(contact, actions) {
  const next = { ...contact }
  for (const action of actions) {
    if (action.type === 'book_demo' && !next.bookingUrl) next.bookingUrl = action.url
    if (action.type === 'request_quote' && !next.quoteUrl) next.quoteUrl = action.url
    if (action.type === 'contact' && !next.contactUrl) next.contactUrl = action.url
    if (action.type === 'email' && !next.email) next.email = action.fallbackContact
    if (action.type === 'call' && !next.phone) next.phone = action.fallbackContact
  }
  return next
}

export function extractCanonicalProfile({ url, markdown, query = '', analysis = {}, sourceSignals = {} } = {}) {
  const sourceUrl = sourceSignals.sourceUrl || url || ''
  const domain = getDomainFromUrl(sourceUrl)
  const origin = sourceSignals.origin || getOriginFromUrl(sourceUrl)
  const slug = slugFromDomain(domain)
  const profile = createEmptyCanonicalProfile({
    profileId: `profile-${slug}`,
    slug,
    sourceUrl,
    origin,
    domain,
    query,
    analysis,
  })

  const pageTitle = getPageTitle(markdown) || titleCaseDomain(domain)
  const headings = getHeadings(markdown)
  const contact = extractContact(markdown)
  const actions = extractActions(markdown, sourceUrl)
  const { services, products } = extractServicesAndProducts(markdown, sourceUrl)
  const description = extractDescription(markdown)

  profile.business.name = pageTitle || titleCaseDomain(domain)
  profile.business.description = description
  profile.business.contact = populateContactUrls(contact, actions)
  profile.pages = [
    {
      url: sourceUrl,
      title: pageTitle,
      pageType: classifyPageType(sourceUrl, headings),
      summary: description,
      headings: headings.map(heading => heading.text),
    },
  ]
  profile.services = services
  profile.products = products
  profile.actions = actions.map(({ sourceText, ...action }) => action)
  profile.faqs = extractFaqs(markdown, sourceUrl)
  profile.claims = extractGroundedClaims(markdown, sourceUrl)

  profile.metadata.warnings = [
    ...(!domain ? ['Could not determine domain from source URL.'] : []),
    ...(!description ? ['No sourced description detected.'] : []),
    ...((services.length + products.length) === 0 ? ['No service or product candidates detected.'] : []),
  ]

  return profile
}
