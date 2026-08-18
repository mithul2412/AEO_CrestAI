export const CANONICAL_PROFILE_VERSION = '1.0.0'

/**
 * @typedef {Object} CanonicalProfileValidation
 * @property {boolean} ok
 * @property {string[]} errors
 * @property {string[]} warnings
 */

/**
 * @typedef {Object} CanonicalProfile
 * @property {string} version
 * @property {string} profileId
 * @property {string} slug
 * @property {Object} source
 * @property {Object} business
 * @property {Array<Object>} pages
 * @property {Array<Object>} services
 * @property {Array<Object>} products
 * @property {Array<Object>} actions
 * @property {Array<Object>} faqs
 * @property {Array<Object>} claims
 * @property {Array<Object>} policies
 * @property {Array<Object>} trustSignals
 * @property {Object} engineReadiness
 * @property {Object} metadata
 */

function nowIso() {
  return new Date().toISOString()
}

export function createEmptyCanonicalProfile(input = {}) {
  const timestamp = input.createdAt || nowIso()

  return {
    version: CANONICAL_PROFILE_VERSION,
    profileId: input.profileId || '',
    slug: input.slug || '',
    source: {
      sourceUrl: input.sourceUrl || '',
      origin: input.origin || '',
      fetchedAt: input.fetchedAt || timestamp,
      query: input.query || '',
      analysisScores: {
        overallScore: input.analysis?.overallScore ?? null,
        contentScore: input.analysis?.contentScore ?? null,
        geuScore: input.analysis?.geuScore ?? null,
        queryScore: input.analysis?.queryScore ?? null,
        gapScore: input.analysis?.gapScore ?? null,
      },
    },
    business: {
      name: '',
      domain: input.domain || '',
      category: '',
      description: '',
      locations: [],
      serviceAreas: [],
      contact: {
        email: '',
        phone: '',
        bookingUrl: '',
        quoteUrl: '',
        demoUrl: '',
        contactUrl: '',
      },
      sameAs: [],
    },
    pages: [],
    services: [],
    products: [],
    actions: [],
    faqs: [],
    claims: [],
    policies: [],
    trustSignals: [],
    engineReadiness: {
      chatgpt: { score: null, checks: [] },
      perplexity: { score: null, checks: [] },
      google: { score: null, checks: [] },
      claude: { score: null, checks: [] },
    },
    metadata: {
      createdAt: timestamp,
      updatedAt: timestamp,
      lastValidatedAt: '',
      generatedBy: 'crest-agentic-layer',
      approvalRequired: false,
      warnings: [],
    },
  }
}

export function validateCanonicalProfile(profile) {
  const errors = []
  const warnings = []

  if (!profile || typeof profile !== 'object') {
    return { ok: false, errors: ['profile must be an object'], warnings }
  }

  if (!profile.profileId) errors.push('profileId is required')
  if (!profile.slug) errors.push('slug is required')
  if (!profile.source?.sourceUrl) errors.push('source.sourceUrl is required')
  if (!profile.business?.domain) errors.push('business.domain is required')
  if (!Array.isArray(profile.pages) || profile.pages.length === 0) {
    errors.push('at least one page is required')
  }

  if (!profile.business?.name) warnings.push('missing business name')
  if (!profile.business?.description) warnings.push('missing description')
  if ((profile.services?.length || 0) === 0 && (profile.products?.length || 0) === 0) {
    warnings.push('no services/products found')
  }
  if ((profile.actions?.length || 0) === 0) warnings.push('no actions found')

  const contact = profile.business?.contact || {}
  if (!contact.email && !contact.phone && !contact.bookingUrl && !contact.quoteUrl && !contact.demoUrl && !contact.contactUrl) {
    warnings.push('no contact method found')
  }

  for (const claim of profile.claims || []) {
    if (!claim.sourceUrl || !claim.sourceText) {
      warnings.push(`claim missing source grounding: ${claim.claim || 'unknown claim'}`)
    }
    if (claim.claimType === 'pricing' && !claim.sourceText) {
      warnings.push(`pricing claim missing source text: ${claim.claim || 'unknown pricing claim'}`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  }
}
