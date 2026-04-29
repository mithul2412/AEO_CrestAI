import { Router } from 'express'
import { compileArtifacts } from '../services/artifactCompiler.js'
import { validateArtifacts } from '../services/artifactValidator.js'
import { computeEngineReadiness } from '../services/engineReadinessService.js'
import { extractCanonicalProfile } from '../services/profileExtractor.js'
import { getHostedProfileUrl } from '../generators/alternateLinkGenerator.js'
import { listProfiles, saveProfile } from '../storage/inMemoryAgenticStore.js'

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

function getMarkdownInput(body = {}) {
  return body.markdown || body.pageContent || body.content || ''
}

function getProfileBaseUrl() {
  return process.env.AGENTIC_PROFILE_BASE_URL || 'http://localhost:3001/agent'
}

function hostedUrls(profile) {
  const htmlUrl = getHostedProfileUrl(profile, { profileBaseUrl: getProfileBaseUrl() })
  return {
    htmlUrl,
    jsonUrl: `${htmlUrl}.json`,
    markdownUrl: `${htmlUrl}.md`,
  }
}

router.use(requireAgenticEnabled)

router.post('/generate', (req, res) => {
  try {
    const body = req.body || {}
    const markdown = getMarkdownInput(body)

    if (!markdown || typeof markdown !== 'string') {
      return res.status(400).json({ error: 'markdown required (must be a non-empty string)' })
    }

    if (body.url) {
      try {
        const parsed = new URL(body.url)
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return res.status(400).json({ error: 'url must use http or https' })
        }
      } catch {
        return res.status(400).json({ error: 'url must be a valid absolute URL' })
      }
    }

    const canonicalProfile = extractCanonicalProfile({
      url: body.url,
      markdown,
      query: body.query,
      analysis: body.analysis || body.activeAnalysis || {},
      sourceSignals: body.sourceSignals || {},
    })
    const artifacts = compileArtifacts(canonicalProfile, { profileBaseUrl: getProfileBaseUrl() })
    const validation = validateArtifacts(canonicalProfile, artifacts)
    const engineReadiness = computeEngineReadiness(canonicalProfile, artifacts, body.sourceSignals || {})
    canonicalProfile.engineReadiness = engineReadiness
    canonicalProfile.metadata.lastValidatedAt = new Date().toISOString()
    canonicalProfile.metadata.approvalRequired = Boolean(validation.approvalRequired)
    canonicalProfile.metadata.warnings = [...new Set([
      ...(canonicalProfile.metadata.warnings || []),
      ...(validation.warnings || []),
    ])]

    saveProfile({
      slug: canonicalProfile.slug,
      profile: canonicalProfile,
      artifacts,
      validation,
      engineReadiness,
    })

    res.json({
      profileId: canonicalProfile.profileId,
      slug: canonicalProfile.slug,
      canonicalProfile,
      artifacts,
      hostedProfile: hostedUrls(canonicalProfile),
      validation,
      engineReadiness,
      warnings: canonicalProfile.metadata.warnings,
    })
  } catch (err) {
    res.status(500).json({
      error: 'Agentic generation failed',
      details: [err?.message || 'Unknown error'],
    })
  }
})

router.post('/validate', (req, res) => {
  try {
    const profile = req.body?.canonicalProfile || req.body?.profile
    const artifacts = req.body?.artifacts

    if (!profile || !artifacts) {
      return res.status(400).json({ error: 'canonicalProfile and artifacts are required' })
    }

    const validation = validateArtifacts(profile, artifacts)
    const engineReadiness = computeEngineReadiness(profile, artifacts, req.body?.sourceSignals || {})
    res.json({ validation, engineReadiness })
  } catch (err) {
    res.status(500).json({
      error: 'Agentic validation failed',
      details: [err?.message || 'Unknown error'],
    })
  }
})

router.get('/profiles', (req, res) => {
  res.json({
    profiles: listProfiles(),
    storage: {
      type: 'memory',
      warning: 'In-memory hosted profiles disappear when the backend process restarts.',
    },
  })
})

export default router
