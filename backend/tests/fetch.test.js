// Tests for fetch route - module, validation, and url normalization
import express from 'express'
import fetchRoute from '../routes/fetch.js'

const app = express()
app.use('/fetch', fetchRoute)

let portCounter = 4100

function fetchJSON(path) {
  const port = portCounter++
  return new Promise((resolve, reject) => {
    const server = app.listen(port, async () => {
      try {
        const { default: fetch } = await import('node-fetch')
        const res = await fetch(`http://localhost:${port}${path}`)
        const data = await res.json()
        server.close(() => resolve({ status: res.status, data }))
      } catch (e) {
        server.close(() => reject(e))
      }
    })
  })
}

test('fetch route module exports a router', async () => {
  const mod = await import('../routes/fetch.js')
  expect(mod.default).toBeDefined()
})

test('truncate utility is importable', async () => {
  const { truncateMarkdown } = await import('../utils/truncate.js')
  expect(typeof truncateMarkdown).toBe('function')
})

test('geoScorer is importable', async () => {
  const { computeGeoScore } = await import('../utils/geoScorer.js')
  expect(typeof computeGeoScore).toBe('function')
})

test('geuScorer is importable', async () => {
  const { computeGeuScore } = await import('../utils/geuScorer.js')
  expect(typeof computeGeuScore).toBe('function')
})

test('normalizeFetchUrl adds https:// for bare domains', async () => {
  const { normalizeFetchUrl } = await import('../routes/fetch.js')
  expect(normalizeFetchUrl('www.xfinity.com')).toBe('https://www.xfinity.com/')
})

test('normalizeFetchUrl preserves fully-qualified urls', async () => {
  const { normalizeFetchUrl } = await import('../routes/fetch.js')
  expect(normalizeFetchUrl('https://example.com/path')).toBe('https://example.com/path')
})

test('missing url param returns 400', async () => {
  const { status, data } = await fetchJSON('/fetch')
  expect(status).toBe(400)
  expect(data.error).toMatch(/url/i)
})

test('empty url param returns 400', async () => {
  const { status, data } = await fetchJSON('/fetch?url=')
  expect(status).toBe(400)
  expect(data.error).toMatch(/url/i)
})

test('fetch route is a function (Express router)', async () => {
  const mod = await import('../routes/fetch.js')
  expect(typeof mod.default).toBe('function')
})
