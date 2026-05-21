export function parseHttpUrl(value) {
  if (!value || typeof value !== 'string') return null

  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    return parsed
  } catch {
    return null
  }
}

export function getDomainFromUrl(value) {
  const parsed = parseHttpUrl(value)
  return parsed ? parsed.hostname.replace(/^www\./i, '') : ''
}

export function getOriginFromUrl(value) {
  const parsed = parseHttpUrl(value)
  return parsed ? parsed.origin : ''
}

export function toAbsoluteUrl(value, baseUrl = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^(mailto:|tel:)/i.test(raw)) return raw

  try {
    const parsed = baseUrl ? new URL(raw, baseUrl) : new URL(raw)
    if (!['http:', 'https:'].includes(parsed.protocol)) return ''
    return parsed.toString()
  } catch {
    return ''
  }
}
