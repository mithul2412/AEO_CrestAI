import { getOpenRouterCredentials, runChatModelPanel } from '../../services/openRouterModels.js'

const MAX_VALUE_LENGTH = 600

function statusLabel(value) {
  return String(value || 'not_scanned').replace(/_/g, ' ')
}

function compactValue(value) {
  if (value == null || value === '') return 'Not detected'
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}...` : text
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))]
}

function summarizeChange(change = {}) {
  return {
    type: change.type || 'page_content_changed',
    path: change.path || 'profile',
    severity: change.severity || 'medium',
    approvalRequired: Boolean(change.approval_required || change.requiresApproval),
    autoPublishAllowed: Boolean(change.auto_publish_allowed),
    affectedArtifacts: change.affectedArtifacts || change.affected_artifacts || [],
    oldValue: compactValue(change.oldValue),
    newValue: compactValue(change.newValue),
  }
}

export function buildRuleBasedRescanFeedback({
  status,
  mode,
  changes = [],
  affectedArtifacts = [],
  validation = null,
} = {}) {
  const changeSummaries = changes.map(summarizeChange)
  const approvalRequiredChanges = changeSummaries.filter(change => change.approvalRequired)
  const autoPublishableChanges = changeSummaries.filter(change => !change.approvalRequired)
  const normalizedArtifacts = unique([
    ...affectedArtifacts,
    ...changeSummaries.flatMap(change => change.affectedArtifacts),
  ])

  let summary = 'Rescan completed.'
  let recommendation = 'Review the detected changes before using the generated artifacts.'
  let severity = 'info'

  if (status === 'no_changes') {
    summary = 'Rescan completed with no profile changes detected.'
    recommendation = 'No publishing action is needed. The current AI-readable profile can remain active.'
    severity = 'ok'
  } else if (status === 'auto_published') {
    summary = `${changes.length} low-risk change(s) were detected and auto-published.`
    recommendation = normalizedArtifacts.length
      ? `Review the updated ${normalizedArtifacts.map(statusLabel).join(', ')} artifacts when convenient.`
      : 'Review the updated hosted profile when convenient.'
    severity = 'ok'
  } else if (status === 'approval_required') {
    summary = `${approvalRequiredChanges.length} sensitive change(s) require approval before publishing.`
    recommendation = 'Review the pending approval details and approve only after confirming the new values are accurate.'
    severity = 'warn'
  }

  return {
    status,
    mode,
    severity,
    summary,
    recommendation,
    changed: changes.length > 0,
    changeCount: changes.length,
    approvalRequiredCount: approvalRequiredChanges.length,
    autoPublishableCount: autoPublishableChanges.length,
    affectedArtifacts: normalizedArtifacts,
    validationOk: validation ? Boolean(validation.ok) : null,
    changeSummaries,
  }
}

function buildLlmPrompt() {
  return `You are Crest.ai's agentic profile monitoring assistant.
Explain a manual rescan result to a business user in plain English.
Use only the rule-based rescan data provided by the user.
Do not invent facts, numbers, approvals, policies, or artifacts.
If approval is required, clearly say the user should verify the sensitive change before publishing.
If there are no changes, keep the answer short and reassuring.
Return 2-4 concise sentences.`
}

function buildLlmInput({ slug, businessName, sourceUrl, ruleBased, changes }) {
  return JSON.stringify({
    profile: {
      slug,
      businessName,
      sourceUrl,
    },
    ruleBasedFeedback: ruleBased,
    detectedChanges: changes.map(summarizeChange),
  }, null, 2)
}

async function generateLlmRescanFeedback(input) {
  if (getOpenRouterCredentials().length === 0) {
    return {
      status: 'disabled',
      message: '',
      reason: 'OPENROUTER_API_KEY is not configured.',
      modelStatus: [],
    }
  }

  try {
    const panel = await runChatModelPanel({
      systemContent: buildLlmPrompt(),
      messages: [
        {
          role: 'user',
          content: buildLlmInput(input),
        },
      ],
      maxTokens: 500,
      temperature: 0.25,
      timeoutMs: 20_000,
    })
    const response = panel.responses.find(item => item.response?.trim())

    if (!response) {
      return {
        status: 'error',
        message: '',
        reason: 'No LLM feedback response was returned.',
        modelStatus: panel.status || [],
      }
    }

    return {
      status: 'ok',
      message: response.response.trim(),
      model: response.model,
      modelId: response.modelId,
      modelStatus: panel.status || [],
    }
  } catch (err) {
    return {
      status: 'error',
      message: '',
      reason: err?.message || 'LLM feedback generation failed.',
      modelStatus: [],
    }
  }
}

function combineFeedback(ruleBased, llm) {
  return [
    ruleBased.summary,
    ruleBased.recommendation,
    llm.status === 'ok' ? llm.message : '',
  ].filter(Boolean).join('\n\n')
}

export async function buildRescanFeedback({
  status,
  mode,
  record,
  pendingProfile,
  changes = [],
  affectedArtifacts = [],
  validation = null,
} = {}) {
  const ruleBased = buildRuleBasedRescanFeedback({
    status,
    mode,
    changes,
    affectedArtifacts,
    validation,
  })
  const llm = await generateLlmRescanFeedback({
    slug: record?.slug || pendingProfile?.slug || '',
    businessName: pendingProfile?.business?.name || record?.profile?.business?.name || '',
    sourceUrl: pendingProfile?.source?.sourceUrl || record?.profile?.source?.sourceUrl || '',
    ruleBased,
    changes,
  })

  return {
    ruleBased,
    llm,
    message: combineFeedback(ruleBased, llm),
  }
}
