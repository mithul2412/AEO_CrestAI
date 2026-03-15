import { Router } from 'express'
import fetch from 'node-fetch'
import { computeGeoScore } from '../utils/geoScorer.js'
import { computeGeuScore } from '../utils/geuScorer.js'
import { truncateMarkdown } from '../utils/truncate.js'
import { ANALYSIS_PROMPT, LLM_CONTENT_SCORE_PROMPT } from '../models.js'

const router = Router()
const OPENROUTER_CONTEXT_TOKENS = 3000
const GROQ_CONTEXT_TOKENS = 1600
const LLM_TIMEOUT_MS = 30_000

function buildProviderError(provider, status, rawText = '') {
  const compact = rawText ? rawText.replace(/\s+/g, ' ').trim() : ''
  if (status === 413) {
    return `${provider} error 413: request too large (content exceeds provider limit).`
  }
  return compact
    ? `${provider} error ${status}: ${compact}`
    : `${provider} error ${status}`
}

function clampScore(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    const jsonMatch = String(text || '').match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Model did not return valid JSON')
    return JSON.parse(jsonMatch[0])
  }
}

function averageScores(scores) {
  if (scores.length === 0) return null
  return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
}

function buildOverallScore({ contentScore, geuScore, queryScore = null, llmContentScore = null }) {
  const scores = [contentScore, geuScore]
  if (typeof llmContentScore === 'number') scores.push(llmContentScore)
  if (typeof queryScore === 'number') scores.push(queryScore)
  return averageScores(scores)
}

function normalizeQueryPayload(model, parsed) {
  return {
    model,
    verdict: String(parsed.verdict || '').trim(),
    queryMatchScore: clampScore(parsed.queryMatchScore),
    topGap: String(parsed.topGap || '').trim(),
    suggestedFix: String(parsed.suggestedFix || '').trim(),
  }
}

function normalizeContentPayload(model, parsed) {
  return {
    model,
    llmContentScore: clampScore(parsed.llmContentScore),
    briefReason: String(parsed.briefReason || '').trim(),
  }
}

async function callGroq(prompt, content, normalizer) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('Missing GROQ_API_KEY')
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content }
      ],
      temperature: 0.2,
      max_tokens: 450,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(buildProviderError('Groq', res.status, err))
  }

  const data = await res.json()
  return normalizer('Llama 3.3', safeJsonParse(data.choices?.[0]?.message?.content || ''))
}

async function callOpenRouter(prompt, content, normalizer) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('Missing OPENROUTER_API_KEY')
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3-super-120b-a12b:free',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content }
      ],
      max_tokens: 450,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(buildProviderError('OpenRouter', res.status, err))
  }

  const data = await res.json()
  return normalizer('Nemotron 120B', safeJsonParse(data.choices?.[0]?.message?.content || ''))
}

function mapSettledStatus(settledResult, model) {
  if (settledResult.status === 'fulfilled') {
    return { model, status: 'ok' }
  }
  return {
    model,
    status: 'error',
    error: settledResult.reason?.message || `Unknown ${model} error`
  }
}

async function runLlmContentScore(markdown) {
  const truncatedForGroq = truncateMarkdown(markdown, GROQ_CONTEXT_TOKENS)
  const truncatedForOpenRouter = truncateMarkdown(markdown, OPENROUTER_CONTEXT_TOKENS)

  const [groqResult, openRouterResult] = await Promise.allSettled([
    callGroq(LLM_CONTENT_SCORE_PROMPT, `Content:\n${truncatedForGroq}`, normalizeContentPayload),
    callOpenRouter(LLM_CONTENT_SCORE_PROMPT, `Content:\n${truncatedForOpenRouter}`, normalizeContentPayload),
  ])

  const llmContentModels = []
  const llmContentStatus = [
    mapSettledStatus(groqResult, 'Llama 3.3'),
    mapSettledStatus(openRouterResult, 'Nemotron 120B'),
  ]

  if (groqResult.status === 'fulfilled') llmContentModels.push(groqResult.value)
  if (openRouterResult.status === 'fulfilled') llmContentModels.push(openRouterResult.value)

  const llmContentScore = averageScores(
    llmContentModels
      .map(modelReadout => modelReadout.llmContentScore)
      .filter(score => typeof score === 'number')
  )

  return { llmContentScore, llmContentModels, llmContentStatus }
}

router.post('/', async (req, res) => {
  try {
    const {
      markdown,
      query,
      sourceSignals = {},
      baselineLlmContentScore = null,
    } = req.body || {}

    if (!markdown || typeof markdown !== 'string') {
      return res.status(400).json({ error: 'markdown required (must be a string)' })
    }

    const { score: contentScore, checks } = computeGeoScore(markdown, { sourceSignals })
    const { score: geuScore, checks: geuChecks } = computeGeuScore(markdown, { sourceSignals })

    if (!query || !query.trim()) {
      const {
        llmContentScore,
        llmContentModels,
        llmContentStatus,
      } = await runLlmContentScore(markdown)

      const overallScore = buildOverallScore({ contentScore, geuScore, llmContentScore })

      return res.json({
        contentScore,
        geuScore,
        llmContentScore,
        llmContentModels,
        llmContentStatus,
        overallScore,
        queryScore: null,
        gapScore: null,
        checks,
        geuChecks,
        verdicts: [],
        modelStatus: [],
      })
    }

    const truncatedForGroq = truncateMarkdown(markdown, GROQ_CONTEXT_TOKENS)
    const truncatedForOpenRouter = truncateMarkdown(markdown, OPENROUTER_CONTEXT_TOKENS)

    const [groqResult, openRouterResult] = await Promise.allSettled([
      callGroq(ANALYSIS_PROMPT, `Query: ${query}\n\nContent:\n${truncatedForGroq}`, normalizeQueryPayload),
      callOpenRouter(ANALYSIS_PROMPT, `Query: ${query}\n\nContent:\n${truncatedForOpenRouter}`, normalizeQueryPayload),
    ])

    const verdicts = []
    if (groqResult.status === 'fulfilled') verdicts.push(groqResult.value)
    if (openRouterResult.status === 'fulfilled') verdicts.push(openRouterResult.value)

    const modelStatus = [
      mapSettledStatus(groqResult, 'Llama 3.3'),
      mapSettledStatus(openRouterResult, 'Nemotron 120B'),
    ]

    const queryScore = averageScores(
      verdicts
        .map(verdict => verdict.queryMatchScore)
        .filter(score => typeof score === 'number')
    )

    const normalizedBaselineLlm = clampScore(baselineLlmContentScore)
    const overallScore = buildOverallScore({
      contentScore,
      geuScore,
      queryScore,
      llmContentScore: normalizedBaselineLlm,
    })

    res.json({
      contentScore,
      geuScore,
      llmContentScore: normalizedBaselineLlm,
      llmContentModels: [],
      llmContentStatus: [],
      overallScore,
      queryScore,
      gapScore: queryScore != null ? contentScore - queryScore : null,
      checks,
      geuChecks,
      verdicts,
      modelStatus,
    })
  } catch (err) {
    const message = err?.message || 'Analysis failed'
    const status = /required|must be/i.test(message) ? 400 : 502
    res.status(status).json({ error: message })
  }
})

export default router
