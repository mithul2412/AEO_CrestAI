export const FAILURE_MODES = [
  'Access Failure',
  'Extraction Failure',
  'Retrieval Failure',
  'Answer Failure',
  'Evidence Failure',
  'Structure Failure',
  'Freshness Failure',
  'Authority Risk',
  'Intent Mismatch',
  'Over-Optimization Risk',
]

const BLOCKED_PATTERN = /403|access denied|forbidden|blocked|captcha|verify you are human|permission denied/i

export function getBlockedPageState(pageIntelligence = {}, markdown = '') {
  const access = pageIntelligence?.access || {}
  const extraction = pageIntelligence?.extraction || {}
  const visibleSignals = [
    access.statusCode,
    access.finalUrl,
    access.canonical,
    extraction.title,
    extraction.h1,
    ...(access.warnings || []),
    ...(extraction.warnings || []),
    String(markdown || '').slice(0, 2000),
  ].join(' ')

  const isHardBlock = Number(access.statusCode) === 401 || Number(access.statusCode) === 403
  const isLikelyBlocked = isHardBlock || BLOCKED_PATTERN.test(visibleSignals)

  return {
    isBlocked: isLikelyBlocked,
    statusCode: access.statusCode ?? null,
    label: isLikelyBlocked ? 'Blocked' : 'Crawlable',
    scoreLabel: isLikelyBlocked ? 'Blocked-page score' : 'Target query fit',
    summary: isLikelyBlocked
      ? 'AI is reading an access gate, not your real page.'
      : 'Crest.ai can inspect the page content for this query.',
    action: isLikelyBlocked ? 'Fix access first.' : '',
  }
}

export function getAnswerGapCopy(gapScore) {
  if (typeof gapScore !== 'number') {
    return {
      label: 'Answer gap unavailable',
      detail: 'Run a target query to compare page quality with answer quality.',
      tone: 'muted',
    }
  }

  if (gapScore >= 15) {
    return {
      label: 'Large answer gap',
      detail: 'The page looks stronger overall than it does for this exact query.',
      tone: 'danger',
    }
  }

  if (gapScore >= 5) {
    return {
      label: 'Moderate answer gap',
      detail: 'The answer is present, but the page should make it more direct and quotable.',
      tone: 'warn',
    }
  }

  if (gapScore >= -5) {
    return {
      label: 'Answer path aligned',
      detail: 'The page quality and target-query answer are mostly aligned.',
      tone: 'ok',
    }
  }

  return {
    label: 'Query-led strength',
    detail: 'The target answer is stronger than the broader page structure.',
    tone: 'ok',
  }
}

export function getExecutiveQueryVerdict({ queryScore, gapScore, blockedState }) {
  if (blockedState?.isBlocked) {
    return {
      title: 'Blocked',
      meaning: 'AI is reading an access gate, not your real page.',
      next: 'Fix access first.',
      tone: 'danger',
    }
  }

  if (typeof queryScore !== 'number') {
    return {
      title: 'Run a query to judge the answer path',
      meaning: 'Crest.ai needs a target question before judging answer quality.',
      next: 'Run Query Test.',
      tone: 'muted',
    }
  }

  if (queryScore >= 75 && Math.abs(gapScore ?? 0) <= 10) {
    return {
      title: 'This page answers the query clearly',
      meaning: 'The answer path is direct enough to inspect proof and polish the strongest section.',
      next: 'Review the evidence, then tune the top answer block.',
      tone: 'ok',
    }
  }

  if (queryScore >= 60) {
    return {
      title: 'The answer path needs work',
      meaning: 'A reader can find the answer, but the page should make it easier to extract and quote.',
      next: 'Sharpen the first answer block.',
      tone: 'warn',
    }
  }

  return {
    title: 'The answer path is weak',
    meaning: 'The page does not make the target answer clear enough for confident citation.',
    next: 'Add a direct answer block near the top.',
    tone: 'danger',
  }
}

export function getCompetitorCoverageLabel(competitorIntelligence = {}) {
  if (competitorIntelligence?.status === 'disabled') return 'Cannot compare'
  const readableCount = competitorIntelligence?.competitors?.length || 0
  if (readableCount >= 3) return 'High'
  if (readableCount === 2) return 'Medium'
  if (readableCount === 1) return 'Low'
  return 'Cannot compare'
}

