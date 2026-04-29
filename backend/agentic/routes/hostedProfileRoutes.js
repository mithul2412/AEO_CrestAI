import { Router } from 'express'
import { buildHostedProfileHtml, buildHostedProfileJson, buildHostedProfileMarkdown } from '../services/hostedProfileService.js'
import { getProfile } from '../storage/inMemoryAgenticStore.js'

const router = Router()

function isAgenticEnabled() {
  return process.env.ENABLE_AGENTIC_LAYER !== 'false'
}

function requireAgenticEnabled(req, res, next) {
  if (!isAgenticEnabled()) {
    return res.status(503).json({ error: 'Agentic layer is disabled' })
  }
  return next()
}

function findRecord(req, res) {
  const record = getProfile(req.params.slug)
  if (!record) {
    res.status(404).json({ error: 'Hosted profile not found' })
    return null
  }
  return record
}

router.use(requireAgenticEnabled)

router.get('/:slug.json', (req, res) => {
  const record = findRecord(req, res)
  if (!record) return
  res.setHeader('Vary', 'Accept')
  res.json(buildHostedProfileJson(record))
})

router.get('/:slug.md', (req, res) => {
  const record = findRecord(req, res)
  if (!record) return
  res.setHeader('Vary', 'Accept')
  res.type('text/markdown').send(buildHostedProfileMarkdown(record))
})

router.get('/:slug', (req, res) => {
  const record = findRecord(req, res)
  if (!record) return

  const accept = req.get('accept') || ''
  res.setHeader('Vary', 'Accept')

  if (accept.includes('application/json')) {
    return res.json(buildHostedProfileJson(record))
  }

  if (accept.includes('text/markdown')) {
    return res.type('text/markdown').send(buildHostedProfileMarkdown(record))
  }

  return res.type('html').send(buildHostedProfileHtml(record))
})

export default router
