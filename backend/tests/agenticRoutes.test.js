import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import agenticRoutes from '../agentic/routes/agenticRoutes.js'
import hostedProfileRoutes from '../agentic/routes/hostedProfileRoutes.js'
import { clearProfiles } from '../agentic/storage/inMemoryAgenticStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtureMarkdown = fs.readFileSync(path.join(__dirname, 'fixtures', 'agenticSampleMarkdown.md'), 'utf8')

let portCounter = 5100
const originalEnableFlag = process.env.ENABLE_AGENTIC_LAYER
const originalBaseUrl = process.env.AGENTIC_PROFILE_BASE_URL

function createApp() {
  const app = express()
  app.use(express.json({ limit: '10mb' }))
  app.use('/agentic', agenticRoutes)
  app.use('/agent', hostedProfileRoutes)
  return app
}

async function request(app, method, url, body, headers = {}) {
  const port = portCounter++
  return new Promise((resolve, reject) => {
    const server = app.listen(port, async () => {
      try {
        const { default: fetch } = await import('node-fetch')
        const opts = {
          method,
          headers: {
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...headers,
          },
        }
        if (body !== undefined) opts.body = JSON.stringify(body)
        const res = await fetch(`http://localhost:${port}${url}`, opts)
        const contentType = res.headers.get('content-type') || ''
        let data
        if (contentType.includes('json')) {
          data = await res.json()
        } else {
          data = await res.text()
        }
        server.close(() => resolve({ status: res.status, data, headers: res.headers }))
      } catch (err) {
        server.close(() => reject(err))
      }
    })
  })
}

function generatePayload() {
  return {
    url: 'https://crest.example/services/ai-readiness',
    markdown: fixtureMarkdown,
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

async function generateProfile(app) {
  return request(app, 'POST', '/agentic/generate', generatePayload())
}

beforeEach(() => {
  clearProfiles()
  process.env.ENABLE_AGENTIC_LAYER = 'true'
  process.env.AGENTIC_PROFILE_BASE_URL = 'http://localhost:3001/agent'
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

test('POST /agentic/generate returns profile artifacts validation readiness and hosted URLs', async () => {
  const app = createApp()
  const { status, data } = await generateProfile(app)

  expect(status).toBe(200)
  expect(data.slug).toBe('crest-example')
  expect(data.profileId).toBe('profile-crest-example')
  expect(data.canonicalProfile.business.domain).toBe('crest.example')
  expect(data.artifacts.llmsTxt).toContain('http://localhost:3001/agent/crest-example')
  expect(data.validation.ok).toBe(true)
  expect(data.validation.approvalRequired).toBe(true)
  expect(data.engineReadiness.chatgpt.score).toBeGreaterThan(70)
  expect(data.hostedProfile).toEqual({
    htmlUrl: 'http://localhost:3001/agent/crest-example',
    jsonUrl: 'http://localhost:3001/agent/crest-example.json',
    markdownUrl: 'http://localhost:3001/agent/crest-example.md',
  })
  expect(data.warnings).toEqual(expect.arrayContaining([
    expect.stringContaining('pricing claim requires approval'),
  ]))
})

test('POST /agentic/generate validates missing markdown and bad URL input', async () => {
  const app = createApp()

  const missingMarkdown = await request(app, 'POST', '/agentic/generate', { url: 'https://crest.example' })
  expect(missingMarkdown.status).toBe(400)
  expect(missingMarkdown.data.error).toMatch(/markdown/i)

  const badUrl = await request(app, 'POST', '/agentic/generate', { url: 'ftp://crest.example', markdown: fixtureMarkdown })
  expect(badUrl.status).toBe(400)
  expect(badUrl.data.error).toMatch(/http/i)
})

test('POST /agentic/validate validates submitted artifacts without regenerating', async () => {
  const app = createApp()
  const generated = await generateProfile(app)

  const { status, data } = await request(app, 'POST', '/agentic/validate', {
    canonicalProfile: generated.data.canonicalProfile,
    artifacts: generated.data.artifacts,
  })

  expect(status).toBe(200)
  expect(data.validation.ok).toBe(true)
  expect(data.validation.approvalRequired).toBe(true)
  expect(data.engineReadiness.google.score).toBeGreaterThan(70)
})

test('GET /agentic/profiles lists stored generated profiles and memory storage warning', async () => {
  const app = createApp()
  await generateProfile(app)

  const { status, data } = await request(app, 'GET', '/agentic/profiles')

  expect(status).toBe(200)
  expect(data.profiles).toEqual([
    expect.objectContaining({
      slug: 'crest-example',
      profileId: 'profile-crest-example',
      domain: 'crest.example',
      validationOk: true,
    }),
  ])
  expect(data.storage).toMatchObject({
    type: 'memory',
    warning: 'In-memory hosted profiles disappear when the backend process restarts.',
  })
})

test('hosted profile routes return JSON Markdown HTML and Accept-negotiated responses', async () => {
  const app = createApp()
  await generateProfile(app)

  const jsonRoute = await request(app, 'GET', '/agent/crest-example.json')
  expect(jsonRoute.status).toBe(200)
  expect(jsonRoute.data.canonicalProfile.slug).toBe('crest-example')
  expect(jsonRoute.headers.get('vary')).toBe('Accept')

  const markdownRoute = await request(app, 'GET', '/agent/crest-example.md')
  expect(markdownRoute.status).toBe(200)
  expect(markdownRoute.data).toContain('# Crest AI Readiness Services')
  expect(markdownRoute.data).toContain('## Claims And Sources')
  expect(markdownRoute.headers.get('content-type')).toContain('text/markdown')

  const htmlRoute = await request(app, 'GET', '/agent/crest-example', undefined, { Accept: 'text/html' })
  expect(htmlRoute.status).toBe(200)
  expect(htmlRoute.data).toContain('<!doctype html>')
  expect(htmlRoute.data).toContain('Crest AI Readiness Services')
  expect(htmlRoute.headers.get('vary')).toBe('Accept')

  const jsonNegotiated = await request(app, 'GET', '/agent/crest-example', undefined, { Accept: 'application/json' })
  expect(jsonNegotiated.status).toBe(200)
  expect(jsonNegotiated.data.canonicalProfile.slug).toBe('crest-example')

  const markdownNegotiated = await request(app, 'GET', '/agent/crest-example', undefined, { Accept: 'text/markdown' })
  expect(markdownNegotiated.status).toBe(200)
  expect(markdownNegotiated.data).toContain('## Engine Readiness')
})

test('agentic and hosted routes return 503 JSON when feature flag is disabled', async () => {
  const app = createApp()
  process.env.ENABLE_AGENTIC_LAYER = 'false'

  const generate = await request(app, 'POST', '/agentic/generate', generatePayload())
  expect(generate.status).toBe(503)
  expect(generate.data).toEqual({ error: 'Agentic layer is disabled' })

  const hosted = await request(app, 'GET', '/agent/crest-example.json')
  expect(hosted.status).toBe(503)
  expect(hosted.data).toEqual({ error: 'Agentic layer is disabled' })
})