export function getCompetitorPosition(competitorIntelligence = {}) {
  const gap = competitorIntelligence?.gap || {}
  const hasGap = gap.status === 'ok'
  const coverage = getCompetitorCoverageLabel(competitorIntelligence)
  const delta = typeof gap.scoreDelta === 'number' ? gap.scoreDelta : null
  const competitorAhead = hasGap && gap.winner === 'competitor'

  return {
    coverage,
    hasGap,
    delta,
    tone: !hasGap ? 'muted' : competitorAhead && delta > 5 ? 'danger' : Math.abs(delta || 0) <= 5 ? 'warn' : 'ok',
    headline: !hasGap
      ? 'Competitor comparison needs more readable evidence.'
      : competitorAhead
        ? 'Best readable competitor has a stronger answer path.'
        : 'Your page has the stronger readable answer path.',
    detail: competitorIntelligence?.status === 'disabled'
      ? (competitorIntelligence.discovery?.reason || competitorIntelligence.reason || 'Competitor discovery is not configured.')
      : hasGap
        ? (gap.whyCompetitorWon || 'Crest.ai compared your top chunk with the best readable competitor chunk.')
        : 'Crest.ai could not build a reliable competitor chunk comparison for this query.',
  }
}

export function getFixFirstCopy({ fix, verdicts = [], blockedState }) {
  if (blockedState?.isBlocked) {
    return {
      headline: 'Fix access first.',
      reason: 'Content rewrite advice is not meaningful until AI readers can see the real page.',
      draft: 'Goal: resolve blocked-page access before content rewriting.\nFormat: access checklist + likely source + validation steps',
      failureMode: 'Access Failure',
    }
  }

  const firstSuggestedFix = verdicts.find(verdict => verdict.suggestedFix)?.suggestedFix
  const firstTopGap = verdicts.find(verdict => verdict.topGap)?.topGap

  return {
    headline: fix?.fix || firstSuggestedFix || 'Add a direct answer block near the top of the page.',
    reason: fix?.why || firstTopGap || 'The target answer needs to be easier to find, extract, and quote.',
    draft: [
      fix?.fix ? `Suggested fix: ${fix.fix}` : firstSuggestedFix ? `Suggested fix: ${firstSuggestedFix}` : '',
      fix?.why ? `Why: ${fix.why}` : firstTopGap ? `Top gap: ${firstTopGap}` : '',
      fix?.whereToEdit ? `Where to edit: ${fix.whereToEdit}` : '',
      fix?.exampleCopy ? `Example copy: ${fix.exampleCopy}` : '',
      'Format: issues + rewrite + expected score impact',
    ].filter(Boolean).join('\n'),
    failureMode: fix?.failureMode || verdicts.find(verdict => verdict.failureMode)?.failureMode || 'Answer Failure',
  }
}

function scoreBand(score) {
  if (typeof score !== 'number') return 'unknown'
  if (score >= 80) return 'high'
  if (score >= 60) return 'medium'
  if (score >= 40) return 'low'
  return 'very-low'
}

export function getModelConsensus(verdicts = [], modelStatus = []) {
  const responded = verdicts.filter(verdict => typeof verdict.queryMatchScore === 'number')
  const total = modelStatus.length || verdicts.length
  if (!total) return { tier: 'muted', label: 'No model notes returned.' }
  if (responded.length < 2) return { tier: 'muted', label: `${responded.length}/${total} models responded.` }

  const scores = responded.map(verdict => verdict.queryMatchScore)
  const spread = Math.max(...scores) - Math.min(...scores)
  const modes = responded
    .map(verdict => FAILURE_MODES.includes(verdict.failureMode) ? verdict.failureMode : null)
    .filter(Boolean)
  const modeCounts = modes.reduce((accumulator, mode) => {
    accumulator[mode] = (accumulator[mode] || 0) + 1
    return accumulator
  }, {})
  const majorityMode = Object.entries(modeCounts)
    .sort((a, b) => b[1] - a[1])[0]

  if (modes.length < responded.length) {
    return {
      tier: spread <= 15 ? 'warn' : 'danger',
      label: spread <= 15 ? 'Models gave similar scores.' : 'Model scores diverged.',
    }
  }

  if (majorityMode?.[1] === responded.length) {
    return { tier: 'ok', label: `Strong consensus: ${majorityMode[0]}.` }
  }

  if (majorityMode?.[1] >= 2 && spread <= 20) {
    return { tier: 'warn', label: `Moderate consensus: ${majorityMode[0]}.` }
  }

  if (spread <= 15 && new Set(responded.map(verdict => scoreBand(verdict.queryMatchScore))).size === 1) {
    return { tier: 'warn', label: 'Moderate consensus: same score band, different failure modes.' }
  }

  return { tier: 'danger', label: 'Model diagnoses diverged.' }
}

export function getTechnicalLabel(label) {
  return {
    geuScore: 'AI usability',
    llmContentScore: 'Model readability',
    queryScore: 'Target query fit',
    gapScore: 'Answer gap',
    contentScore: 'Page structure',
    overallScore: 'Overall score',
    GEU: 'AI usability',
    'LLM baseline': 'Model readability',
    'Query match': 'Target query fit',
    'Content-Query Gap': 'Answer gap',
  }[label] || label
}
