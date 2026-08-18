import { createFileAgenticStore } from './fileAgenticStore.js'
import { createInMemoryAgenticStore } from './inMemoryAgenticStore.js'

let activeStore = null

function createConfiguredStore() {
  if (process.env.AGENTIC_PROFILE_STORAGE === 'file') {
    return createFileAgenticStore({
      dataDir: process.env.AGENTIC_PROFILE_DATA_DIR,
    })
  }

  return createInMemoryAgenticStore()
}

export function getAgenticStore() {
  if (!activeStore) {
    activeStore = createConfiguredStore()
  }
  return activeStore
}

export function resetAgenticStoreForTests(store = null) {
  activeStore = store
}

export function saveProfile(input) {
  return getAgenticStore().saveProfile(input)
}

export function getProfile(slug) {
  return getAgenticStore().getProfile(slug)
}

export function listProfiles() {
  return getAgenticStore().listProfiles()
}

export function clearProfiles() {
  return getAgenticStore().clearProfiles()
}

export function updateProfileMonitoring(slug, monitoring) {
  return getAgenticStore().updateProfileMonitoring(slug, monitoring)
}

export function getStorageInfo() {
  return getAgenticStore().getStorageInfo()
}

export function createApprovalRequest(input) {
  return getAgenticStore().createApprovalRequest(input)
}

export function getApprovalRequest(id) {
  return getAgenticStore().getApprovalRequest(id)
}

export function listApprovalRequests(filters) {
  return getAgenticStore().listApprovalRequests(filters)
}

export function updateApprovalRequest(id, updates) {
  return getAgenticStore().updateApprovalRequest(id, updates)
}

export function updateApprovalRequestStatus(id, status, options) {
  return getAgenticStore().updateApprovalRequestStatus(id, status, options)
}

export function clearApprovalRequests() {
  return getAgenticStore().clearApprovalRequests()
}
