import {
  getCitationSignals,
  getNumericSignals,
  getSentences,
  getWords,
  hasAnswerLikeOpening,
} from '../utils/contentSignals.js'

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'best', 'by', 'can', 'do', 'does', 'for',
  'from', 'how', 'in', 'is', 'it', 'of', 'on', 'or', 'the', 'this', 'to', 'vs', 'what',
  'tell', 'when', 'where', 'which', 'who', 'why', 'with', 'your',
])

function clampScore(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function tokenize(text) {
  return getWords(String(text || '').toLowerCase())
    .map(word => word.replace(/[^a-z0-9-]/g, ''))
    .filter(word => word.length > 2 && !STOPWORDS.has(word))
}

function vector(tokens) {
  return tokens.reduce((acc, token) => {
    acc[token] = (acc[token] || 0) + 1
    return acc
  }, {})
}

function cosineSimilarity(aTokens, bTokens) {
  const a = vector(aTokens)
  const b = vector(bTokens)
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  let dot = 0
  let aMag = 0
  let bMag = 0

  keys.forEach(key => {
    dot += (a[key] || 0) * (b[key] || 0)
    aMag += (a[key] || 0) ** 2
    bMag += (b[key] || 0) ** 2
  })

  if (aMag === 0 || bMag === 0) return 0
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag))
}

function overlapScore(queryTokens, chunkTokens) {
  if (queryTokens.length === 0) return 0
  const chunkSet = new Set(chunkTokens)
  const uniqueQuery = [...new Set(queryTokens)]
  const matches = uniqueQuery.filter(token => chunkSet.has(token)).length
  return matches / uniqueQuery.length
}

function phraseCoverage(query = '', chunkText = '') {
  const queryPhrases = String(query || '').toLowerCase()
    .split(/\b(?:and|or|vs|versus|for|with)\b|[?.,]/)
    .map(part => part.trim())
    .filter(part => part.split(/\s+/).filter(Boolean).length >= 2)
  if (queryPhrases.length === 0) return 0
  const chunk = String(chunkText || '').toLowerCase()
  const matches = queryPhrases.filter(phrase => chunk.includes(phrase)).length
  return matches / queryPhrases.length
}

function firstWords(text, limit = 80) {
  return getWords(text).slice(0, limit).join(' ')
}

function hasDirectAnswer(chunkText, queryTokens) {
  const sentences = getSentences(chunkText).slice(0, 3)
  const querySet = new Set(queryTokens)

  return sentences.some(sentence => {
    const sentenceTokens = tokenize(sentence)
    const shared = sentenceTokens.filter(token => querySet.has(token)).length
    const answerVerb = /\b(is|are|means|refers to|helps|provides|offers|enables|allows|uses|works by|includes|supports)\b/i.test(sentence)
    return answerVerb && shared >= Math.min(2, Math.max(1, querySet.size))
  }) || hasAnswerLikeOpening(chunkText)
}

function queryAnswerCoverage(chunkText, queryTokens) {
  const opening = firstWords(chunkText, 80)
  const openingTokens = tokenize(opening)
  const openingOverlap = overlapScore(queryTokens, openingTokens)
  const fullOverlap = overlapScore(queryTokens, tokenize(chunkText))
  return clampScore(openingOverlap * 70 + fullOverlap * 30)
}

function specificityScore(chunkText, queryTokens) {
  const entityCount = (chunkText.match(/\b[A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+){0,3}\b/g) || []).length
  const numericCount = getNumericSignals(chunkText).length
  const queryOverlap = overlapScore(queryTokens, tokenize(chunkText))
  return clampScore((queryOverlap * 45) + Math.min(entityCount, 6) * 6 + Math.min(numericCount, 5) * 5)
}

