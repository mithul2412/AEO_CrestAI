const profilesBySlug = new Map()

export function saveProfile({ slug, profile, artifacts, validation, engineReadiness }) {
  const storedAt = new Date().toISOString()
  const record = {
    slug,
    profile,
    artifacts,
    validation,
    engineReadiness,
    storedAt,
  }

  profilesBySlug.set(slug, record)
  return record
}

export function getProfile(slug) {
  return profilesBySlug.get(slug) || null
}

export function listProfiles() {
  return [...profilesBySlug.values()].map(record => ({
    slug: record.slug,
    profileId: record.profile?.profileId || '',
    businessName: record.profile?.business?.name || '',
    domain: record.profile?.business?.domain || '',
    sourceUrl: record.profile?.source?.sourceUrl || '',
    updatedAt: record.profile?.metadata?.updatedAt || '',
    storedAt: record.storedAt,
    validationOk: Boolean(record.validation?.ok),
  }))
}

export function clearProfiles() {
  profilesBySlug.clear()
}
