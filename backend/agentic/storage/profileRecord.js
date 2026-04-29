export const AGENTIC_PROFILE_RECORD_STORAGE_VERSION = 2

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

  const record = {
    storageVersion: AGENTIC_PROFILE_RECORD_STORAGE_VERSION,
    slug: input.slug,
    profile: input.profile,
    artifacts: input.artifacts || {},
    validation: input.validation || null,
    engineReadiness: input.engineReadiness || null,
    hostedProfile: input.hostedProfile || null,
    changeEvents: input.changeEvents || [],
    approval: input.approval || null,
    createdAt,
    updatedAt: timestamp,
    storedAt: timestamp,
    version,
  }

  record.versionHistory = [
    ...getExistingVersionHistory(existing),
    buildVersionSnapshot(record),
  ]

  return record
}

function buildVersionSnapshot(record) {
  return {
    version: record.version,
    slug: record.slug,
    profileId: record.profile?.profileId || '',
    businessName: record.profile?.business?.name || '',
    sourceUrl: record.profile?.source?.sourceUrl || '',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    storedAt: record.storedAt,
    profile: record.profile,
    artifacts: record.artifacts,
    validation: record.validation,
    engineReadiness: record.engineReadiness,
    hostedProfile: record.hostedProfile,
    changeEvents: record.changeEvents || [],
    approval: record.approval || null,
  }
}

function getExistingVersionHistory(existing) {
  if (!existing) return []
  if (Array.isArray(existing.versionHistory) && existing.versionHistory.length > 0) {
    return existing.versionHistory
  }

  return [buildVersionSnapshot({
    version: existing.version || 1,
    slug: existing.slug,
    profile: existing.profile,
    artifacts: existing.artifacts || {},
    validation: existing.validation || null,
    engineReadiness: existing.engineReadiness || null,
    hostedProfile: existing.hostedProfile || null,
    changeEvents: existing.changeEvents || [],
    approval: existing.approval || null,
    createdAt: existing.createdAt || existing.storedAt || '',
    updatedAt: existing.updatedAt || existing.storedAt || '',
    storedAt: existing.storedAt || existing.updatedAt || '',
  })]
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
    versionHistoryCount: Array.isArray(record.versionHistory) ? record.versionHistory.length : 0,
    validationOk: Boolean(record.validation?.ok),
  }
}
