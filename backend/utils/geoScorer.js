import {
  getAverageSentenceLength,
  getBulletLines,
  getCitationSignals,
  getHeadings,
  getNumericSignals,
  getParagraphs,
  getSentences,
  getWords,
  hasComparisonSignal,
  hasLlmsTxtSignal,
  hasStructuredDataSignal,
} from './contentSignals.js'

const CHECKS = [
  {
    id: 'faq',
    label: 'FAQ structure',
    weight: 20,
    lift: '+11% citation lift',
    test: md => {
      const lines = md.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
      const faqHeading = /(^#{1,6}\s*(faq|frequently asked questions)\b)|(^#{1,6}\s*[^#\n]+\?$)|(^\*\*[^*]+\?\*\*$)/im.test(md)
      const questionLines = lines.filter(line => /^#{1,6}\s*[^#\n]+\?$/.test(line) || /^\*\*[^*]+\?\*\*$/.test(line) || /^[Qq]:\s+.+\?$/.test(line))
      const inlineQuestions = (md.match(/\?/g) || []).length
      return faqHeading && (questionLines.length >= 2 || inlineQuestions >= 3)
    }
  },
  {
    id: 'stats',
    label: 'Statistics / numbers',
    weight: 15,
    lift: '+40% avg',
    test: md => getNumericSignals(md).length >= 2
  },
  {
    id: 'citations',
    label: 'External citations',
    weight: 20,
    lift: '+115% visibility',
    test: md => {
      const citations = getCitationSignals(md)
      return citations.urls.length >= 2 || citations.total >= 2
    }
  },
  {
    id: 'schema',
    label: 'Structured data / schema',
    weight: 15,
    lift: '~ impact',
    test: md => hasStructuredDataSignal(md)
  },
  {
    id: 'comparison',
    label: 'Comparison framing',
    weight: 10,
    lift: '~ impact',
    test: md => hasComparisonSignal(md)
  },
  {
    id: 'fluency',
    label: 'Fluency / reading level',
    weight: 10,
    lift: '+22% avg',
    test: md => {
      const headings = getHeadings(md).length
      const bullets = getBulletLines(md).length
      const paragraphs = getParagraphs(md).length
      const words = getWords(md).length
      const avgSentenceLength = getAverageSentenceLength(md)
      const sentences = getSentences(md).length

      return headings >= 2
        && paragraphs >= 3
        && bullets >= 3
        && words >= 180
        && sentences >= 4
        && avgSentenceLength >= 4
    }
  },
  {
    id: 'llmstxt',
    label: 'llms.txt present',
    weight: 10,
    lift: '~ impact',
    test: (md, options = {}) => hasLlmsTxtSignal(md, options.sourceSignals)
  },
]

export function computeGeoScore(markdown, options = {}) {
  const results = CHECKS.map(check => ({ ...check, passed: check.test(markdown, options) }))
  const score = results.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0)
  return { score, checks: results }
}
