import { Router } from 'express'
import { computeGeoScore } from '../utils/geoScorer.js'
import { computeGeuScore } from '../utils/geuScorer.js'
import { ANALYSIS_PROMPT, DYNAMIC_FIX_PROMPT, LLM_CONTENT_SCORE_PROMPT, QUERY_SUGGESTION_PROMPT } from '../models.js'
import { applyCompetitorGapScore, buildBaselineIntelligence, buildQueryIntelligence } from '../services/intelligenceScorer.js'
import { generateHighestImpactFix } from '../services/fixGeneratorService.js'
import { buildCompetitorCorpus } from '../services/competitorCorpusService.js'
import { compareUserVsCompetitors } from '../services/competitorGapService.js'
import { buildCompetitorMap } from '../services/competitorMapService.js'
import { averageScores, getLlamaQueryModel, runJsonModelPanel, runSingleJsonModel } from '../services/openRouterModels.js'
import { buildQueryDiscovery } from '../services/queryDiscoveryService.js'
import { packContextForBaseline, packContextForQuery } from '../services/contextPacker.js'

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

function pageBrandFromSource(sourceUrl = '', pageIntelligence = {}) {
  const title = String(pageIntelligence?.extraction?.title || pageIntelligence?.extraction?.h1 || '').trim()
  if (title) {
    return title
      .replace(/\s+[|-]\s+.*$/, '')
      .replace(/\b(pricing|plans|features|home|homepage)\b/ig, '')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join(' ') || 'this page'
  }

  try {
    const parsed = new URL(sourceUrl)
    const base = parsed.hostname.replace(/^www\./, '').split('.')[0]
    return base ? base[0].toUpperCase() + base.slice(1) : 'this page'
  } catch {
    return 'this page'
  }
}

export function fallbackQuerySuggestions({ sourceUrl = '', pageIntelligence = {} } = {}) {
  const brand = pageBrandFromSource(sourceUrl, pageIntelligence)
  return [
    `What is ${brand} best for?`,
    `How does ${brand} compare to alternatives?`,
    `What should buyers know about ${brand}?`,
  ]
}

