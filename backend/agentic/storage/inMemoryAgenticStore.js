import { buildProfileRecord, summarizeProfileRecord } from './profileRecord.js'

export function createInMemoryAgenticStore() {
  const profilesBySlug = new Map()

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
