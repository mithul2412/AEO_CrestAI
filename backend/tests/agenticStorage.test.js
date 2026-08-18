import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFileAgenticStore } from '../agentic/storage/fileAgenticStore.js'
import { createInMemoryAgenticStore } from '../agentic/storage/inMemoryAgenticStore.js'

let tempDirs = []

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crest-agentic-store-'))
  tempDirs.push(dir)
  return dir
}

function sampleProfileInput(overrides = {}) {
  return {
    slug: 'crest-example',
    profile: {
      version: '1.0.0',
      profileId: 'profile-crest-example',
      slug: 'crest-example',
      source: {
        sourceUrl: 'https://crest.example/services',
      },
      business: {
        name: overrides.businessName || 'Crest Example',
        domain: 'crest.example',
      },
      metadata: {
        createdAt: '2026-04-27T10:00:00.000Z',
        updatedAt: overrides.profileUpdatedAt || '2026-04-27T10:00:00.000Z',
      },
    },
    artifacts: {
      llmsTxt: '# Crest Example',
    },
    validation: {
      ok: true,
      errors: [],
      warnings: [],
    },
    engineReadiness: {
      chatgpt: { score: 88, checks: [] },
    },
    hostedProfile: {
      htmlUrl: 'http://localhost:3001/agent/crest-example',
      jsonUrl: 'http://localhost:3001/agent/crest-example.json',
      markdownUrl: 'http://localhost:3001/agent/crest-example.md',
    },
    updatedAt: overrides.updatedAt || '2026-04-27T10:00:00.000Z',
  }
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

test('file agentic store persists profiles across store re-instantiation', () => {
  const dataDir = makeTempDir()
  const firstStore = createFileAgenticStore({ dataDir })

  firstStore.saveProfile(sampleProfileInput())

  const secondStore = createFileAgenticStore({ dataDir })
  const record = secondStore.getProfile('crest-example')

  expect(record).toMatchObject({
    slug: 'crest-example',
    storageVersion: 2,
    version: 1,
    createdAt: '2026-04-27T10:00:00.000Z',
    updatedAt: '2026-04-27T10:00:00.000Z',
    versionHistory: [
      expect.objectContaining({
        version: 1,
        profileId: 'profile-crest-example',
        businessName: 'Crest Example',
        updatedAt: '2026-04-27T10:00:00.000Z',
      }),
    ],
    hostedProfile: {
      htmlUrl: 'http://localhost:3001/agent/crest-example',
    },
    profile: {
      profileId: 'profile-crest-example',
      business: {
        name: 'Crest Example',
      },
    },
    artifacts: {
      llmsTxt: '# Crest Example',
    },
    validation: {
      ok: true,
    },
    engineReadiness: {
      chatgpt: {
        score: 88,
      },
    },
  })
})

test('file agentic store preserves creation time and increments current record version on update', () => {
  const dataDir = makeTempDir()
  const store = createFileAgenticStore({ dataDir })

  store.saveProfile(sampleProfileInput())
  const updated = store.saveProfile(sampleProfileInput({
    businessName: 'Crest Example Updated',
    profileUpdatedAt: '2026-04-28T10:00:00.000Z',
    updatedAt: '2026-04-28T10:00:00.000Z',
  }))

  expect(updated).toMatchObject({
    version: 2,
    createdAt: '2026-04-27T10:00:00.000Z',
    updatedAt: '2026-04-28T10:00:00.000Z',
    profile: {
      business: {
        name: 'Crest Example Updated',
      },
    },
  })

  expect(store.listProfiles()).toEqual([
    expect.objectContaining({
      slug: 'crest-example',
      version: 2,
      versionHistoryCount: 2,
      createdAt: '2026-04-27T10:00:00.000Z',
      updatedAt: '2026-04-28T10:00:00.000Z',
      validationOk: true,
    }),
  ])
})

test('file agentic store stores full version history across updates', () => {
  const dataDir = makeTempDir()
  const store = createFileAgenticStore({ dataDir })

  store.saveProfile(sampleProfileInput())
  store.saveProfile(sampleProfileInput({
    businessName: 'Crest Example Updated',
    profileUpdatedAt: '2026-04-28T10:00:00.000Z',
    updatedAt: '2026-04-28T10:00:00.000Z',
  }))

  const reloaded = createFileAgenticStore({ dataDir }).getProfile('crest-example')

  expect(reloaded.version).toBe(2)
  expect(reloaded.versionHistory).toHaveLength(2)
  expect(reloaded.versionHistory).toEqual([
    expect.objectContaining({
      version: 1,
      businessName: 'Crest Example',
      profile: expect.objectContaining({
        business: expect.objectContaining({ name: 'Crest Example' }),
      }),
      artifacts: expect.objectContaining({ llmsTxt: '# Crest Example' }),
      validation: expect.objectContaining({ ok: true }),
      engineReadiness: expect.objectContaining({
        chatgpt: expect.objectContaining({ score: 88 }),
      }),
    }),
    expect.objectContaining({
      version: 2,
      businessName: 'Crest Example Updated',
      profile: expect.objectContaining({
        business: expect.objectContaining({ name: 'Crest Example Updated' }),
      }),
    }),
  ])

  expect(reloaded.versionHistory[0].createdAt).toBe('2026-04-27T10:00:00.000Z')
  expect(reloaded.versionHistory[1].createdAt).toBe('2026-04-27T10:00:00.000Z')
})

test('memory agentic store remains the default fallback shape', () => {
  const store = createInMemoryAgenticStore()

  store.saveProfile(sampleProfileInput())

  expect(store.getStorageInfo()).toMatchObject({
    type: 'memory',
    warning: 'In-memory hosted profiles disappear when the backend process restarts.',
  })
  expect(store.getProfile('crest-example')).toMatchObject({
    slug: 'crest-example',
    version: 1,
    versionHistory: [
      expect.objectContaining({ version: 1 }),
    ],
  })
})