export function normalizeQuerySuggestionsPayload(model, parsed, fallback = []) {
  const seen = new Set()
  const queries = (Array.isArray(parsed?.queries) ? parsed.queries : [])
    .map(query => String(query || '').replace(/\s+/g, ' ').trim())
    .filter(query => query.length >= 12 && query.length <= 120)
    .map(query => query.endsWith('?') ? query : `${query}?`)
    .filter(query => {
      const key = query.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 3)

  return {
    model,
    queries: queries.length === 3 ? queries : fallback,
  }
}

function normalizeExpectedLift(value = {}) {
  return {
    retrievalScore: String(value.retrievalScore || '+0').trim(),
    answerScore: String(value.answerScore || '+0').trim(),
    evidenceScore: String(value.evidenceScore || '+0').trim(),
  }
}

export function normalizeDynamicFixPayload(model, parsed, fallback) {
  const fix = String(parsed?.fix || '').trim()
  const why = String(parsed?.why || '').trim()

  if (!fix || !why) {
    return {
      ...fallback,
      model,
      fallback: true,
    }
  }

  return {
    failureMode: normalizeFailureMode(parsed.failureMode),
    fix,
    whereToEdit: String(parsed.whereToEdit || fallback?.whereToEdit || '').trim(),
    why,
    exampleCopy: String(parsed.exampleCopy || fallback?.exampleCopy || '').trim(),
    expectedLift: normalizeExpectedLift(parsed.expectedLift || fallback?.expectedLift),
    confidence: String(parsed.confidence || fallback?.confidence || 'medium').trim(),
    model,
    fallback: false,
  }
}

async function generateDynamicHighestImpactFix({
  query,
  markdown,
  intelligence,
  pageIntelligence = {},
  verdicts = [],
  fallback,
}) {
  const fixModel = getLlamaQueryModel()
  const topChunks = (intelligence?.retrieval?.topChunks || []).slice(0, 3).map(chunk => ({
    chunkId: chunk.chunkId,
    section: chunk.section,
    position: chunk.position,
    retrievalScore: chunk.retrievalScore,
    similarity: chunk.similarity,
    directAnswer: chunk.directAnswer,
    text: chunk.text,
  }))

  const result = await runSingleJsonModel({
    model: fixModel,
    prompt: DYNAMIC_FIX_PROMPT,
    content: [
      `Target query: ${query}`,
      `Page title: ${pageIntelligence?.extraction?.title || 'unknown'}`,
      `H1: ${pageIntelligence?.extraction?.h1 || 'unknown'}`,
      '',
      `Citation subscores:\n${JSON.stringify(intelligence?.citationReadiness?.subscores || {}, null, 2)}`,
      '',
      `Retrieval diagnosis: ${intelligence?.retrieval?.diagnosis || 'unknown'}`,
      `Answer extraction diagnosis: ${intelligence?.answerExtraction?.diagnosis || 'unknown'}`,
      '',
      `Model verdicts:\n${JSON.stringify(verdicts.map(verdict => ({
        model: verdict.model,
        queryMatchScore: verdict.queryMatchScore,
        failureMode: verdict.failureMode,
        topGap: verdict.topGap,
        suggestedFix: verdict.suggestedFix,
      })), null, 2)}`,
      '',
      `Top retrieved chunks:\n${JSON.stringify(topChunks, null, 2)}`,
      '',
      `Relevance-packed page context:\n${packContextForQuery({ markdown, query, pageIntelligence, budgetTokens: 1200 })}`,
    ].join('\n'),
    normalize: (model, parsed) => normalizeDynamicFixPayload(model, parsed, fallback),
    maxTokens: 350,
    temperature: 0.25,
  })

  return {
    ...result,
    modelId: result.modelId,
    credentialLabel: result.credentialLabel,
  }
}

export function dynamicFixFromVerdicts(verdicts = [], fallback) {
  const verdictWithFix = verdicts.find(verdict => verdict.suggestedFix || verdict.topGap)
  if (!verdictWithFix) return null

  return {
    failureMode: normalizeFailureMode(verdictWithFix.failureMode || fallback?.failureMode),
    fix: String(verdictWithFix.suggestedFix || fallback?.fix || '').trim(),
    whereToEdit: fallback?.whereToEdit || 'The section that should answer the target query most directly.',
    why: String(verdictWithFix.topGap || fallback?.why || '').trim(),
    exampleCopy: fallback?.exampleCopy || '',
    expectedLift: normalizeExpectedLift(fallback?.expectedLift),
    confidence: fallback?.confidence || 'medium',
    model: verdictWithFix.model,
    fallback: false,
    source: 'model-verdict',
  }
}

async function runLlmContentScore(markdown, pageIntelligence = {}) {
  const panel = await runJsonModelPanel({
    prompt: LLM_CONTENT_SCORE_PROMPT,
    buildContent: model => `Content:\n${packContextForBaseline({ markdown, pageIntelligence, budgetTokens: model.contextTokens })}`,
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

router.post('/query-suggestions', async (req, res) => {
  const {
    markdown,
    sourceUrl = '',
    pageIntelligence = {},
  } = req.body || {}

  if (!markdown || typeof markdown !== 'string') {
    return res.status(400).json({ error: 'markdown required (must be a string)' })
  }

    const suggestionModel = getLlamaQueryModel()
  const fallback = fallbackQuerySuggestions({ sourceUrl, pageIntelligence })

  try {
    const result = await runSingleJsonModel({
      model: suggestionModel,
      prompt: QUERY_SUGGESTION_PROMPT,
      content: [
        `Source URL: ${sourceUrl || 'unknown'}`,
        `Page title: ${pageIntelligence?.extraction?.title || 'unknown'}`,
        `H1: ${pageIntelligence?.extraction?.h1 || 'unknown'}`,
        '',
        `Content:\n${packContextForBaseline({ markdown, pageIntelligence, budgetTokens: suggestionModel.contextTokens })}`,
      ].join('\n'),
      normalize: (model, parsed) => normalizeQuerySuggestionsPayload(model, parsed, fallback),
      maxTokens: 350,
      temperature: 0.4,
    })

    return res.json({
      queries: result.queries,
      model: result.model,
      modelId: result.modelId,
      credentialLabel: result.credentialLabel,
      fallback: false,
    })
  } catch (err) {
    return res.json({
      queries: fallback,
      model: suggestionModel.label,
      fallback: true,
      error: err?.message || 'Query suggestions unavailable',
    })
  }
})

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
      } = await runLlmContentScore(markdown, pageIntelligence)

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
      buildContent: model => `Query: ${query}\n\nContent:\n${packContextForQuery({ markdown, query, pageIntelligence, budgetTokens: model.contextTokens })}`,
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

    let competitorMap = {
      status: 'disabled',
      reason: sourceUrl ? 'TAVILY_API_KEY is missing' : 'sourceUrl is required for competitor map',
      angleCount: 0,
      angles: [],
      competitors: [],
      grouped: {},
      yourPresence: null,
      marketSummary: {
        searchedAngles: '0/0',
        visibleCompetitors: 0,
        sourceDomainPresence: 'Source domain was not evaluated.',
        topLeader: null,
        recommendedMove: sourceUrl ? 'TAVILY_API_KEY is missing' : 'sourceUrl is required for competitor map',
      },
    }

    if (sourceUrl) {
      try {
        competitorMap = await buildCompetitorMap({
          query: query.trim(),
          sourceUrl,
          markdown,
          pageIntelligence,
        })
      } catch (err) {
        competitorMap = {
          status: 'error',
          reason: err?.message || 'Competitor map failed',
          angleCount: 0,
          angles: [],
          competitors: [],
          grouped: {},
          yourPresence: null,
          marketSummary: {
            searchedAngles: '0/0',
            visibleCompetitors: 0,
            sourceDomainPresence: 'Source domain was not evaluated.',
            topLeader: null,
            recommendedMove: err?.message || 'Competitor map failed',
          },
        }
      }
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

    const fallbackHighestImpactFix = generateHighestImpactFix({
      query: query.trim(),
      intelligence: intelligenceBase,
      pageIntelligence,
    })
    let highestImpactFix = fallbackHighestImpactFix
    try {
      highestImpactFix = await generateDynamicHighestImpactFix({
        query: query.trim(),
        markdown,
        intelligence: intelligenceBase,
        pageIntelligence,
        verdicts,
        fallback: fallbackHighestImpactFix,
      })
    } catch (err) {
      highestImpactFix = dynamicFixFromVerdicts(verdicts, fallbackHighestImpactFix) || {
        ...fallbackHighestImpactFix,
        fallback: true,
        error: err?.message || 'Dynamic fix generation failed',
      }
      if (!highestImpactFix.error) {
        highestImpactFix.error = err?.message || 'Dynamic fix generation failed'
      }
    }

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
        competitorMap,
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
