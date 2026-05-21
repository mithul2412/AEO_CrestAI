// Integration tests for server setup, health endpoint, and cross-route behavior
import express from 'express'
import cors from 'cors'
import analyzeRoute from '../routes/analyze.js'
import chatRoute from '../routes/chat.js'
import fetchRoute from '../routes/fetch.js'

let portCounter = 4700

function createApp() {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '10mb' }))
  app.use('/fetch', fetchRoute)
  app.use('/analyze', analyzeRoute)
  app.use('/chat', chatRoute)
  app.get('/health', (req, res) => res.json({ ok: true }))
  return app
}

async function request(app, method, path, body) {
  const port = portCounter++
  return new Promise((resolve, reject) => {
    const server = app.listen(port, async () => {
      try {
        const { default: fetch } = await import('node-fetch')
        const opts = {
          method,
          headers: { 'Content-Type': 'application/json' },
        }
        if (body !== undefined) opts.body = JSON.stringify(body)
        const res = await fetch(`http://localhost:${port}${path}`, opts)
        const contentType = res.headers.get('content-type') || ''
        let data
        if (contentType.includes('json')) {
          data = await res.json()
        } else {
          data = await res.text()
        }
        server.close(() => resolve({ status: res.status, data, headers: res.headers }))
      } catch (e) {
        server.close(() => reject(e))
      }
    })
  })
}

const app = createApp()

/* ── Health endpoint ──────────────────────── */

test('GET /health returns 200 with ok:true', async () => {
  const { status, data } = await request(app, 'GET', '/health')
  expect(status).toBe(200)
  expect(data).toEqual({ ok: true })
})

/* ── CORS headers ─────────────────────────── */

test('responses include CORS headers', async () => {
  const { headers } = await request(app, 'GET', '/health')
  expect(headers.get('access-control-allow-origin')).toBeTruthy()
})

/* ── 404 for unknown routes ───────────────── */

test('unknown route returns 404', async () => {
  const { status } = await request(app, 'GET', '/unknown')
  expect(status).toBe(404)
})

/* ── JSON body size limit ─────────────────── */

test('POST /analyze with oversized body returns 413', async () => {
  // 10mb limit — send ~11mb
  const huge = 'x'.repeat(11 * 1024 * 1024)
  const port = portCounter++
  const result = await new Promise((resolve, reject) => {
    const server = app.listen(port, async () => {
      try {
        const { default: fetch } = await import('node-fetch')
        const res = await fetch(`http://localhost:${port}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: huge }),
        })
        server.close(() => resolve({ status: res.status }))
      } catch (e) {
        server.close(() => reject(e))
      }
    })
  })
  expect(result.status).toBe(413)
})

/* ── Analyze route content-type ───────────── */

test('POST /analyze without Content-Type fails', async () => {
  const port = portCounter++
  const result = await new Promise((resolve, reject) => {
    const server = app.listen(port, async () => {
      try {
        const { default: fetch } = await import('node-fetch')
        const res = await fetch(`http://localhost:${port}/analyze`, {
          method: 'POST',
          body: '{"markdown":"test"}',
          // No Content-Type header
        })
        server.close(() => resolve({ status: res.status }))
      } catch (e) {
        server.close(() => reject(e))
      }
    })
  })
  // Should be 400 since express.json() won't parse without content-type
  expect(result.status).toBe(400)
})

/* ── GET method on POST-only routes ───────── */

test('GET /analyze returns 404 (no GET handler)', async () => {
  const { status } = await request(app, 'GET', '/analyze')
  expect(status).toBe(404)
})

test('GET /chat returns 404 (no GET handler)', async () => {
  const { status } = await request(app, 'GET', '/chat')
  expect(status).toBe(404)
})

/* ── Analyze validates markdown types ─────── */

test('POST /analyze with number markdown returns 400', async () => {
  const { status, data } = await request(app, 'POST', '/analyze', { markdown: 123 })
  expect(status).toBe(400)
  expect(data.error).toMatch(/markdown/i)
})

test('POST /analyze with array markdown returns 400', async () => {
  const { status, data } = await request(app, 'POST', '/analyze', { markdown: ['a', 'b'] })
  expect(status).toBe(400)
  expect(data.error).toMatch(/markdown/i)
})

test('POST /analyze with boolean markdown returns 400', async () => {
  const { status, data } = await request(app, 'POST', '/analyze', { markdown: true })
  expect(status).toBe(400)
  expect(data.error).toMatch(/markdown/i)
})
