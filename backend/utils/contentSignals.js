const SENTENCE_REGEX = /[^.!?\n]+[.!?]+/g
const BARE_URL_REGEX = /https?:\/\/[^\s)>\]]+/gi
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi
const ATTRIBUTION_REGEX = /\baccording to\s+([A-Z][A-Za-z0-9&,\- ]{2,80})/gi
const SOURCE_NAME_REGEX = /\b([A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+){0,4})\s+(Research|University|Institute|Report|Study|Survey|Data|Analytics|Lab|Labs|Commission|Agency)\b/g
const NUMERIC_SIGNAL_REGEX = /\b\d+(?:\.\d+)?(?:%|x|k|m|b)?\b|\b\d+(?:,\d{3})+\b|\$\d+(?:,\d{3})*(?:\.\d+)?\b|\b\d+\s*(?:million|billion|trillion|users|customers|companies|countries|states|days|weeks|months|years|hours|minutes|seconds|GB|TB|MB|KB|Mbps|Gbps)\b/gi

export function normalizeMarkdown(markdown) {
  return String(markdown || '')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\u00a0/g, ' ')
}

export function getLines(markdown) {
  return normalizeMarkdown(markdown)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

export function getWords(markdown) {
  return normalizeMarkdown(markdown)
    .split(/\s+/)
    .map(word => word.trim())
    .filter(Boolean)
}

export function getParagraphs(markdown) {
  return normalizeMarkdown(markdown)
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)
}

export function getSentences(markdown) {
  return (normalizeMarkdown(markdown).match(SENTENCE_REGEX) || [])
    .map(sentence => sentence.replace(/\s+/g, ' ').trim())
    .filter(sentence => sentence.length >= 8)
}

export function getHeadings(markdown) {
  return getLines(markdown).filter(line => /^#{1,6}\s+/.test(line))
}

export function getBulletLines(markdown) {
  return getLines(markdown).filter(line => /^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line))
}

export function uniqueMatches(markdown, regex, mapFn = match => match[0]) {
  const values = new Set()
  let match
  const source = normalizeMarkdown(markdown)
  regex.lastIndex = 0
  while ((match = regex.exec(source)) !== null) {
    const value = mapFn(match)
    if (value) values.add(String(value).trim())
  }
  return [...values]
}

export function getNumericSignals(markdown) {
  return uniqueMatches(markdown, NUMERIC_SIGNAL_REGEX, match => match[0])
}

export function getCitationSignals(markdown) {
  const urls = uniqueMatches(markdown, BARE_URL_REGEX, match => match[0].toLowerCase())
  const markdownLinks = uniqueMatches(markdown, MARKDOWN_LINK_REGEX, match => match[2].toLowerCase())
  const attributions = uniqueMatches(markdown, ATTRIBUTION_REGEX, match => match[1])
  const sourceNames = uniqueMatches(markdown, SOURCE_NAME_REGEX, match => `${match[1]} ${match[2]}`)

  return {
    urls: [...new Set([...urls, ...markdownLinks])],
    attributions,
    sourceNames,
    total: new Set([...urls, ...markdownLinks, ...attributions, ...sourceNames]).size,
  }
}

export function getLeadText(markdown, percent = 0.2, minWords = 80) {
  const words = getWords(markdown)
  const leadWordCount = Math.max(minWords, Math.floor(words.length * percent))
  return words.slice(0, leadWordCount).join(' ')
}

export function hasStructuredDataSignal(markdown) {
  return /schema\.org|application\/ld\+json|["@']@type["@']|FAQPage|HowTo|Article|BreadcrumbList|Organization/i.test(markdown)
}

export function hasComparisonSignal(markdown) {
  return /\bvs\.?\b|\bversus\b|\bcompared to\b|\bcompare\b|\balternative(?:s)?\b|\bpros and cons\b|\bbetter than\b|\btrade[- ]?off\b|\|\s*[^|\n]+\s*\|/i.test(markdown)
}

export function hasLlmsTxtSignal(markdown, sourceSignals = {}) {
  return Boolean(
    sourceSignals?.llmsTxt?.present ||
    sourceSignals?.llmsFullTxt?.present ||
    /llms\.txt|llms-full\.txt/i.test(markdown)
  )
}

export function getAverageSentenceLength(markdown) {
  const sentences = getSentences(markdown)
  if (sentences.length === 0) return 0
  const totalWords = sentences.reduce((sum, sentence) => sum + getWords(sentence).length, 0)
  return totalWords / sentences.length
}

export function hasAnswerLikeOpening(markdown) {
  const leadText = getLeadText(markdown, 0.18, 70)
  return /\b(is|are|means|refers to|defined as|provides|offers|helps|lets you|enables|allows|works by|works through)\b/i.test(leadText)
}

export function hasNamedSourceNearFact(markdown) {
  const citationSignals = getCitationSignals(markdown)
  if (citationSignals.total >= 2) return true
  return /\b(?:according to|research from|data from|study by)\b.{0,80}\b\d+(?:\.\d+)?%/i.test(markdown)
}
