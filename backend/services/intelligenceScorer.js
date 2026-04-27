import {
  getCitationSignals,
  getHeadings,
  getNumericSignals,
  getWords,
  hasComparisonSignal,
  hasStructuredDataSignal,
} from '../utils/contentSignals.js'
import { chunkMarkdown } from './chunkService.js'
import { analyzeRetrieval, scoreAnswerExtraction } from './retrievalService.js'

function clampScore(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function scoreAccess(access = {}) {
  let score = 100
  const warnings = access.warnings || []
  const robots = access.robots || {}

  if (!access.statusCode) score -= 35
  else if (access.statusCode >= 400) score -= 45
  else if (access.statusCode >= 300) score -= 12

  if (access.indexable === false) score -= 35

  const blocked = Object.values(robots).filter(status => status === 'blocked').length
  const unknown = Object.values(robots).filter(status => status === 'unknown').length
  score -= blocked * 12
  score -= unknown * 4
  score -= Math.min(warnings.length, 4) * 4

  return clampScore(score)
}

function scoreExtraction(extraction = {}) {
  let score = 100
  if (!extraction.title) score -= 10
  if (!extraction.h1) score -= 16
  if ((extraction.headings || []).length < 2) score -= 12
  if ((extraction.wordCount || 0) < 250) score -= 25
  if ((extraction.schemaTypes || []).length === 0) score -= 8
  score -= Math.min((extraction.warnings || []).length, 5) * 7
  return clampScore(score)
}

function scoreEvidence(markdown) {
  const citations = getCitationSignals(markdown)
  const numeric = getNumericSignals(markdown)
  const dated = /\b20(?:2[4-6])\b/.test(markdown)
  return clampScore(
    Math.min(citations.total, 5) * 13 +
    Math.min(numeric.length, 6) * 6 +
    (dated ? 15 : 0)
  )
}

function scoreStructure(markdown, extraction = {}) {
  const headings = getHeadings(markdown)
  const schema = hasStructuredDataSignal(markdown) || (extraction.schemaTypes || []).length > 0
  const comparison = hasComparisonSignal(markdown)
  const faq = /\bfaq\b|frequently asked questions|\?/i.test(markdown)
  const table = /\|.+\||<table/i.test(markdown) || (extraction.tableCount || 0) > 0

  return clampScore(
    Math.min(headings.length, 6) * 8 +
    (schema ? 18 : 0) +
    (comparison ? 12 : 0) +
    (faq ? 12 : 0) +
    (table ? 10 : 0)
  )
}

function scoreFreshness(markdown, extraction = {}) {
  const text = `${markdown}\n${extraction.title || ''}\n${extraction.metaDescription || ''}`
  if (/\b2026\b/.test(text)) return 100
  if (/\b2025\b/.test(text)) return 85
  if (/\b2024\b/.test(text)) return 65
  if (/\bupdated|reviewed|current|latest|new\b/i.test(text)) return 50
  return 30
}

function summarizeCitationReadiness({ accessScore, extractionScore, retrievalScore, answerScore, evidenceScore }) {
  const weak = []
  if (accessScore < 70) weak.push('access risk')
  if (extractionScore < 70) weak.push('extraction weakness')
  if (retrievalScore < 70) weak.push('retrieval fit')
  if (answerScore < 70) weak.push('direct answer clarity')
  if (evidenceScore < 55) weak.push('evidence')

  if (weak.length === 0) return 'Strong access, extraction, retrieval, answer clarity, and evidence signals.'
  return `Strongest opportunity: improve ${weak.slice(0, 2).join(' and ')}.`
}

function summarizeCitationReadinessWithCompetitor({ competitorGapScore, baseSummary }) {
  if (competitorGapScore >= 80) return `${baseSummary} Competitive gap is favorable for this query.`
  if (competitorGapScore >= 55) return `${baseSummary} Competitive gap is close; a sharper answer block can improve the edge.`
  return `${baseSummary} Discovered competitors appear more citation-ready for this query.`
}

export function buildQueryIntelligence({ markdown, query, pageIntelligence = {} }) {
  const chunks = chunkMarkdown(markdown)
  const retrieval = analyzeRetrieval({ chunks, query })
  const answerExtraction = scoreAnswerExtraction(retrieval.topChunks[0])
  const accessScore = scoreAccess(pageIntelligence.access)
  const extractionScore = scoreExtraction(pageIntelligence.extraction)
  const evidenceScore = scoreEvidence(markdown)
  const structureScore = scoreStructure(markdown, pageIntelligence.extraction)
  const freshnessScore = scoreFreshness(markdown, pageIntelligence.extraction)
  const citationScore = clampScore(
    accessScore * 0.1 +
    extractionScore * 0.1 +
    retrieval.retrievalScore * 0.25 +
    answerExtraction.answerScore * 0.25 +
    evidenceScore * 0.15 +
    structureScore * 0.1 +
    freshnessScore * 0.05
  )

  return {
    chunks,
    retrieval,
    answerExtraction,
    citationReadiness: {
      score: citationScore,
      summary: summarizeCitationReadiness({
        accessScore,
        extractionScore,
        retrievalScore: retrieval.retrievalScore,
        answerScore: answerExtraction.answerScore,
        evidenceScore,
      }),
      subscores: {
        accessScore,
        extractionScore,
        retrievalScore: retrieval.retrievalScore,
        answerScore: answerExtraction.answerScore,
        evidenceScore,
        structureScore,
        freshnessScore,
      },
    },
  }
}

export function buildBaselineIntelligence({ markdown, pageIntelligence = {} }) {
  return {
    citationReadiness: {
      score: clampScore(
        scoreAccess(pageIntelligence.access) * 0.28 +
        scoreExtraction(pageIntelligence.extraction) * 0.28 +
        scoreEvidence(markdown) * 0.22 +
        scoreStructure(markdown, pageIntelligence.extraction) * 0.15 +
        scoreFreshness(markdown, pageIntelligence.extraction) * 0.07
      ),
      summary: 'Baseline citation readiness uses access, extraction, evidence, structure, and freshness until a query is added.',
    },
  }
}

export function applyCompetitorGapScore(intelligence, competitorGapScore) {
  const score = clampScore(Number(competitorGapScore))
  if (!intelligence?.citationReadiness?.subscores || !Number.isFinite(Number(competitorGapScore))) {
    return intelligence
  }

  const subscores = {
    ...intelligence.citationReadiness.subscores,
    competitorGapScore: score,
  }

  const citationScore = clampScore(
    subscores.accessScore * 0.1 +
    subscores.extractionScore * 0.1 +
    subscores.retrievalScore * 0.2 +
    subscores.answerScore * 0.2 +
    subscores.evidenceScore * 0.15 +
    subscores.structureScore * 0.1 +
    subscores.freshnessScore * 0.05 +
    subscores.competitorGapScore * 0.1
  )

  return {
    ...intelligence,
    citationReadiness: {
      ...intelligence.citationReadiness,
      score: citationScore,
      summary: summarizeCitationReadinessWithCompetitor({
        competitorGapScore: score,
        baseSummary: intelligence.citationReadiness.summary,
      }),
      subscores,
    },
  }
}
