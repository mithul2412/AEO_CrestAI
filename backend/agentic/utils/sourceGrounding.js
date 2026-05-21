import { cleanText, getSentences } from './markdown.js'

export function findSourceSentence(markdown, pattern) {
  const sentences = getSentences(markdown)
  return sentences.find(sentence => pattern.test(sentence)) || ''
}

export function makeGroundedItem(text, sourceUrl, sourceText, extra = {}) {
  return {
    ...extra,
    sourceUrl: sourceUrl || '',
    sourceText: cleanText(sourceText || text),
  }
}
