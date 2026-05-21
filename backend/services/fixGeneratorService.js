function formatLift(value) {
  return value > 0 ? `+${value}` : '+0'
}

function pageName(pageIntelligence = {}) {
  return pageIntelligence.extraction?.h1 ||
    pageIntelligence.extraction?.title ||
    'this page'
}

function buildAnswerCopy(query, pageIntelligence = {}) {
  const name = pageName(pageIntelligence)
  const cleanQuery = String(query || 'the target query').replace(/[?.!]+$/, '')
  return `${name} directly answers "${cleanQuery}" by stating the recommended answer first, then supporting it with specific evidence, examples, and source-backed details.`
}

function buildFaqCopy(query, pageIntelligence = {}) {
  const cleanQuery = String(query || 'the target query').replace(/[?.!]+$/, '')
  return `## ${cleanQuery}?\n\n${buildAnswerCopy(query, pageIntelligence)}\n\n- Key proof point: add one dated statistic or source-backed claim.\n- Best-fit context: explain who this answer is for and when it applies.\n- Citation support: link to the primary source or methodology behind the claim.`
}

export function generateHighestImpactFix({ query, intelligence, pageIntelligence = {} }) {
  const subscores = intelligence?.citationReadiness?.subscores || {}
  const access = pageIntelligence.access || {}
  const extraction = pageIntelligence.extraction || {}
  const retrieval = intelligence?.retrieval || {}
  const answer = intelligence?.answerExtraction || {}

  if (subscores.accessScore < 70) {
    return {
      failureMode: 'Access Failure',
      fix: 'Remove crawler and indexability blockers before rewriting the page.',
      whereToEdit: 'robots.txt, page robots meta tags, WAF rules, or page access controls.',
      why: 'AI citation systems cannot evaluate or cite content they cannot reach or index.',
      exampleCopy: access.warnings?.[0] || 'Allow Googlebot, OAI-SearchBot, GPTBot, and PerplexityBot when the page is intended to be discoverable.',
      expectedLift: { retrievalScore: '+0', answerScore: '+0', accessScore: formatLift(100 - (subscores.accessScore || 0)) },
      confidence: 'high',
    }
  }

  if (subscores.extractionScore < 70) {
    return {
      failureMode: 'Extraction Failure',
      fix: 'Make the core answer content visible as crawlable HTML text.',
      whereToEdit: extraction.warnings?.[0]?.includes('H1') ? 'The page H1 and opening content.' : 'The section flagged in the AI-readable preview.',
      why: 'The page may look complete to humans while key content is missing or weak in the extracted text.',
      exampleCopy: `Add a crawlable H1 and short paragraph that names ${pageName(pageIntelligence)} and the main answer clearly.`,
      expectedLift: { retrievalScore: '+8', answerScore: '+10', extractionScore: formatLift(100 - (subscores.extractionScore || 0)) },
      confidence: 'medium-high',
    }
  }

  if ((retrieval.retrievalScore || 0) < 65) {
    return {
      failureMode: 'Retrieval Failure',
      fix: 'Add a query-matched answer block near the top of the page.',
      whereToEdit: 'Immediately after the H1 or first intro paragraph.',
      why: retrieval.diagnosis || 'The best chunk does not strongly match the target query.',
      exampleCopy: buildFaqCopy(query, pageIntelligence),
      expectedLift: { retrievalScore: '+14', answerScore: '+10' },
      confidence: 'medium-high',
    }
  }

  if ((answer.answerScore || 0) < 70) {
    return {
      failureMode: 'Answer Failure',
      fix: 'Rewrite the top retrieved chunk so its first sentence is a standalone answer.',
      whereToEdit: retrieval.topChunks?.[0]?.section ? `Section: ${retrieval.topChunks[0].section}` : 'The top retrieved chunk.',
      why: answer.diagnosis || 'The chunk is relevant but hard for an AI answer engine to quote cleanly.',
      exampleCopy: buildFaqCopy(query, pageIntelligence),
      expectedLift: { retrievalScore: '+6', answerScore: '+18' },
      confidence: 'medium-high',
    }
  }

  if ((subscores.entityScore || 0) < 55) {
    return {
      failureMode: 'Intent Mismatch',
      fix: 'Name the exact brand, product, category, and use case from the target query in the top answer block.',
      whereToEdit: retrieval.topChunks?.[0]?.section ? `Section: ${retrieval.topChunks[0].section}` : 'The first answer block.',
      why: 'AI retrieval systems need the query entities to appear together in a self-contained chunk before they can confidently cite it.',
      exampleCopy: buildFaqCopy(query, pageIntelligence),
      expectedLift: { retrievalScore: '+10', answerScore: '+6', entityScore: formatLift(70 - (subscores.entityScore || 0)) },
      confidence: 'medium',
    }
  }

  if ((subscores.evidenceScore || 0) < 55) {
    return {
      failureMode: 'Evidence Failure',
      fix: 'Add one specific statistic, dated proof point, or named source to the top answer block.',
      whereToEdit: 'Within the first 200 words and inside the top retrieved chunk.',
      why: 'The page answers the query, but citation confidence is limited by weak proof.',
      exampleCopy: 'Add a sentence like: "Based on [source or internal dataset], teams saw [specific number] improvement in [outcome] in 2025."',
      expectedLift: { retrievalScore: '+4', answerScore: '+8', evidenceScore: formatLift(70 - (subscores.evidenceScore || 0)) },
      confidence: 'medium',
    }
  }

  if ((subscores.authorityScore || 0) < 55) {
    return {
      failureMode: 'Authority Risk',
      fix: 'Add visible authority proof to the answer block and schema.',
      whereToEdit: 'The answer block, author/reviewer area, and Article/Organization schema.',
      why: 'Citable answers need traceable authorship, source attribution, and credible organization signals.',
      exampleCopy: 'Add an author or reviewer line, an updated date, Organization or Article schema, and a sentence that cites the primary source behind the claim.',
      expectedLift: { evidenceScore: '+8', authorityScore: formatLift(70 - (subscores.authorityScore || 0)) },
      confidence: 'medium',
    }
  }

  return {
    failureMode: 'Structure Opportunity',
    fix: 'Turn the strongest answer into a short FAQ or comparison block.',
    whereToEdit: retrieval.topChunks?.[0]?.section ? `Section: ${retrieval.topChunks[0].section}` : 'Near the top retrieved answer.',
    why: 'The page is mostly ready; clearer structure can make the answer easier to reuse.',
    exampleCopy: buildFaqCopy(query, pageIntelligence),
    expectedLift: { retrievalScore: '+5', answerScore: '+6' },
    confidence: 'medium',
  }
}
