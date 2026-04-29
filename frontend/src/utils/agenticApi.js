import { readApiError } from './api.js'

async function postJson(path, payload) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    throw new Error(await readApiError(res, `Agentic API error: ${res.status}`))
  }

  return res.json()
}

export function generateAgenticLayer(payload) {
  return postJson('/agentic/generate', payload)
}

export function validateAgenticArtifacts(payload) {
  return postJson('/agentic/validate', payload)
}
