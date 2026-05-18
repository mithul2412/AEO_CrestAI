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
  const attributedQuote = /["“][^"”]{20,180}["”]\s*(?:,?\s*(?:said|according to|from|by)\b)?/i.test(markdown)
  return clampScore(
    Math.min(citations.urls.length, 4) * 10 +
    Math.min(citations.attributions.length + citations.sourceNames.length, 5) * 11 +
    Math.min(numeric.length, 6) * 6 +
    (dated ? 12 : 0) +
    (attributedQuote ? 9 : 0)
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

function scoreAuthority(markdown, extraction = {}) {
  const citations = getCitationSignals(markdown)
  const hasOrgSchema = (extraction.schemaTypes || []).some(type => /Organization|Person|Article|FAQPage|Product/i.test(type))
  const authorSignals = /\b(author|reviewed by|edited by|expert|methodology|about the author)\b/i.test(markdown)
  return clampScore(
    Math.min(citations.sourceNames.length + citations.attributions.length, 5) * 12 +
    Math.min(citations.urls.length, 4) * 7 +
    (hasOrgSchema ? 18 : 0) +
    (authorSignals ? 12 : 0)
  )
}

function scoreEntityAlignment(retrieval = {}) {
  const top = retrieval.topChunks?.[0]
  return clampScore(top?.entityAlignmentScore || 0)
}

function scoreSearchPresence(searchPresence = {}) {
  if (!searchPresence) return null
  if (searchPresence.status !== 'ok') return null
  if (typeof searchPresence.domainRank !== 'number') return 35
  if (searchPresence.domainRank <= 1) return 100
  if (searchPresence.domainRank <= 3) return 85
  if (searchPresence.domainRank <= 5) return 70
  if (searchPresence.domainRank <= 10) return 55
  return 40
}

function summarizeCitationReadiness({
  accessScore,
  extractionScore,
  retrievalScore,
  answerScore,
  evidenceScore,
  entityScore,
  authorityScore,
}) {
  const weak = []
  if (accessScore < 70) weak.push('access risk')
  if (extractionScore < 70) weak.push('extraction weakness')
  if (retrievalScore < 70) weak.push('retrieval fit')
  if (answerScore < 70) weak.push('direct answer clarity')
  if (evidenceScore < 55) weak.push('evidence')
  if (entityScore < 55) weak.push('entity alignment')
  if (authorityScore < 55) weak.push('authority proof')

  if (weak.length === 0) return 'Strong access, extraction, retrieval, answer clarity, and evidence signals.'
  return `Strongest opportunity: improve ${weak.slice(0, 2).join(' and ')}.`
}

function summarizeCitationReadinessWithCompetitor({ competitorGapScore, baseSummary }) {
  if (competitorGapScore >= 80) return `${baseSummary} Competitive gap is favorable for this query.`
  if (competitorGapScore >= 55) return `${baseSummary} Competitive gap is close; a sharper answer block can improve the edge.`
  return `${baseSummary} Discovered competitors appear more citation-ready for this query.`
}

export function buildQueryIntelligence({ markdown, query, pageIntelligence = {}, searchPresence = null }) {
  const chunks = chunkMarkdown(markdown)
  const retrieval = analyzeRetrieval({ chunks, query })
  const answerExtraction = scoreAnswerExtraction(retrieval.topChunks[0])
  const accessScore = scoreAccess(pageIntelligence.access)
  const extractionScore = scoreExtraction(pageIntelligence.extraction)
  const evidenceScore = scoreEvidence(markdown)
  const structureScore = scoreStructure(markdown, pageIntelligence.extraction)
  const freshnessScore = scoreFreshness(markdown, pageIntelligence.extraction)
  const entityScore = scoreEntityAlignment(retrieval)
  const authorityScore = scoreAuthority(markdown, pageIntelligence.extraction)
  const searchPresenceScore = scoreSearchPresence(searchPresence)
  const searchWeight = typeof searchPresenceScore === 'number' ? 0.07 : 0
  const citationScore = clampScore(
    accessScore * 0.09 +
    extractionScore * 0.09 +
    retrieval.retrievalScore * 0.2 +
    answerExtraction.answerScore * 0.2 +
    evidenceScore * 0.14 +
    structureScore * 0.09 +
    freshnessScore * 0.05 +
    entityScore * 0.07 +
    authorityScore * 0.07 +
    (searchPresenceScore || 0) * searchWeight
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
        entityScore,
        authorityScore,
      }),
      subscores: {
        accessScore,
        extractionScore,
        retrievalScore: retrieval.retrievalScore,
        answerScore: answerExtraction.answerScore,
        evidenceScore,
        structureScore,
        freshnessScore,
        entityScore,
        authorityScore,
        ...(typeof searchPresenceScore === 'number' ? { searchPresenceScore } : {}),
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
        scoreEvidence(markdown) * 0.2 +
        scoreStructure(markdown, pageIntelligence.extraction) * 0.14 +
        scoreFreshness(markdown, pageIntelligence.extraction) * 0.06 +
        scoreAuthority(markdown, pageIntelligence.extraction) * 0.04
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
    subscores.retrievalScore * 0.18 +
    subscores.answerScore * 0.18 +
    subscores.evidenceScore * 0.14 +
    subscores.structureScore * 0.09 +
    subscores.freshnessScore * 0.05 +
    (subscores.entityScore || 0) * 0.07 +
    (subscores.authorityScore || 0) * 0.07 +
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
