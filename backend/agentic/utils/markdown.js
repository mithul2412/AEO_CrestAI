const HEADING_REGEX = /^(#{1,6})\s+(.+)$/gm
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g
const SENTENCE_REGEX = /[^.!?\n]+[.!?]+/g

export function normalizeMarkdown(markdown) {
  return String(markdown || '')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\u00a0/g, ' ')
}

export function cleanText(value) {
  return String(value || '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~>]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getLines(markdown) {
  return normalizeMarkdown(markdown)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

export function getHeadings(markdown) {
  const headings = []
  const source = normalizeMarkdown(markdown)
  let match
  HEADING_REGEX.lastIndex = 0

  while ((match = HEADING_REGEX.exec(source)) !== null) {
    const text = cleanText(match[2])
    if (text) headings.push({ level: match[1].length, text })
  }

  return headings
}

export function getPageTitle(markdown) {
  const headings = getHeadings(markdown)
  const h1 = headings.find(heading => heading.level === 1)
  if (h1?.text) return h1.text

  const titleLine = getLines(markdown).find(line => /^title\s*:/i.test(line))
  if (titleLine) return cleanText(titleLine.replace(/^title\s*:/i, ''))

  return headings[0]?.text || ''
}

export function getParagraphs(markdown) {
  return normalizeMarkdown(markdown)
    .split(/\n{2,}/)
    .map(paragraph => cleanText(paragraph))
    .filter(Boolean)
}

export function getSentences(markdown) {
  return (normalizeMarkdown(markdown).match(SENTENCE_REGEX) || [])
    .map(sentence => cleanText(sentence))
    .filter(sentence => sentence.length >= 8)
}

export function getMarkdownLinks(markdown) {
  const links = []
  const source = normalizeMarkdown(markdown)
  let match
  MARKDOWN_LINK_REGEX.lastIndex = 0

  while ((match = MARKDOWN_LINK_REGEX.exec(source)) !== null) {
    links.push({
      label: cleanText(match[1]),
      url: String(match[2] || '').trim(),
      sourceText: cleanText(match[0]),
    })
  }

  return links
}

export function getBulletItems(markdown) {
  return getLines(markdown)
    .filter(line => /^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map(line => cleanText(line.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '')))
    .filter(Boolean)
}
