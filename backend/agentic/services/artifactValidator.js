import { validateCanonicalProfile } from '../schemas/canonicalProfileSchema.js'
import { containsPrivateRuntimeValue, containsRiskyClaimTerm, hasPricingSource, isSafeActionUrl } from '../utils/validation.js'

function check(id, label, passed, message, warnOnly = false) {
  return {
    id,
    label,
    status: passed ? 'pass' : warnOnly ? 'warn' : 'fail',
    message,
  }
}

function addCheck(result, nextCheck) {
  result.checks.push(nextCheck)
  if (nextCheck.status === 'fail') result.errors.push(nextCheck.message)
  if (nextCheck.status === 'warn') result.warnings.push(nextCheck.message)
}

function artifactText(artifacts) {
  return JSON.stringify(artifacts || {})
}

function validateJsonLd(profile, artifacts, result) {
  const jsonLd = artifacts.jsonLd
  addCheck(result, check('jsonld-array', 'JSON-LD is an array', Array.isArray(jsonLd), 'jsonLd must be an array'))
  if (!Array.isArray(jsonLd)) return

  jsonLd.forEach((item, index) => {
    addCheck(result, check(`jsonld-object-${index}`, 'JSON-LD item is object', Boolean(item && typeof item === 'object' && !Array.isArray(item)), `jsonLd[${index}] must be an object`))
    addCheck(result, check(`jsonld-context-${index}`, 'JSON-LD @context present', Boolean(item?.['@context']), `jsonLd[${index}] missing @context`))
    addCheck(result, check(`jsonld-type-${index}`, 'JSON-LD @type present', Boolean(item?.['@type']), `jsonLd[${index}] missing @type`))
    try {
      JSON.stringify(item)
      addCheck(result, check(`jsonld-serializable-${index}`, 'JSON-LD serializable', true, `jsonLd[${index}] serializes`))
    } catch {
      addCheck(result, check(`jsonld-serializable-${index}`, 'JSON-LD serializable', false, `jsonLd[${index}] cannot be stringified`))
    }
  })

  const text = JSON.stringify(jsonLd)
  addCheck(result, check('jsonld-no-rating', 'No unsupported ratings/reviews', !/AggregateRating|Review/.test(text), 'JSON-LD includes rating/review schema without sourced trust data', true))
  addCheck(result, check('jsonld-offer-price-source', 'Offer prices are sourced', !(/"@type":"Offer"|"@type":\s*"Offer"/.test(text) && !hasPricingSource(profile)), 'Offer price requires a pricing source', true))
}

export function validateArtifacts(profile, artifacts = {}) {
  const result = {
    ok: true,
    errors: [],
    warnings: [],
    approvalRequired: false,
    checks: [],
  }

  const canonicalValidation = validateCanonicalProfile(profile)
  addCheck(result, check('canonical-profile', 'Canonical profile validates', canonicalValidation.ok, canonicalValidation.errors.join('; ') || 'Canonical profile is valid'))
  canonicalValidation.warnings.forEach(warning => result.warnings.push(warning))

  addCheck(result, check('business-domain', 'Business domain present', Boolean(profile.business?.domain), 'business.domain is required'))
  addCheck(result, check('source-url', 'Source URL present', Boolean(profile.source?.sourceUrl), 'source.sourceUrl is required'))

  for (const [key, value] of Object.entries(artifacts)) {
    addCheck(result, check(`artifact-${key}`, `${key} generated`, value !== undefined && value !== null, `${key} must not be undefined or null`))
  }

  validateJsonLd(profile, artifacts, result)

  addCheck(result, check('llms-text', 'llms.txt non-empty Markdown', typeof artifacts.llmsTxt === 'string' && artifacts.llmsTxt.trim().startsWith('#'), 'llms.txt must be a non-empty Markdown string starting with #'))
  addCheck(result, check('llms-profile-link', 'llms.txt links hosted profile', /\/agent\/|https?:\/\/.+\/agent\//.test(artifacts.llmsTxt || ''), 'llms.txt should include hosted profile link', true))
  addCheck(result, check('llms-full-text', 'llms-full.txt includes sources', typeof artifacts.llmsFullTxt === 'string' && /Source URL:|Source:/.test(artifacts.llmsFullTxt), 'llms-full.txt should include source references'))
  addCheck(result, check('no-private-values', 'Artifacts omit private runtime values', !containsPrivateRuntimeValue(artifactText(artifacts)), 'artifacts include env variable names or local file paths', true))

  for (const action of artifacts.actionMetadata || []) {
    addCheck(result, check(`action-${action.id || action.label}-type`, 'Action has type and label', Boolean(action.type && action.label), `action ${action.id || action.label || 'unknown'} missing type or label`))
    if (action.url) {
      addCheck(result, check(`action-${action.id || action.label}-url`, 'Action URL is safe', isSafeActionUrl(action.url), `action ${action.id || action.label || 'unknown'} has invalid URL`, true))
    }
  }

  for (const claim of artifacts.claimSourceMap || []) {
    const claimLabel = claim.claim || 'unknown claim'
    addCheck(result, check(`claim-source-${claimLabel.slice(0, 24)}`, 'Claim has source grounding', Boolean(claim.sourceUrl || claim.sourceText), `claim missing source: ${claimLabel}`, true))
    if (claim.claimType === 'pricing') {
      result.approvalRequired = true
      result.warnings.push(`pricing claim requires approval: ${claimLabel}`)
    }
    if (claim.riskLevel === 'high' || containsRiskyClaimTerm(claim.claim)) {
      result.approvalRequired = true
      result.warnings.push(`risky claim requires review: ${claimLabel}`)
    }
  }

  for (const item of artifacts.structuredServiceProductData || []) {
    if (item.priceRange) {
      result.approvalRequired = true
      result.warnings.push(`pricing field requires approval: ${item.name}`)
    }
  }

  result.ok = result.errors.length === 0
  return result
}
