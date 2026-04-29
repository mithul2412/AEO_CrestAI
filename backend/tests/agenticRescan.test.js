import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import agenticRoutes from '../agentic/routes/agenticRoutes.js'
import {
  clearApprovalRequests,
  clearProfiles,
  getProfile,
  listApprovalRequests,
  resetAgenticStoreForTests,
} from '../agentic/storage/agenticStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtureMarkdown = fs.readFileSync(path.join(__dirname, 'fixtures', 'agenticSampleMarkdown.md'), 'utf8')

let portCounter = 5300
const originalEnableFlag = process.env.ENABLE_AGENTIC_LAYER
const originalBaseUrl = process.env.AGENTIC_PROFILE_BASE_URL

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

function generatePayload(markdown = fixtureMarkdown) {
  return {
    url: 'https://crest.example/services/ai-readiness',
    markdown,
    query: 'what does crest generate for ai systems?',
    analysis: {
      overallScore: 72,
      contentScore: 74,
      geuScore: 68,
      queryScore: 61,
      gapScore: 13,
    },
    sourceSignals: {
      sourceUrl: 'https://crest.example/services/ai-readiness',
      origin: 'https://crest.example',
      llmsTxt: { present: false, url: null },
      llmsFullTxt: { present: false, url: null },
    },
  }
}

async function seedProfile(app) {
  const generated = await request(app, 'POST', '/agentic/generate', generatePayload())
  expect(generated.status).toBe(200)
  return generated.data
}

beforeEach(() => {
  process.env.ENABLE_AGENTIC_LAYER = 'true'
  process.env.AGENTIC_PROFILE_BASE_URL = 'http://localhost:3001/agent'
  resetAgenticStoreForTests()
  clearProfiles()
  clearApprovalRequests()
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
})

test('POST /agentic/rescan/:slug returns 404 for a missing profile slug', async () => {
  const app = createApp()

  const { status, data } = await request(app, 'POST', '/agentic/rescan/missing-slug', {
    markdown: fixtureMarkdown,
  })

  expect(status).toBe(404)
  expect(data.error).toMatch(/not found/i)
})

test('rescan with unchanged markdown returns no-op and stores monitoring metadata', async () => {
  const app = createApp()
  await seedProfile(app)

  const { status, data } = await request(app, 'POST', '/agentic/rescan/crest-example', {
    markdown: fixtureMarkdown,
  })
  const stored = getProfile('crest-example')

  expect(status).toBe(200)
  expect(data).toMatchObject({
    status: 'no_changes',
    changed: false,
    changes: [],
    affectedArtifacts: [],
    validation: expect.objectContaining({ ok: true }),
    monitoring: {
      lastRescanStatus: 'no_changes',
    },
  })
  expect(stored.version).toBe(1)
  expect(stored.monitoring).toMatchObject({
    lastRescanStatus: 'no_changes',
    lastRescanSummary: 'Rescan completed with no profile changes detected.',
  })
  expect(stored.monitoring.lastScannedAt).toBeTruthy()
})

test('rescan with low-risk content change auto-publishes profile update', async () => {
  const app = createApp()
  await seedProfile(app)
  const updatedMarkdown = fixtureMarkdown.replace(
    'Crest AI Readiness Services helps healthcare software companies make their product pages easier for answer engines to crawl, understand, cite, and route to sales actions.',
    'Crest AI Readiness Services helps healthcare software companies and operations teams make their product pages easier for answer engines to crawl, understand, cite, and route to sales actions.'
  )

  const { status, data } = await request(app, 'POST', '/agentic/rescan/crest-example', {
    markdown: updatedMarkdown,
  })
  const stored = getProfile('crest-example')

  expect(status).toBe(200)
  expect(data).toMatchObject({
    status: 'auto_published',
    changed: true,
    validation: expect.objectContaining({ ok: true }),
    monitoring: expect.objectContaining({
      lastRescanStatus: 'auto_published',
    }),
  })
  expect(data.changes).toEqual([
    expect.objectContaining({
      type: 'page_content_changed',
      auto_publish_allowed: true,
    }),
  ])
  expect(data.affectedArtifacts).toEqual(expect.arrayContaining([
    'hosted_profile',
    'llms_full_txt',
    'claim_source_map',
  ]))
  expect(stored.version).toBe(2)
  expect(stored.profile.business.description).toContain('operations teams')
})

test('rescan with pricing change creates approval and does not publish', async () => {
  const app = createApp()
  await seedProfile(app)
  const updatedMarkdown = fixtureMarkdown.replace('$8,000 per month', '$12,000 per month')

  const { status, data } = await request(app, 'POST', '/agentic/rescan/crest-example', {
    markdown: updatedMarkdown,
  })
  const stored = getProfile('crest-example')
  const approvals = listApprovalRequests({ status: 'pending' })

  expect(status).toBe(200)
  expect(data).toMatchObject({
    status: 'approval_required',
    changed: true,
    validation: expect.objectContaining({ ok: true }),
    approval: expect.objectContaining({
      status: 'pending',
      slug: 'crest-example',
    }),
    monitoring: expect.objectContaining({
      lastRescanStatus: 'approval_required',
    }),
  })
  expect(data.changes).toEqual(expect.arrayContaining([
    expect.objectContaining({
      type: 'pricing_changed',
      approval_required: true,
    }),
  ]))
  expect(data.affectedArtifacts).toEqual(expect.arrayContaining([
    'hosted_profile',
    'llms_full_txt',
    'json_ld',
    'structured_service_product_data',
  ]))
  expect(approvals).toHaveLength(1)
  expect(stored.version).toBe(1)
  expect(stored.profile.claims.find(claim => claim.claimType === 'pricing').claim).toContain('$8,000')
  expect(stored.monitoring.lastRescanStatus).toBe('approval_required')
})

test('rescan with new service creates correct change event and affected artifacts', async () => {
  const app = createApp()
  await seedProfile(app)
  const updatedMarkdown = `${fixtureMarkdown}

## AI Monitoring Optimization Service

Crest provides an AI monitoring optimization service for business profile maintenance.
`

  const { status, data } = await request(app, 'POST', '/agentic/rescan/crest-example', {
    markdown: updatedMarkdown,
  })

  expect(status).toBe(200)
  expect(data.status).toBe('auto_published')
  expect(data.changes).toEqual(expect.arrayContaining([
    expect.objectContaining({
      type: 'new_service_or_product',
      path: expect.stringContaining('services.'),
      metadata: expect.objectContaining({
        item_kind: 'service',
      }),
    }),
  ]))
  expect(data.affectedArtifacts).toEqual(expect.arrayContaining([
    'hosted_profile',
    'llms_txt',
    'llms_full_txt',
    'json_ld',
    'structured_service_product_data',
  ]))
  expect(data.validation).toMatchObject({ ok: true })
})
