import { getWords, normalizeMarkdown } from '../utils/contentSignals.js'

const MIN_CHUNK_WORDS = 140
const TARGET_CHUNK_WORDS = 420
const MAX_CHUNK_WORDS = 700

function wordCount(text) {
  return getWords(text).length
}

function cleanBlock(text) {
  return normalizeMarkdown(text).replace(/\n{3,}/g, '\n\n').trim()
}

function parseBlocks(markdown) {
  const blocks = []
  let currentSection = 'Opening'

  normalizeMarkdown(markdown)
    .split(/\n{2,}/)
    .map(cleanBlock)
    .filter(Boolean)
    .forEach(block => {
      const headingMatch = block.match(/^#{1,6}\s+(.+)$/m)
      if (headingMatch) {
        currentSection = headingMatch[1].trim()
      }

      blocks.push({
        text: block,
        section: currentSection,
        wordCount: wordCount(block),
      })
    })

  return blocks
}

export function chunkMarkdown(markdown) {
  const blocks = parseBlocks(markdown)
  const totalWords = Math.max(1, blocks.reduce((sum, block) => sum + block.wordCount, 0))
  const chunks = []
  let buffer = []
  let bufferWords = 0
  let startWord = 0
  let cursor = 0

  const flush = () => {
    if (buffer.length === 0) return
    const text = cleanBlock(buffer.map(block => block.text).join('\n\n'))
    const words = wordCount(text)
    const section = buffer.find(block => block.section)?.section || 'Opening'
    const chunkStart = startWord
    const chunkEnd = chunkStart + words

    chunks.push({
      chunkId: `c${chunks.length + 1}`,
      section,
      position: Number(Math.min(1, chunkStart / totalWords).toFixed(2)),
      text,
      wordCount: words,
      startWord: chunkStart,
      endWord: chunkEnd,
    })

    buffer = []
    bufferWords = 0
    startWord = cursor
  }

  blocks.forEach(block => {
    if (buffer.length === 0) startWord = cursor
    buffer.push(block)
    bufferWords += block.wordCount
    cursor += block.wordCount

    if (bufferWords >= TARGET_CHUNK_WORDS || bufferWords >= MAX_CHUNK_WORDS) {
      flush()
    }
  })

  if (bufferWords > 0) {
    if (chunks.length > 0 && bufferWords < MIN_CHUNK_WORDS) {
      const previous = chunks.pop()
      buffer = [{ text: previous.text, section: previous.section, wordCount: previous.wordCount }, ...buffer]
      startWord = previous.startWord
    }
    flush()
  }

  return chunks
}