function evidenceScore(chunkText) {
  const citations = getCitationSignals(chunkText)
  const numeric = getNumericSignals(chunkText)
  const dated = /\b20(?:2[4-6])\b/.test(chunkText)
  const quoteLike = /["“][^"”]{20,160}["”]\s*(?:,?\s*(?:said|according to|from|by)\b)?/i.test(chunkText)
  return clampScore(
    Math.min(citations.urls.length, 3) * 14 +
    Math.min(citations.attributions.length + citations.sourceNames.length, 4) * 12 +
    Math.min(numeric.length, 5) * 7 +
    (dated ? 10 : 0) +
    (quoteLike ? 8 : 0)
  )
}

function entityAlignmentScore(queryTokens, chunkText) {
  const chunkTokens = tokenize(chunkText)
  const importantQueryTokens = [...new Set(queryTokens)].filter(token => token.length >= 4)
  if (importantQueryTokens.length === 0) return 0
  const chunkSet = new Set(chunkTokens)
  const matched = importantQueryTokens.filter(token => chunkSet.has(token)).length
  const namedEntities = (chunkText.match(/\b[A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+){0,3}\b/g) || []).length
  return clampScore((matched / importantQueryTokens.length) * 75 + Math.min(namedEntities, 5) * 5)
}

function selfContainedScore(chunkText) {
  const opening = getSentences(chunkText)[0] || ''
  if (/^(it|they|this|these|that|those)\b/i.test(opening.trim())) return 35
  return getWords(opening).length >= 6 ? 80 : 55
}

function diagnoseRetrieval(topChunk, chunks) {
  if (!topChunk) return 'No retrievable chunk could be built from this page.'
  if (topChunk.similarity < 0.22) return 'No chunk strongly matches the target query language.'
  if (topChunk.position > 0.55) return 'The best matching answer appears late in the page.'
  if (!topChunk.directAnswer) return 'The top chunk is relevant, but it does not open with a direct answer.'
  if (chunks.length > 1 && topChunk.position > 0.25) return 'The right topic is present, but it is not front-loaded.'
  return 'The target query maps to an early, usable chunk.'
}

export function analyzeRetrieval({ chunks = [], query = '' }) {
  const queryTokens = tokenize(query)
  const ranked = chunks.map(chunk => {
    const chunkTokens = tokenize(`${chunk.section} ${chunk.text}`)
    const cosine = cosineSimilarity(queryTokens, chunkTokens)
    const overlap = overlapScore(queryTokens, chunkTokens)
    const phrase = phraseCoverage(query, `${chunk.section} ${chunk.text}`)
    const similarity = Math.min(1, cosine * 0.55 + overlap * 0.3 + phrase * 0.15)
    const directAnswer = hasDirectAnswer(chunk.text, queryTokens)
    const chunkEvidenceScore = evidenceScore(chunk.text)
    const chunkSpecificityScore = specificityScore(chunk.text, queryTokens)
    const chunkEntityAlignmentScore = entityAlignmentScore(queryTokens, `${chunk.section} ${chunk.text}`)
    const answerCoverageScore = queryAnswerCoverage(chunk.text, queryTokens)
    const positionScore = clampScore(100 - (chunk.position * 70))
    const selfContained = selfContainedScore(chunk.text)
    const retrievalScore = clampScore(
      similarity * 100 * 0.28 +
      (directAnswer ? 100 : 35) * 0.18 +
      answerCoverageScore * 0.16 +
      positionScore * 0.12 +
      chunkSpecificityScore * 0.1 +
      chunkEvidenceScore * 0.08 +
      chunkEntityAlignmentScore * 0.05 +
      selfContained * 0.03
    )

    return {
      ...chunk,
      similarity: Number(similarity.toFixed(2)),
      directAnswer,
      evidenceScore: chunkEvidenceScore,
      specificityScore: chunkSpecificityScore,
      entityAlignmentScore: chunkEntityAlignmentScore,
      answerCoverageScore,
      selfContainedScore: selfContained,
      retrievalScore,
    }
  }).sort((a, b) => b.retrievalScore - a.retrievalScore)

  const topChunks = ranked.slice(0, 3)
  const topChunk = topChunks[0] || null

  return {
    query,
    topChunks,
    retrievalScore: topChunk?.retrievalScore ?? 0,
    diagnosis: diagnoseRetrieval(topChunk, chunks),
  }
}

export function scoreAnswerExtraction(topChunk) {
  if (!topChunk) {
    return {
      answerScore: 0,
      directAnswerFound: false,
      diagnosis: 'No candidate chunk is available for answer extraction.',
    }
  }

  const sentences = getSentences(topChunk.text)
  const openingCoverage = topChunk.answerCoverageScore || 0
  const standaloneCount = sentences.filter(sentence => {
    return /^[A-Z][^!?]*\b(is|are|means|provides|offers|helps|enables|allows|includes|supports)\b/i.test(sentence)
      && getWords(sentence).length >= 5
  }).length
  const vagueCount = (topChunk.text.match(/\b(seamless|robust|powerful|innovative|transform|outcomes|leverage|optimize|streamline)\b/gi) || []).length
  const pronounOpeningPenalty = /^(it|they|this|these|that|those)\b/i.test((sentences[0] || '').trim()) ? 18 : 0

  const answerScore = clampScore(
    (topChunk.directAnswer ? 45 : 15) +
    openingCoverage * 0.18 +
    Math.min(standaloneCount, 4) * 12 +
    Math.min(topChunk.specificityScore, 85) * 0.18 +
    Math.min(topChunk.evidenceScore, 80) * 0.12 -
    Math.min(vagueCount, 5) * 4 -
    pronounOpeningPenalty
  )

  return {
    answerScore,
    directAnswerFound: topChunk.directAnswer,
    diagnosis: topChunk.directAnswer
      ? 'The top chunk contains an extractable answer path.'
      : 'The chunk is relevant, but it does not provide a clean standalone answer near the start.',
  }
}
