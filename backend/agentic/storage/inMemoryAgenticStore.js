import { buildProfileRecord, summarizeProfileRecord } from './profileRecord.js'
import {
  buildApprovalRequest,
  summarizeApprovalRequest,
  updateApprovalRequestStatus as applyApprovalRequestStatus,
} from './approvalRequest.js'

export function createInMemoryAgenticStore() {
  const profilesBySlug = new Map()
  const approvalsById = new Map()

  return {
    type: 'memory',

    saveProfile(input) {
      const existing = profilesBySlug.get(input.slug)
      const record = buildProfileRecord(input, existing)
      profilesBySlug.set(record.slug, record)
      return record
    },

    getProfile(slug) {
      return profilesBySlug.get(slug) || null
    },

    listProfiles() {
      return [...profilesBySlug.values()].map(summarizeProfileRecord)
    },

    clearProfiles() {
      profilesBySlug.clear()
    },

    updateProfileMonitoring(slug, monitoring) {
      const existing = profilesBySlug.get(slug)
      if (!existing) return null
      const record = {
        ...existing,
        monitoring: {
          ...(existing.monitoring || {}),
          ...(monitoring || {}),
        },
      }
      profilesBySlug.set(slug, record)
      return record
    },

    createApprovalRequest(input) {
      const approval = buildApprovalRequest(input)
      approvalsById.set(approval.id, approval)
      return approval
    },

    getApprovalRequest(id) {
      return approvalsById.get(id) || null
    },

    listApprovalRequests(filters = {}) {
      return [...approvalsById.values()]
        .filter(approval => !filters.status || approval.status === filters.status)
        .map(summarizeApprovalRequest)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    },

    updateApprovalRequest(id, updates = {}) {
      const existing = approvalsById.get(id)
      if (!existing) return null
      const approval = buildApprovalRequest({ ...existing, ...updates }, existing)
      approvalsById.set(id, approval)
      return approval
    },

    updateApprovalRequestStatus(id, status, options = {}) {
      const existing = approvalsById.get(id)
      if (!existing) return null
      const approval = applyApprovalRequestStatus(existing, status, options)
      approvalsById.set(id, approval)
      return approval
    },

    clearApprovalRequests() {
      approvalsById.clear()
    },

    getStorageInfo() {
      return {
        type: 'memory',
        warning: 'In-memory hosted profiles disappear when the backend process restarts.',
      }
    },
  }
}

const defaultStore = createInMemoryAgenticStore()

export function saveProfile(input) {
  return defaultStore.saveProfile(input)
}

export function getProfile(slug) {
  return defaultStore.getProfile(slug)
}

export function listProfiles() {
  return defaultStore.listProfiles()
}

export function clearProfiles() {
  return defaultStore.clearProfiles()
}

export function updateProfileMonitoring(slug, monitoring) {
  return defaultStore.updateProfileMonitoring(slug, monitoring)
}

export function createApprovalRequest(input) {
  return defaultStore.createApprovalRequest(input)
}

export function getApprovalRequest(id) {
  return defaultStore.getApprovalRequest(id)
}

export function listApprovalRequests(filters) {
  return defaultStore.listApprovalRequests(filters)
}

export function updateApprovalRequest(id, updates) {
  return defaultStore.updateApprovalRequest(id, updates)
}

export function updateApprovalRequestStatus(id, status, options) {
  return defaultStore.updateApprovalRequestStatus(id, status, options)
}

export function clearApprovalRequests() {
  return defaultStore.clearApprovalRequests()
}
