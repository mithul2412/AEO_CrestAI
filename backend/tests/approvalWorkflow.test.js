import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import agenticRoutes from '../agentic/routes/agenticRoutes.js'
import { compileArtifacts } from '../agentic/services/artifactCompiler.js'
import { validateArtifacts } from '../agentic/services/artifactValidator.js'
import { computeEngineReadiness } from '../agentic/services/engineReadinessService.js'
import { extractCanonicalProfile } from '../agentic/services/profileExtractor.js'
import { detectProfileChanges } from '../agentic/services/changeDetectionService.js'
import { createApprovalRequestForChanges } from '../agentic/services/approvalWorkflowService.js'
import { createFileAgenticStore } from '../agentic/storage/fileAgenticStore.js'
import {
  clearApprovalRequests,
  clearProfiles,
  getApprovalRequest,
  getProfile,
  resetAgenticStoreForTests,
  saveProfile,
} from '../agentic/storage/agenticStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtureMarkdown = fs.readFileSync(path.join(__dirname, 'fixtures', 'agenticSampleMarkdown.md'), 'utf8')

let portCounter = 5200
let tempDirs = []
const originalEnableFlag = process.env.ENABLE_AGENTIC_LAYER
const originalBaseUrl = process.env.AGENTIC_PROFILE_BASE_URL
const originalStorage = process.env.AGENTIC_PROFILE_STORAGE
const originalDataDir = process.env.AGENTIC_PROFILE_DATA_DIR

function createApp() {
  const app = express()
  app.use(express.json({ limit: '10mb' }))
  app.use('/agentic', agenticRoutes)
  return app
}

async function request(app, method, url, body) {
  const port = portCounter++
  return new Promise((resolve, reject) => {
    const server = app.listen(port, async () => {
      try {
        const { default: fetch } = await import('node-fetch')
        const opts = {
          method,
          headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        }
        if (body !== undefined) opts.body = JSON.stringify(body)
        const res = await fetch(`http://localhost:${port}${url}`, opts)
        const data = await res.json()
        server.close(() => resolve({ status: res.status, data }))
      } catch (err) {
        server.close(() => reject(err))
      }
    })
  })
}

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crest-agentic-approvals-'))
  tempDirs.push(dir)
  return dir
}

function buildProfile() {
  return extractCanonicalProfile({
    url: 'https://crest.example/services/ai-readiness',
    markdown: fixtureMarkdown,
    sourceSignals: {
      sourceUrl: 'https://crest.example/services/ai-readiness',
      origin: 'https://crest.example',
    },
  })
}

function buildPendingArtifacts(profile) {
  const artifacts = compileArtifacts(profile, {
    profileBaseUrl: 'http://localhost:3001/agent',
  })
  const validation = validateArtifacts(profile, artifacts)
  const engineReadiness = computeEngineReadiness(profile, artifacts, {
    sourceUrl: profile.source.sourceUrl,
    origin: profile.source.origin,
  })
  return { artifacts, validation, engineReadiness }
}

function changePricing(profile, text = 'Pricing starts at $12,000 per month for managed readiness programs.') {
  return {
    ...profile,
    claims: profile.claims.map(claim => claim.claimType === 'pricing'
      ? {
          ...claim,
          claim: text,
          sourceText: text,
        }
      : claim),
    metadata: {
      ...profile.metadata,
      updatedAt: '2026-04-28T10:00:00.000Z',
    },
  }
}

function seedBaseProfile() {
  const profile = buildProfile()
  const { artifacts, validation, engineReadiness } = buildPendingArtifacts(profile)
  saveProfile({
    slug: profile.slug,
    profile,
    artifacts,
    validation,
    engineReadiness,
    hostedProfile: {
      htmlUrl: `http://localhost:3001/agent/${profile.slug}`,
      jsonUrl: `http://localhost:3001/agent/${profile.slug}.json`,
      markdownUrl: `http://localhost:3001/agent/${profile.slug}.md`,
    },
    updatedAt: '2026-04-27T10:00:00.000Z',
  })
  return profile
}

function createPricingApproval() {
  const oldProfile = seedBaseProfile()
  const pendingProfile = changePricing(oldProfile)
  const changeEvents = detectProfileChanges(oldProfile, pendingProfile)
  const { artifacts, validation, engineReadiness } = buildPendingArtifacts(pendingProfile)

  return createApprovalRequestForChanges({
    slug: pendingProfile.slug,
    profileId: pendingProfile.profileId,
    changeEvents,
    pendingProfile,
    pendingArtifacts: artifacts,
    pendingValidation: validation,
    pendingEngineReadiness: engineReadiness,
    pendingHostedProfile: {
      htmlUrl: `http://localhost:3001/agent/${pendingProfile.slug}`,
      jsonUrl: `http://localhost:3001/agent/${pendingProfile.slug}.json`,
      markdownUrl: `http://localhost:3001/agent/${pendingProfile.slug}.md`,
    },
    createdAt: '2026-04-28T10:01:00.000Z',
  })
}

