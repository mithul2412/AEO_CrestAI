import crypto from 'node:crypto'

function nowIso() {
  return new Date().toISOString()
}

function stableHash(value) {
  return crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 12)
}

function safeIdPart(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

export function normalizeChangeEvents(changeEvents = []) {
  return changeEvents.map((event, index) => {
    const id = event.id || `evt-${stableHash({
      type: event.type,
      path: event.path,
      oldValue: event.oldValue,
      newValue: event.newValue,
      index,
    })}`
    const affectedArtifacts = event.affected_artifacts || event.affectedArtifacts || []
    const approvalRequired = Boolean(event.approval_required ?? event.requiresApproval)

    return {
      ...event,
      id,
      affectedArtifacts,
      affected_artifacts: affectedArtifacts,
      approval_required: approvalRequired,
      auto_publish_allowed: !approvalRequired,
      requiresApproval: approvalRequired,
    }
  })
}

function summarizeEvent(event) {
  return {
    id: event.id,
    type: event.type,
    path: event.path,
    severity: event.severity || 'medium',
    summary: `${event.type} at ${event.path || 'profile'}`,
    affected_artifacts: event.affected_artifacts || event.affectedArtifacts || [],
    approval_required: Boolean(event.approval_required ?? event.requiresApproval),
    oldValue: event.oldValue,
    newValue: event.newValue,
  }
}

export function buildApprovalRequest(input = {}, existing = null) {
  const changeEvents = normalizeChangeEvents(input.changeEvents || [])
  const approvalEvents = changeEvents.filter(event => event.approval_required)
  const createdAt = existing?.createdAt || input.createdAt || nowIso()
  const id = existing?.id
    || input.id
    || `apr-${safeIdPart(input.slug || input.profileId || 'profile')}-${stableHash({
      slug: input.slug,
      profileId: input.profileId,
      changeEventIds: approvalEvents.map(event => event.id),
      createdAt,
    })}`

  return {
    id,
    slug: input.slug || input.pendingProfile?.slug || '',
    profileId: input.profileId || input.pendingProfile?.profileId || '',
    status: input.status || existing?.status || 'pending',
    changeEventIds: approvalEvents.map(event => event.id),
    eventSummaries: approvalEvents.map(summarizeEvent),
    affectedArtifacts: [...new Set(approvalEvents.flatMap(event => event.affected_artifacts || event.affectedArtifacts || []))],
    oldValues: approvalEvents.map(event => ({ eventId: event.id, path: event.path, value: event.oldValue })),
    newValues: approvalEvents.map(event => ({ eventId: event.id, path: event.path, value: event.newValue })),
    changeEvents: approvalEvents,
    pendingUpdate: input.pendingUpdate || {
      profile: input.pendingProfile || input.profile || null,
      artifacts: input.pendingArtifacts || input.artifacts || null,
      validation: input.pendingValidation || input.validation || null,
      engineReadiness: input.pendingEngineReadiness || input.engineReadiness || null,
      hostedProfile: input.pendingHostedProfile || input.hostedProfile || null,
    },
    createdAt,
    reviewedAt: input.reviewedAt || existing?.reviewedAt || '',
    reviewerNote: input.reviewerNote || existing?.reviewerNote || '',
    audit: {
      createdBy: input.createdBy || existing?.audit?.createdBy || 'crest-agentic-layer',
      reviewedBy: input.reviewedBy || existing?.audit?.reviewedBy || '',
      publishedVersion: input.publishedVersion || existing?.audit?.publishedVersion || null,
    },
  }
}

export function updateApprovalRequestStatus(approval, status, options = {}) {
  return {
    ...approval,
    status,
    reviewedAt: options.reviewedAt || nowIso(),
    reviewerNote: options.reviewerNote || options.note || '',
    audit: {
      ...(approval.audit || {}),
      reviewedBy: options.reviewedBy || options.reviewer || '',
      publishedVersion: options.publishedVersion ?? approval.audit?.publishedVersion ?? null,
    },
  }
}

export function summarizeApprovalRequest(approval = {}) {
  return {
    id: approval.id,
    slug: approval.slug,
    profileId: approval.profileId,
    status: approval.status,
    changeEventIds: approval.changeEventIds || [],
    eventSummaries: approval.eventSummaries || [],
    affectedArtifacts: approval.affectedArtifacts || [],
    oldValues: approval.oldValues || [],
    newValues: approval.newValues || [],
    createdAt: approval.createdAt,
    reviewedAt: approval.reviewedAt || '',
    reviewerNote: approval.reviewerNote || '',
  }
}
