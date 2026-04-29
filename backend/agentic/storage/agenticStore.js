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

export function getStorageInfo() {
  return getAgenticStore().getStorageInfo()
}