beforeEach(() => {
  process.env.ENABLE_AGENTIC_LAYER = 'true'
  process.env.AGENTIC_PROFILE_BASE_URL = 'http://localhost:3001/agent'
  delete process.env.AGENTIC_PROFILE_STORAGE
  delete process.env.AGENTIC_PROFILE_DATA_DIR
  resetAgenticStoreForTests()
  clearProfiles()
  clearApprovalRequests()
})

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

afterAll(() => {
  if (originalEnableFlag === undefined) {
    delete process.env.ENABLE_AGENTIC_LAYER
  } else {
    process.env.ENABLE_AGENTIC_LAYER = originalEnableFlag
  }

  if (originalBaseUrl === undefined) {
    delete process.env.AGENTIC_PROFILE_BASE_URL
  } else {
    process.env.AGENTIC_PROFILE_BASE_URL = originalBaseUrl
  }

  if (originalStorage === undefined) {
    delete process.env.AGENTIC_PROFILE_STORAGE
  } else {
    process.env.AGENTIC_PROFILE_STORAGE = originalStorage
  }

  if (originalDataDir === undefined) {
    delete process.env.AGENTIC_PROFILE_DATA_DIR
  } else {
    process.env.AGENTIC_PROFILE_DATA_DIR = originalDataDir
  }
})

test('approval request is created from pricing change event', () => {
  const approval = createPricingApproval()

  expect(approval).toMatchObject({
    status: 'pending',
    slug: 'crest-example',
    profileId: 'profile-crest-example',
    affectedArtifacts: expect.arrayContaining([
      'hosted_profile',
      'llms_full_txt',
      'json_ld',
      'structured_service_product_data',
    ]),
    eventSummaries: [
      expect.objectContaining({
        type: 'pricing_changed',
        approval_required: true,
      }),
    ],
  })
  expect(approval.changeEventIds).toHaveLength(1)
  expect(approval.oldValues[0].value).toContain('Pricing starts')
  expect(approval.newValues[0].value).toContain('$12,000')
})

test('GET /agentic/approvals lists pending approvals', async () => {
  const app = createApp()
  const approval = createPricingApproval()

  const { status, data } = await request(app, 'GET', '/agentic/approvals?status=pending')

  expect(status).toBe(200)
  expect(data.approvals).toEqual([
    expect.objectContaining({
      id: approval.id,
      status: 'pending',
      slug: 'crest-example',
      changeEventIds: approval.changeEventIds,
    }),
  ])
})

test('GET /agentic/approvals/:id returns approval details', async () => {
  const app = createApp()
  const approval = createPricingApproval()

  const { status, data } = await request(app, 'GET', `/agentic/approvals/${approval.id}`)

  expect(status).toBe(200)
  expect(data.approval).toMatchObject({
    id: approval.id,
    status: 'pending',
    pendingUpdate: {
      profile: {
        slug: 'crest-example',
      },
    },
  })
})

test('POST /agentic/approvals/:id/approve approves and publishes pending profile', async () => {
  const app = createApp()
  const approval = createPricingApproval()

  const { status, data } = await request(app, 'POST', `/agentic/approvals/${approval.id}/approve`, {
    reviewerNote: 'Pricing update approved.',
    reviewedBy: 'test-reviewer',
  })

  const stored = getProfile('crest-example')
  const updatedApproval = getApprovalRequest(approval.id)

  expect(status).toBe(200)
  expect(data.approval).toMatchObject({
    id: approval.id,
    status: 'approved',
    reviewerNote: 'Pricing update approved.',
  })
  expect(stored.version).toBe(2)
  expect(stored.versionHistory).toHaveLength(2)
  expect(stored.profile.claims.find(claim => claim.claimType === 'pricing').claim).toContain('$12,000')
  expect(stored.approval).toMatchObject({
    id: approval.id,
    status: 'approved',
    reviewedBy: 'test-reviewer',
    reviewerNote: 'Pricing update approved.',
  })
  expect(stored.approval.reviewedAt).toBeTruthy()
  expect(updatedApproval.audit.publishedVersion).toBe(2)
})

test('POST /agentic/approvals/:id/reject rejects without publishing sensitive changes', async () => {
  const app = createApp()
  const approval = createPricingApproval()

  const { status, data } = await request(app, 'POST', `/agentic/approvals/${approval.id}/reject`, {
    reviewerNote: 'Pricing needs legal review.',
  })

  const stored = getProfile('crest-example')

  expect(status).toBe(200)
  expect(data.approval).toMatchObject({
    id: approval.id,
    status: 'rejected',
    reviewerNote: 'Pricing needs legal review.',
  })
  expect(stored.version).toBe(1)
  expect(stored.versionHistory).toHaveLength(1)
  expect(stored.profile.claims.find(claim => claim.claimType === 'pricing').claim).not.toContain('$12,000')
})

test('approval survives store re-instantiation when file storage is enabled', () => {
  const dataDir = makeTempDir()
  resetAgenticStoreForTests(createFileAgenticStore({ dataDir }))
  const approval = createPricingApproval()

  resetAgenticStoreForTests(createFileAgenticStore({ dataDir }))
  const reloaded = getApprovalRequest(approval.id)

  expect(reloaded).toMatchObject({
    id: approval.id,
    status: 'pending',
    slug: 'crest-example',
    pendingUpdate: {
      profile: {
        slug: 'crest-example',
      },
    },
  })
})
