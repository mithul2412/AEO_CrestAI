export const AGENTIC_PROFILE_RECORD_STORAGE_VERSION = 1

function nowIso() {
  return new Date().toISOString()
}

export function buildProfileRecord(input = {}, existing = null) {
  const timestamp = input.updatedAt || nowIso()
  const createdAt = existing?.createdAt
    || input.createdAt
    || input.profile?.metadata?.createdAt
    || timestamp
  const version = Number.isFinite(existing?.version) ? existing.version + 1 : 1

  return {
    storageVersion: AGENTIC_PROFILE_RECORD_STORAGE_VERSION,
    slug: input.slug,
    profile: input.profile,
    artifacts: input.artifacts || {},
    validation: input.validation || null,
    engineReadiness: input.engineReadiness || null,
    hostedProfile: input.hostedProfile || null,
    createdAt,
    updatedAt: timestamp,
    storedAt: timestamp,
    version,
  }
}

export function summarizeProfileRecord(record = {}) {
  return {
    slug: record.slug,
    profileId: record.profile?.profileId || '',
    businessName: record.profile?.business?.name || '',
    domain: record.profile?.business?.domain || '',
    sourceUrl: record.profile?.source?.sourceUrl || '',
    updatedAt: record.profile?.metadata?.updatedAt || record.updatedAt || '',
    storedAt: record.storedAt || record.updatedAt || '',
    createdAt: record.createdAt || '',
    version: record.version || 1,
    validationOk: Boolean(record.validation?.ok),
  }
}
