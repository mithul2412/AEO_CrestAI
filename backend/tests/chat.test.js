// Tests for chat route — validation, edge cases, input handling
import express from 'express'
import chatRoute from '../routes/chat.js'

const app = express()
app.use(express.json({ limit: '10mb' }))
app.use('/chat', chatRoute)

let portCounter = 4300

async function postJSON(path, body) {
  const port = portCounter++
  return new Promise((resolve, reject) => {
    const server = app.listen(port, async () => {
      try {
        const { default: fetch } = await import('node-fetch')
        const res = await fetch(`http://localhost:${port}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        const data = await res.json()
        server.close(() => resolve({ status: res.status, data }))
      } catch (e) {
        server.close(() => reject(e))
      }
    })
  })
}

/* ── Validation tests ─────────────────────── */

test('empty messages array returns 400', async () => {
  const { status, data } = await postJSON('/chat', { messages: [] })
  expect(status).toBe(400)
  expect(data.error).toBeTruthy()
})

test('missing messages returns 400', async () => {
  const { status, data } = await postJSON('/chat', { markdown: 'some content' })
  expect(status).toBe(400)
  expect(data.error).toBeTruthy()
})

test('messages as string returns 400', async () => {
  const { status, data } = await postJSON('/chat', { messages: 'not an array' })
  expect(status).toBe(400)
  expect(data.error).toBeTruthy()
})

test('messages as number returns 400', async () => {
  const { status, data } = await postJSON('/chat', { messages: 42 })
  expect(status).toBe(400)
  expect(data.error).toBeTruthy()
})

test('messages as object returns 400', async () => {
  const { status, data } = await postJSON('/chat', { messages: { role: 'user', content: 'hi' } })
  expect(status).toBe(400)
  expect(data.error).toBeTruthy()
})

test('null messages returns 400', async () => {
  const { status, data } = await postJSON('/chat', { messages: null })
  expect(status).toBe(400)
  expect(data.error).toBeTruthy()
})

test('empty body returns 400', async () => {
  const { status, data } = await postJSON('/chat', {})
  expect(status).toBe(400)
  expect(data.error).toBeTruthy()
})
