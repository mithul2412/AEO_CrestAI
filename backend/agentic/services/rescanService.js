import { compileArtifacts } from './artifactCompiler.js'
import { validateArtifacts } from './artifactValidator.js'
import { computeEngineReadiness } from './engineReadinessService.js'
import { extractCanonicalProfile } from './profileExtractor.js'
import { detectProfileChanges, resolveAffectedArtifacts } from './changeDetectionService.js'
import { createApprovalRequestForChanges } from './approvalWorkflowService.js'
import { buildRescanFeedback } from './rescanFeedbackService.js'
import { getHostedProfileUrl } from '../generators/alternateLinkGenerator.js'
import { fetchPageMarkdown } from '../../routes/fetch.js'
import {
  getProfile,
  saveProfile,
  updateProfileMonitoring,
} from '../storage/agenticStore.js'

function nowIso() {
  return new Date().toISOString()
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

function monitoring(status, summary, extra = {}) {
  const timestamp = extra.scannedAt || nowIso()
  return {
    lastScannedAt: timestamp,
    lastChangeDetectedAt: extra.changeDetected ? timestamp : extra.previous?.lastChangeDetectedAt || '',
    lastRescanStatus: status,
    lastRescanSummary: summary,
  }
}

async function resolveRescanContent(record, body = {}) {
  const providedMarkdown = getMarkdownInput(body)
  if (providedMarkdown) {
    const sourceUrl = body.url || record.profile?.source?.sourceUrl || ''
    let origin = record.profile?.source?.origin || ''
    if (!origin && sourceUrl) {
      try {
        origin = new URL(sourceUrl).origin
      } catch {
        origin = ''
      }
    }
    return {
      markdown: providedMarkdown,
      sourceSignals: {
        sourceUrl,
        origin,
        ...(body.sourceSignals || {}),
      },
      normalizedUrl: sourceUrl,
      mode: 'provided_content',
    }
  }

  const sourceUrl = record.profile?.source?.sourceUrl
  if (!sourceUrl) {
    const err = new Error('No markdown provided and stored profile has no source URL')
    err.status = 400
    throw err
  }

  return {
    ...(await fetchPageMarkdown(sourceUrl, { requestId: `rescan-${record.slug}` })),
    mode: 'source_url_fetch',
  }
}

function preparePendingProfile(record, markdown, sourceSignals, body = {}) {
  const oldProfile = record.profile || {}
  const profile = extractCanonicalProfile({
    url: sourceSignals.sourceUrl || oldProfile.source?.sourceUrl,
    markdown,
    query: body.query || oldProfile.source?.query || '',
    analysis: body.analysis || oldProfile.source?.analysisScores || {},
    sourceSignals,
  })

  profile.profileId = oldProfile.profileId || profile.profileId
  profile.slug = oldProfile.slug || profile.slug
  profile.metadata.createdAt = oldProfile.metadata?.createdAt || profile.metadata.createdAt
  profile.metadata.updatedAt = nowIso()

  return profile
}

function buildPendingArtifacts(profile, sourceSignals) {
  const artifacts = compileArtifacts(profile, { profileBaseUrl: getProfileBaseUrl() })
  const validation = validateArtifacts(profile, artifacts)
  const engineReadiness = computeEngineReadiness(profile, artifacts, sourceSignals || {})
  profile.engineReadiness = engineReadiness
  profile.metadata.lastValidatedAt = nowIso()
  profile.metadata.approvalRequired = Boolean(validation.approvalRequired)
  profile.metadata.warnings = [...new Set([
    ...(profile.metadata.warnings || []),
    ...(validation.warnings || []),
  ])]
  return { artifacts, validation, engineReadiness }
}

export async function rescanAgenticProfile(slug, body = {}) {
  const record = getProfile(slug)
  if (!record) {
    const err = new Error('Stored agentic profile not found')
    err.status = 404
    throw err
  }

  const resolved = await resolveRescanContent(record, body)
  const pendingProfile = preparePendingProfile(record, resolved.markdown, resolved.sourceSignals, body)
  const changeEvents = detectProfileChanges(record.profile, pendingProfile)
  const affectedArtifacts = resolveAffectedArtifacts(changeEvents)
  const { artifacts, validation, engineReadiness } = buildPendingArtifacts(pendingProfile, resolved.sourceSignals)

  if (changeEvents.length === 0) {
    const nextMonitoring = monitoring('no_changes', 'Rescan completed with no profile changes detected.', {
      previous: record.monitoring,
    })
    updateProfileMonitoring(slug, nextMonitoring)
    const feedback = await buildRescanFeedback({
      status: 'no_changes',
      mode: resolved.mode,
      record,
      pendingProfile,
      changes: [],
      affectedArtifacts: [],
      validation,
    })
    return {
      status: 'no_changes',
      changed: false,
      slug,
      mode: resolved.mode,
      changes: [],
      affectedArtifacts: [],
      affected_artifacts: [],
      validation,
      engineReadiness,
      monitoring: nextMonitoring,
      feedback,
    }
  }

  const hostedProfile = hostedUrls(pendingProfile)
  const sensitiveChanges = changeEvents.filter(event => event.approval_required)

  if (sensitiveChanges.length > 0) {
    const approval = createApprovalRequestForChanges({
      slug,
      profileId: pendingProfile.profileId,
      changeEvents,
      pendingProfile,
      pendingArtifacts: artifacts,
      pendingValidation: validation,
      pendingEngineReadiness: engineReadiness,
      pendingHostedProfile: hostedProfile,
    })
    const nextMonitoring = monitoring('approval_required', `${sensitiveChanges.length} change(s) require approval before publishing.`, {
      changeDetected: true,
      previous: record.monitoring,
    })
    updateProfileMonitoring(slug, nextMonitoring)
    const feedback = await buildRescanFeedback({
      status: 'approval_required',
      mode: resolved.mode,
      record,
      pendingProfile,
      changes: changeEvents,
      affectedArtifacts,
      validation,
    })

    return {
      status: 'approval_required',
      changed: true,
      slug,
      mode: resolved.mode,
      changes: changeEvents,
      affectedArtifacts,
      affected_artifacts: affectedArtifacts,
      validation,
      engineReadiness,
      approval,
      monitoring: nextMonitoring,
      feedback,
    }
  }

  const nextMonitoring = monitoring('auto_published', `${changeEvents.length} low-risk change(s) auto-published.`, {
    changeDetected: true,
    previous: record.monitoring,
  })
  const publishedProfile = saveProfile({
    slug,
    profile: pendingProfile,
    artifacts,
    validation,
    engineReadiness,
    hostedProfile,
    changeEvents,
    monitoring: nextMonitoring,
  })
  const feedback = await buildRescanFeedback({
    status: 'auto_published',
    mode: resolved.mode,
    record,
    pendingProfile,
    changes: changeEvents,
    affectedArtifacts,
    validation,
  })

  return {
    status: 'auto_published',
    changed: true,
    slug,
    mode: resolved.mode,
    changes: changeEvents,
    affectedArtifacts,
    affected_artifacts: affectedArtifacts,
    validation,
    engineReadiness,
    publishedProfile,
    monitoring: nextMonitoring,
    feedback,
  }
}
