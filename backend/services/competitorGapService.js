import { analyzeRetrieval } from './retrievalService.js'

function clampScore(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function chunkScore(chunk) {
  return chunk?.retrievalScore ?? Math.round((chunk?.similarity || 0) * 100)
}

function collectMissingAttributes(userTop, competitorTop) {
  const missing = []

  if (!userTop.directAnswer && competitorTop.directAnswer) missing.push('direct answer')
  if ((userTop.evidenceScore || 0) + 8 < (competitorTop.evidenceScore || 0)) missing.push('stronger evidence')
  if ((userTop.position || 1) > (competitorTop.position || 1) + 0.15) missing.push('answer appears earlier')
  if ((userTop.specificityScore || 0) + 10 < (competitorTop.specificityScore || 0)) missing.push('more specific entities and numbers')
  if ((userTop.selfContainedScore || 0) + 10 < (competitorTop.selfContainedScore || 0)) missing.push('self-contained answer')

  return missing
}

function classifyGap(missingAttributes) {
  if (missingAttributes.includes('direct answer')) return 'Answer Failure'
  if (missingAttributes.includes('stronger evidence')) return 'Evidence Failure'
  if (missingAttributes.includes('answer appears earlier')) return 'Retrieval Failure'
  if (missingAttributes.includes('more specific entities and numbers')) return 'Specificity Failure'
  if (missingAttributes.includes('self-contained answer')) return 'Structure Failure'
  return 'Competitor Structure Advantage'
}

function summarizeGap({ winner, failureMode, missingAttributes, competitorTop, userTop }) {
  if (winner === 'user') {
    return 'Your top chunk is more citation-ready than the discovered competitor chunks for this query.'
  }

  const competitorSection = competitorTop?.section || 'its top section'
  const userSection = userTop?.section || 'your top section'
  const missing = missingAttributes.length ? ` Missing attributes: ${missingAttributes.join(', ')}.` : ''
  return `The competitor chunk in "${competitorSection}" is more retrieval-ready than your "${userSection}" chunk. Main issue: ${failureMode}.${missing}`
}

export function compareUserVsCompetitors({ query, userChunks = [], competitorPages = [] } = {}) {
  const userRanking = analyzeRetrieval({ chunks: userChunks, query })
  const userTop = userRanking.topChunks?.[0] || null
  const competitorChunks = competitorPages.flatMap(page =>
    (page.chunks || []).map(chunk => ({
      ...chunk,
      sourceUrl: page.url,
      sourceTitle: page.title,
      sourceId: page.sourceId,
    }))
  )
  const competitorRanking = analyzeRetrieval({ chunks: competitorChunks, query })
  const competitorTop = competitorRanking.topChunks?.[0] || null

  if (!userTop || !competitorTop) {
    return {
      status: 'insufficient_data',
      winner: 'unknown',
      userTopChunk: userTop,
      competitorTopChunk: competitorTop,
      winningCompetitor: null,
      scoreDelta: null,
      failureMode: null,
      missingAttributes: [],
      whyCompetitorWon: 'No usable competitor chunks were available for comparison.',
      competitorGapScore: null,
    }
  }

  const userScore = chunkScore(userTop)
  const competitorScore = chunkScore(competitorTop)
  const winner = userScore >= competitorScore ? 'user' : 'competitor'
  const missingAttributes = winner === 'competitor'
    ? collectMissingAttributes(userTop, competitorTop)
    : []
  const failureMode = winner === 'competitor' ? classifyGap(missingAttributes) : null
  const winningCompetitor = competitorPages.find(page => page.sourceId === competitorTop.sourceId) || null
  const scoreDelta = competitorScore - userScore

  return {
    status: 'ok',
    winner,
    winningCompetitor: winningCompetitor
      ? {
          title: winningCompetitor.title,
          url: winningCompetitor.url,
          sourceId: winningCompetitor.sourceId,
        }
      : null,
    userTopChunk: userTop,
    competitorTopChunk: competitorTop,
    scoreDelta,
    failureMode,
    missingAttributes,
    whyCompetitorWon: summarizeGap({ winner, failureMode, missingAttributes, competitorTop, userTop }),
    competitorGapScore: winner === 'user' ? 100 : clampScore(100 - Math.max(0, scoreDelta) * 1.5),
  }
}
