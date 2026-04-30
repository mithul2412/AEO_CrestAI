import { chunkMarkdown } from './chunkService.js'
import { analyzeRetrieval } from './retrievalService.js'
import { getHeadings, getWords, normalizeMarkdown } from '../utils/contentSignals.js'

const SKELETON_RESERVE_TOKENS = 150
const TOKEN_TO_WORD = 0.75
const SECTION_OPENING_WORDS = 80

function tokensToWords(tokens) {
  return Math.max(40, Math.floor(tokens * TOKEN_TO_WORD))
}

function wordCount(text) {
  return getWords(text).length
}

function clipToWords(text, limit) {
  if (limit <= 0) return ''
  const words = getWords(text)
  if (words.length <= limit) return text.trim()
  return words.slice(0, limit).join(' ') + ' …'
}

function buildSkeleton({ pageIntelligence = {}, markdown = '', maxLines = 8 }) {
  const extraction = pageIntelligence?.extraction || {}
  const lines = []
  if (extraction.title) lines.push(`Title: ${String(extraction.title).trim()}`)
  if (extraction.h1 && extraction.h1 !== extraction.title) lines.push(`H1: ${String(extraction.h1).trim()}`)
  if (extraction.metaDescription) lines.push(`Meta: ${String(extraction.metaDescription).trim()}`)

  const seenHeadings = new Set([(extraction.h1 || '').toLowerCase().trim()])
  const inlineHeadings = getHeadings(markdown)
    .map(line => line.replace(/^#{1,6}\s+/, '').trim())
    .filter(Boolean)
    .filter(heading => {
      const key = heading.toLowerCase()
      if (seenHeadings.has(key)) return false
      seenHeadings.add(key)
      return true
    })

  inlineHeadings.slice(0, maxLines).forEach(heading => {
    lines.push(`- ${heading}`)
  })

  return `[PAGE SKELETON]\n${lines.join('\n')}`
}

function packChunks({ chunks, budgetWords, header, formatChunk }) {
  if (!chunks?.length || budgetWords <= 0) return ''
  const sections = [header]
  let used = wordCount(header)

  for (const chunk of chunks) {
    if (used >= budgetWords) break
    const remaining = budgetWords - used
    const formatted = formatChunk(chunk, remaining)
    if (!formatted) continue
    const formattedWords = wordCount(formatted)
    if (formattedWords > remaining) {
      const clipped = clipToWords(formatted, remaining)
      if (!clipped) break
      sections.push(clipped)
      used += wordCount(clipped)
      break
    }
    sections.push(formatted)
    used += formattedWords
  }

  return sections.join('\n\n')
}

function formatRankedChunk(chunk, remaining) {
  const id = chunk.chunkId || 'chunk'
  const section = chunk.section || 'Untitled'
  const rel = typeof chunk.retrievalScore === 'number' ? `${chunk.retrievalScore}/100 rel` : ''
  const sim = typeof chunk.similarity === 'number' ? `sim ${Math.round(chunk.similarity * 100)}%` : ''
  const pos = typeof chunk.position === 'number' ? `pos ${Math.round(chunk.position * 100)}%` : ''
  const direct = chunk.directAnswer ? 'direct' : 'indirect'
  const meta = [rel, sim, pos, direct].filter(Boolean).join(' · ')
  const head = `--- ${id} (${section}) | ${meta}`
  const headWords = wordCount(head)
  if (remaining <= headWords + 8) return ''
  const body = clipToWords(chunk.text || '', Math.max(20, remaining - headWords - 4))
  if (!body) return ''
  return `${head}\n${body}`
}

function formatSampledChunk(chunk, remaining) {
  const id = chunk.chunkId || 'chunk'
  const section = chunk.section || 'Untitled'
  const evidence = typeof chunk.evidenceScore === 'number' ? `evidence ${chunk.evidenceScore}` : ''
  const pos = typeof chunk.position === 'number' ? `pos ${Math.round(chunk.position * 100)}%` : ''
  const meta = [evidence, pos].filter(Boolean).join(' · ')
  const head = meta ? `--- ${id} (${section}) | ${meta}` : `--- ${id} (${section})`
  const headWords = wordCount(head)
  if (remaining <= headWords + 8) return ''
  const opening = clipToWords(chunk.text || '', Math.max(20, Math.min(SECTION_OPENING_WORDS, remaining - headWords - 4)))
  if (!opening) return ''
  return `${head}\n${opening}`
}

export function packContextForQuery({
  markdown = '',
  query = '',
  pageIntelligence = {},
  budgetTokens = 3000,
  topK = 5,
}) {
  const cleanQuery = String(query || '').trim()
  if (!cleanQuery) {
    return packContextForBaseline({ markdown, pageIntelligence, budgetTokens })
  }

  const totalWordBudget = tokensToWords(budgetTokens)
  const skeleton = buildSkeleton({ pageIntelligence, markdown })
  const skeletonWords = wordCount(skeleton)
  const remaining = Math.max(0, totalWordBudget - skeletonWords)

  const chunks = chunkMarkdown(normalizeMarkdown(markdown))
  if (chunks.length === 0) {
    return `${skeleton}\n\n[NO RETRIEVABLE CHUNKS]`
  }

  const ranked = analyzeRetrieval({ chunks, query: cleanQuery })
  const fullyRanked = chunks
    .map(chunk => {
      const enriched = ranked.topChunks.find(top => top.chunkId === chunk.chunkId)
      return enriched || { ...chunk, retrievalScore: 0, similarity: 0, directAnswer: false }
    })
    .sort((a, b) => (b.retrievalScore || 0) - (a.retrievalScore || 0))
    .slice(0, topK)

  const packed = packChunks({
    chunks: fullyRanked,
    budgetWords: remaining,
    header: '[TOP CHUNKS RANKED BY QUERY RELEVANCE]',
    formatChunk: formatRankedChunk,
  })

  return [skeleton, packed].filter(Boolean).join('\n\n')
}

export function packContextForBaseline({
  markdown = '',
  pageIntelligence = {},
  budgetTokens = 3000,
}) {
  const totalWordBudget = tokensToWords(budgetTokens)
  const skeleton = buildSkeleton({ pageIntelligence, markdown, maxLines: 12 })
  const skeletonWords = wordCount(skeleton)
  const remaining = Math.max(0, totalWordBudget - skeletonWords - SKELETON_RESERVE_TOKENS / 4)

  const chunks = chunkMarkdown(normalizeMarkdown(markdown))
  if (chunks.length === 0) {
    return `${skeleton}\n\n[NO RETRIEVABLE CHUNKS]`
  }

  const seenSections = new Set()
  const sectionDiverse = []
  for (const chunk of chunks) {
    const key = (chunk.section || '').toLowerCase()
    if (seenSections.has(key)) continue
    seenSections.add(key)
    sectionDiverse.push(chunk)
  }

  const ranked = analyzeRetrieval({ chunks, query: '' })
  const evidenceRanked = chunks
    .map(chunk => {
      const enriched = ranked.topChunks.find(top => top.chunkId === chunk.chunkId)
      return enriched || { ...chunk, evidenceScore: 0 }
    })
    .sort((a, b) => (b.evidenceScore || 0) - (a.evidenceScore || 0))

  const seen = new Set()
  const interleaved = []
  for (let i = 0; i < Math.max(sectionDiverse.length, evidenceRanked.length); i++) {
    if (sectionDiverse[i] && !seen.has(sectionDiverse[i].chunkId)) {
      interleaved.push(sectionDiverse[i])
      seen.add(sectionDiverse[i].chunkId)
    }
    if (evidenceRanked[i] && !seen.has(evidenceRanked[i].chunkId)) {
      interleaved.push(evidenceRanked[i])
      seen.add(evidenceRanked[i].chunkId)
    }
  }

  const packed = packChunks({
    chunks: interleaved.slice(0, 8),
    budgetWords: remaining,
    header: '[STRUCTURAL SAMPLE — section openings + high-evidence chunks]',
    formatChunk: formatSampledChunk,
  })

  return [skeleton, packed].filter(Boolean).join('\n\n')
}

export function packContextForChat({
  markdown = '',
  query = '',
  pageIntelligence = {},
  budgetTokens = 3000,
}) {
  if (String(query || '').trim()) {
    return packContextForQuery({ markdown, query, pageIntelligence, budgetTokens })
  }
  return packContextForBaseline({ markdown, pageIntelligence, budgetTokens })
}
