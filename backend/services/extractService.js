import * as cheerio from 'cheerio'
import { getHeadings, getWords, normalizeMarkdown } from '../utils/contentSignals.js'

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function getMeta($, name) {
  return compactText(
    $(`meta[name="${name}"]`).attr('content') ||
    $(`meta[property="${name}"]`).attr('content') ||
    ''
  )
}

function parseRobotsDirectives(value) {
  const directives = String(value || '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)

  const maxSnippet = directives.find(item => item.startsWith('max-snippet:')) || null

  return {
    directives,
    noindex: directives.includes('noindex'),
    nosnippet: directives.includes('nosnippet'),
    maxSnippet,
  }
}

function collectSchemaTypes($) {
  const types = new Set()

  $('[itemscope][itemtype]').each((_, node) => {
    const itemType = $(node).attr('itemtype')
    if (itemType) types.add(itemType.split('/').filter(Boolean).pop())
  })

  $('script[type="application/ld+json"]').each((_, node) => {
    const raw = $(node).contents().text()
    try {
      const parsed = JSON.parse(raw)
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed]

      while (stack.length > 0) {
        const item = stack.shift()
        if (!item || typeof item !== 'object') continue
        if (item['@type']) {
          const values = Array.isArray(item['@type']) ? item['@type'] : [item['@type']]
          values.forEach(value => types.add(String(value)))
        }
        if (Array.isArray(item['@graph'])) stack.push(...item['@graph'])
        if (item.mainEntity) {
          if (Array.isArray(item.mainEntity)) stack.push(...item.mainEntity)
          else stack.push(item.mainEntity)
        }
      }
    } catch {
      types.add('Invalid JSON-LD')
    }
  })

  return [...types].filter(Boolean)
}

function buildExtractionWarnings({ $, markdown, wordCount, extractedWordCount, htmlWordCount, h1, headings, schemaTypes }) {
  const warnings = []
  const tableCount = $('table').length
  const faqLikeBlocks = $('details, [aria-expanded], .faq, [class*="faq"], [id*="faq"]').length
  const markdownHasTable = /\|.+\|/.test(markdown)
  const markdownQuestionCount = (markdown.match(/\?/g) || []).length

  if (!h1) warnings.push('No H1 was found in the fetched HTML.')
  if (wordCount < 250) warnings.push('The AI-readable markdown is thin, which can limit citation context.')
  if (headings.length < 2) warnings.push('The extracted page has limited heading structure.')
  if (schemaTypes.length === 0) warnings.push('No structured data schema was detected in the HTML.')
  if (tableCount > 0 && !markdownHasTable) {
    warnings.push('HTML tables are present, but table text may not be fully preserved in the extracted markdown.')
  }
  if (faqLikeBlocks > 0 && markdownQuestionCount < 2) {
    warnings.push('FAQ or accordion-like content exists in HTML, but few questions appear in extracted text.')
  }
  if (htmlWordCount > 250 && extractedWordCount / htmlWordCount < 0.45) {
    warnings.push('Less than half of the visible HTML body text appears in the AI-readable markdown.')
  }

  return warnings
}

export function extractPageIntelligence({ html = '', markdown = '', url = '' }) {
  const $ = cheerio.load(html || '')
  const normalizedMarkdown = normalizeMarkdown(markdown)
  const title = compactText($('title').first().text())
  const metaDescription = getMeta($, 'description')
  const canonical = $('link[rel="canonical"]').attr('href') || url
  const h1 = compactText($('h1').first().text())
  const htmlHeadings = $('h1,h2,h3')
    .toArray()
    .map(node => ({
      level: node.tagName.toLowerCase(),
      text: compactText($(node).text()),
    }))
    .filter(heading => heading.text)
  const markdownHeadings = getHeadings(normalizedMarkdown).map(line => ({
    level: line.match(/^#{1,6}/)?.[0].length || 1,
    text: line.replace(/^#{1,6}\s+/, '').trim(),
  }))
  const headings = htmlHeadings.length > 0
    ? htmlHeadings.map(heading => heading.text)
    : markdownHeadings.map(heading => heading.text)
  const bodyText = compactText($('body').text())
  const schemaTypes = collectSchemaTypes($)
  const robotsDirectives = parseRobotsDirectives(`${getMeta($, 'robots')},${getMeta($, 'googlebot')}`)
  const wordCount = getWords(normalizedMarkdown).length
  const extractedWordCount = wordCount
  const htmlWordCount = getWords(bodyText).length

  const warnings = buildExtractionWarnings({
    $,
    markdown: normalizedMarkdown,
    wordCount,
    extractedWordCount,
    htmlWordCount,
    h1,
    headings,
    schemaTypes,
  })

  if (robotsDirectives.noindex) warnings.push('A robots meta noindex directive was found.')
  if (robotsDirectives.nosnippet) warnings.push('A robots meta nosnippet directive was found.')
  if (robotsDirectives.maxSnippet) warnings.push(`A robots meta ${robotsDirectives.maxSnippet} directive was found.`)

  return {
    title,
    metaDescription,
    h1,
    headings,
    headingDetails: htmlHeadings.length > 0 ? htmlHeadings : markdownHeadings,
    canonical,
    schemaTypes,
    wordCount,
    htmlWordCount,
    extractedWordCount,
    tableCount: $('table').length,
    faqLikeBlockCount: $('details, [aria-expanded], .faq, [class*="faq"], [id*="faq"]').length,
    robotsMeta: robotsDirectives,
    warnings,
  }
}
