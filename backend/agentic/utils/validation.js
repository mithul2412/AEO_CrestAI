export const RISKY_CLAIM_TERMS = [
  'best',
  '#1',
  'leading',
  'guarantee',
  'guaranteed',
  'certified',
  'award-winning',
  'HIPAA',
  'SOC 2',
  'FDA',
  'legal',
  'medical',
  'financial',
  'refund',
]

export function isSafeActionUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return false
  if (/^(mailto|tel):/i.test(raw)) return true

  try {
    const parsed = new URL(raw)
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

export function containsRiskyClaimTerm(value) {
  const text = String(value || '').toLowerCase()
  return RISKY_CLAIM_TERMS.some(term => text.includes(term.toLowerCase()))
}

export function containsPrivateRuntimeValue(value) {
  return /\b(?:GROQ_API_KEY|OPENROUTER_API_KEY(?:_[A-Z0-9_]+)?|JINA_API_KEY|AGENTIC_PROFILE_BASE_URL)\b|\/Users\/|\/home\/|C:\\Users\\/i.test(String(value || ''))
}

export function hasPricingSource(profile) {
  return (profile.claims || []).some(claim => claim.claimType === 'pricing' && claim.sourceText)
    || [...(profile.services || []), ...(profile.products || [])].some(item => item.priceRange && item.sourceText)
}
