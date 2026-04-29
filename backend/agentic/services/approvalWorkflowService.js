import {
  createApprovalRequest,
  getAgenticStore,
} from '../storage/agenticStore.js'

function pendingSensitiveEvents(changeEvents = []) {
  return changeEvents.filter(event => Boolean(event.approval_required ?? event.requiresApproval))
}

function assertPendingApproval(approval) {
  if (!approval) {
    const err = new Error('Approval request not found')
    err.status = 404
    throw err
  }
  if (approval.status !== 'pending') {
    const err = new Error(`Approval request is already ${approval.status}`)
    err.status = 409
    throw err
  }
}

export function createApprovalRequestForChanges(input = {}) {
  const sensitiveEvents = pendingSensitiveEvents(input.changeEvents || [])
  if (sensitiveEvents.length === 0) return null

  return createApprovalRequest({
    ...input,
    changeEvents: sensitiveEvents,
  })
}

export function listApprovalRequests(filters = {}) {
  return getAgenticStore().listApprovalRequests(filters)
}

export function getApprovalRequestById(id) {
  return getAgenticStore().getApprovalRequest(id)
}

export function approveApprovalRequest(id, options = {}) {
  const store = getAgenticStore()
  const approval = store.getApprovalRequest(id)
  assertPendingApproval(approval)

  let publishedRecord = null
  const pending = approval.pendingUpdate || {}
  const reviewedAt = options.reviewedAt || new Date().toISOString()
  const reviewerNote = options.reviewerNote || options.note || ''
  const reviewedBy = options.reviewedBy || options.reviewer || ''

  if (pending.profile) {
    publishedRecord = store.saveProfile({
      slug: approval.slug || pending.profile.slug,
      profile: pending.profile,
      artifacts: pending.artifacts || {},
      validation: pending.validation || null,
      engineReadiness: pending.engineReadiness || null,
      hostedProfile: pending.hostedProfile || null,
      changeEvents: approval.changeEvents || [],
      approval: {
        id: approval.id,
        status: 'approved',
        reviewedAt,
        reviewedBy,
        reviewerNote,
      },
    })
  }

  const updatedApproval = store.updateApprovalRequestStatus(id, 'approved', {
    ...options,
    reviewedAt,
    reviewerNote,
    reviewedBy,
    publishedVersion: publishedRecord?.version || null,
  })

  return {
    approval: updatedApproval,
    publishedProfile: publishedRecord,
  }
}

export function rejectApprovalRequest(id, options = {}) {
  const store = getAgenticStore()
  const approval = store.getApprovalRequest(id)
  assertPendingApproval(approval)

  return {
    approval: store.updateApprovalRequestStatus(id, 'rejected', options),
    publishedProfile: null,
  }
}
