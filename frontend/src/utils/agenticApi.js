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

async function getJson(path) {
  const res = await fetch(path)

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

export function listAgenticProfiles() {
  return getJson('/agentic/profiles')
}

export function rescanAgenticProfile(slug, payload = {}) {
  return postJson(`/agentic/rescan/${encodeURIComponent(slug)}`, payload)
}

export function listAgenticApprovals(params = {}) {
  const query = params.status ? `?status=${encodeURIComponent(params.status)}` : ''
  return getJson(`/agentic/approvals${query}`)
}

export function getAgenticApproval(id) {
  return getJson(`/agentic/approvals/${encodeURIComponent(id)}`)
}

export function approveAgenticApproval(id, payload = {}) {
  return postJson(`/agentic/approvals/${encodeURIComponent(id)}/approve`, payload)
}

export function rejectAgenticApproval(id, payload = {}) {
  return postJson(`/agentic/approvals/${encodeURIComponent(id)}/reject`, payload)
}
