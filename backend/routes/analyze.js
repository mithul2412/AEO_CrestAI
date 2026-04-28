import { Router } from 'express'
import { computeGeoScore } from '../utils/geoScorer.js'
import { computeGeuScore } from '../utils/geuScorer.js'
import { ANALYSIS_PROMPT, LLM_CONTENT_SCORE_PROMPT } from '../models.js'
import { applyCompetitorGapScore, buildBaselineIntelligence, buildQueryIntelligence } from '../services/intelligenceScorer.js'
import { generateHighestImpactFix } from '../services/fixGeneratorService.js'
import { buildCompetitorCorpus } from '../services/competitorCorpusService.js'
import { compareUserVsCompetitors } from '../services/competitorGapService.js'
import { averageScores, runJsonModelPanel, truncateForModel } from '../services/openRouterModels.js'
import { buildQueryDiscovery } from '../services/queryDiscoveryService.js'

const router = Router()
export const FAILURE_MODES = [
  'Access Failure',
  'Extraction Failure',
  'Retrieval Failure',
  'Answer Failure',
  'Evidence Failure',
  'Structure Failure',
  'Freshness Failure',
  'Authority Risk',
  'Intent Mismatch',
  'Over-Optimization Risk',
]

function clampScore(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

export function normalizeFailureMode(value) {
  const normalized = String(value || '').trim()
  return FAILURE_MODES.includes(normalized) ? normalized : 'Answer Failure'
}

function buildOverallScore({ contentScore, geuScore, queryScore = null, llmContentScore = null }) {
  const scores = [contentScore, geuScore]
  if (typeof llmContentScore === 'number') scores.push(llmContentScore)
  if (typeof queryScore === 'number') scores.push(queryScore)
  return averageScores(scores)
}

export function normalizeQueryPayload(model, parsed) {
  return {
    model,
    verdict: String(parsed.verdict || '').trim(),
    queryMatchScore: clampScore(parsed.queryMatchScore),
    failureMode: normalizeFailureMode(parsed.failureMode),
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

async function runLlmContentScore(markdown) {
  const panel = await runJsonModelPanel({
    prompt: LLM_CONTENT_SCORE_PROMPT,
    buildContent: model => `Content:\n${truncateForModel(markdown, model)}`,
    normalize: normalizeContentPayload,
    maxTokens: 450,
  })
  const llmContentScore = averageScores(
    panel.values
      .map(modelReadout => modelReadout.llmContentScore)
      .filter(score => typeof score === 'number')
  )

  return {
    llmContentScore,
    llmContentModels: panel.values,
    llmContentStatus: panel.status,
  }
}

router.post('/', async (req, res) => {
  try {
    const {
      markdown,
      query,
      sourceSignals = {},
      baselineLlmContentScore = null,
      pageIntelligence = {},
      sourceUrl = '',
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
      const intelligence = buildBaselineIntelligence({ markdown, pageIntelligence })

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
        intelligence,
      })
    }

    const queryPanel = await runJsonModelPanel({
      prompt: ANALYSIS_PROMPT,
      buildContent: model => `Query: ${query}\n\nContent:\n${truncateForModel(markdown, model)}`,
      normalize: normalizeQueryPayload,
      maxTokens: 600,
    })
    const verdicts = queryPanel.values
    const modelStatus = queryPanel.status

    const llmQueryScore = averageScores(
      verdicts
        .map(verdict => verdict.queryMatchScore)
        .filter(score => typeof score === 'number')
    )

    const normalizedBaselineLlm = clampScore(baselineLlmContentScore)
    const queryDiscovery = buildQueryDiscovery({
      query: query.trim(),
      sourceUrl,
      markdown,
      pageIntelligence,
    })
    let searchPresence = {
      status: sourceUrl ? 'disabled' : 'disabled',
      reason: sourceUrl ? 'Competitor search did not run.' : 'sourceUrl is required for search presence',
      sourceDomain: '',
      domainRank: null,
      sourceResult: null,
      results: [],
    }
    let intelligenceBase = buildQueryIntelligence({
      markdown,
      query: query.trim(),
      pageIntelligence,
    })
    let competitorIntelligence = {
      status: 'disabled',
      reason: sourceUrl ? 'TAVILY_API_KEY is missing' : 'sourceUrl is required for competitor discovery',
      discovery: null,
      competitors: [],
      gap: null,
      failures: [],
    }

    if (sourceUrl) {
      try {
        const corpus = await buildCompetitorCorpus({
          query: query.trim(),
          sourceUrl,
          maxCompetitors: 3,
        })
        searchPresence = corpus.discovery?.searchPresence || searchPresence
        intelligenceBase = buildQueryIntelligence({
          markdown,
          query: query.trim(),
          pageIntelligence,
          searchPresence,
        })
        const gap = compareUserVsCompetitors({
          query: query.trim(),
          userChunks: intelligenceBase.chunks,
          competitorPages: corpus.competitors,
        })

        competitorIntelligence = {
          status: corpus.discovery?.status === 'ok' ? gap.status : corpus.discovery?.status || 'disabled',
          discovery: corpus.discovery,
          searchPresence,
          competitors: corpus.competitors.map(competitor => ({
            sourceId: competitor.sourceId,
            title: competitor.title,
            url: competitor.url,
            snippet: competitor.snippet,
            tavilyScore: competitor.tavilyScore,
            charCount: competitor.charCount,
            chunkCount: competitor.chunkCount,
          })),
          gap,
          failures: corpus.failures || [],
        }

        if (gap.status === 'ok' && typeof gap.competitorGapScore === 'number') {
          intelligenceBase = applyCompetitorGapScore(intelligenceBase, gap.competitorGapScore)
        }
      } catch (err) {
        competitorIntelligence = {
          status: 'error',
          error: err.message || 'Competitor discovery failed',
          discovery: null,
          searchPresence,
          competitors: [],
          gap: null,
          failures: [],
        }
      }
    }

    const highestImpactFix = generateHighestImpactFix({
      query: query.trim(),
      intelligence: intelligenceBase,
      pageIntelligence,
    })

    const deterministicQueryScore = clampScore(intelligenceBase?.citationReadiness?.score)
    const queryScore = averageScores([llmQueryScore, deterministicQueryScore])
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
      llmQueryScore,
      deterministicQueryScore,
      gapScore: queryScore != null ? contentScore - queryScore : null,
      checks,
      geuChecks,
      verdicts,
      modelStatus,
      intelligence: {
        ...intelligenceBase,
        queryDiscovery,
        searchPresence,
        competitorIntelligence,
        highestImpactFix,
      },
    })
  } catch (err) {
    const message = err?.message || 'Analysis failed'
    const status = /required|must be/i.test(message) ? 400 : 502
    res.status(status).json({ error: message })
  }
})

export default router
