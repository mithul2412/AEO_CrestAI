export function normalizeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function slugFromDomain(domain) {
  return normalizeSlug(domain) || 'unknown-profile'
}

export function stableId(prefix, value) {
  const slug = normalizeSlug(value)
  return `${prefix}-${slug || 'item'}`
}
