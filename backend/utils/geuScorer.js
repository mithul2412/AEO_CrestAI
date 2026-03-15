import {
  getLeadText,
  getSentences,
  getWords,
  hasAnswerLikeOpening,
  hasNamedSourceNearFact,
} from './contentSignals.js'

function isStandaloneSentence(sentence) {
  return /^[A-Z][^!?]*\b(is|are|was|were|has|have|can|will|does|do|provides|offers|includes|supports|enables|allows|helps|gives|makes|creates|uses|serves)\b/i.test(sentence)
    && getWords(sentence).length >= 3
}

const CHECKS = [
  {
    id: 'standalone',
    label: 'Standalone sentences',
    weight: 30,
    lift: 'AutoGEO',
    test: md => getSentences(md).filter(isStandaloneSentence).length >= 3
  },
  {
    id: 'frontloaded',
    label: 'Answer front-loaded',
    weight: 25,
    lift: 'AutoGEO',
    test: md => {
      const leadText = getLeadText(md, 0.2, 80)
      return hasAnswerLikeOpening(leadText) && leadText.length > 120
    }
  },
  {
    id: 'sourced',
    label: 'Sourced claims',
    weight: 25,
    lift: 'AutoGEO',
    test: md => hasNamedSourceNearFact(md)
  },
  {
    id: 'coherent',
    label: 'Coherent opening',
    weight: 20,
    lift: 'AutoGEO',
    test: md => {
      const opening = getSentences(md).slice(0, 2)
      if (opening.length === 0) return false
      if (opening.some(sentence => /^(It|They|This|These|That|Those)\b/.test(sentence.trim()))) {
        return false
      }
      return opening.every(sentence => /[A-Za-z]/.test(sentence) && getWords(sentence).length >= 4)
    }
  },
]

export function computeGeuScore(markdown) {
  const results = CHECKS.map(check => ({ ...check, passed: check.test(markdown) }))
  const score = results.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0)
  return { score, checks: results }
}
