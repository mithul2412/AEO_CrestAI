function makeCheck(id, label, passed, points, message) {
  return { id, label, passed, points, message }
}

function scoreChecks(checks) {
  return checks.reduce((sum, check) => sum + (check.passed ? check.points : 0), 0)
}

function hasRobotRecommendation(artifacts, agent) {
  return (artifacts.robotsRecommendations || []).some(recommendation => [
    ...(recommendation.userAgents || []),
    ...(recommendation.optionalUserAgents || []),
  ].includes(agent))
}

function hasHostedProfile(artifacts) {
  return /\/agent\/|https?:\/\/.+\/agent\//.test(artifacts.llmsTxt || artifacts.alternateLinkSnippet || '')
}

export function computeEngineReadiness(profile, artifacts = {}, sourceSignals = {}) {
  const hasJsonLd = Array.isArray(artifacts.jsonLd) && artifacts.jsonLd.length > 0
  const hasActions = (artifacts.actionMetadata || []).length > 0
  const hasContact = Boolean(profile.business?.contact?.email || profile.business?.contact?.phone || profile.business?.contact?.contactUrl || profile.business?.contact?.bookingUrl)
  const hasClaims = (artifacts.claimSourceMap || []).some(claim => claim.sourceUrl || claim.sourceText)
  const hasFaq = (artifacts.faqBlock || []).some(faq => !faq.needsApproval && faq.question && faq.answer)
  const hostedProfile = hasHostedProfile(artifacts)

  const chatgptChecks = [
    makeCheck('oai-searchbot', 'OAI-SearchBot recommendation', hasRobotRecommendation(artifacts, 'OAI-SearchBot'), 18, 'Supports ChatGPT search crawling recommendations.'),
    makeCheck('hosted-profile', 'Hosted profile link', hostedProfile, 18, 'Provides a stable AI-readable Crest profile.'),
    makeCheck('jsonld', 'JSON-LD exists', hasJsonLd, 18, 'Provides schema-visible entity data.'),
    makeCheck('actions', 'Action metadata exists', hasActions, 18, 'Makes next-step actions easier to detect.'),
    makeCheck('contact', 'Contact or booking exists', hasContact, 14, 'Provides a user routing path.'),
    makeCheck('claims', 'Claims are source grounded', hasClaims, 14, 'Supports citation readiness.'),
  ]

  const perplexityChecks = [
    makeCheck('perplexitybot', 'PerplexityBot recommendation', hasRobotRecommendation(artifacts, 'PerplexityBot'), 18, 'Supports Perplexity crawler access recommendations.'),
    makeCheck('llms-txt', 'llms.txt generated', Boolean(artifacts.llmsTxt), 18, 'Provides concise AI-readable context.'),
    makeCheck('hosted-markdown', 'Hosted Markdown profile path', hostedProfile, 18, 'Provides a clean Markdown-accessible profile.'),
    makeCheck('source-urls', 'Source URLs included', hasClaims, 18, 'Supports source attribution.'),
    makeCheck('faq', 'FAQ available', hasFaq, 14, 'Supports question-answer extraction.'),
    makeCheck('claim-map', 'Claim-source map exists', (artifacts.claimSourceMap || []).length > 0, 14, 'Supports citation-ready claims.'),
  ]

  const googleChecks = [
    makeCheck('googlebot', 'Googlebot recommendation', hasRobotRecommendation(artifacts, 'Googlebot'), 18, 'Preserves normal search crawling recommendation.'),
    makeCheck('jsonld', 'JSON-LD exists', hasJsonLd, 22, 'Provides schema markup matching profile facts.'),
    makeCheck('claims', 'Visible claims are sourced', hasClaims, 20, 'Reduces hidden or unsupported claim risk.'),
    makeCheck('faq-schema', 'FAQPage only when FAQ source exists', !hasFaq || (profile.faqs || []).length > 0, 14, 'Avoids unsupported FAQ schema.'),
    makeCheck('schema-surface', 'Schema surface exists', hasJsonLd, 14, 'Supports entity classification.'),
    makeCheck('no-source-signal-conflict', 'Existing llms signals preserved', Boolean(sourceSignals), 12, 'Uses source signals without changing website facts.'),
  ]

  const claudeChecks = [
    makeCheck('claudebot', 'Claude crawler recommendations', hasRobotRecommendation(artifacts, 'ClaudeBot') && hasRobotRecommendation(artifacts, 'Claude-SearchBot'), 20, 'Supports Claude crawler/user-agent recommendations.'),
    makeCheck('markdown-profile', 'Markdown profile generated', Boolean(artifacts.llmsFullTxt), 18, 'Provides low-noise Markdown context.'),
    makeCheck('claims', 'Claims are source grounded', hasClaims, 20, 'Supports trust and citation evaluation.'),
    makeCheck('actions', 'Action metadata exists', hasActions, 18, 'Makes business actions clear.'),
    makeCheck('summary', 'Low-noise summary exists', Boolean(profile.business?.description), 14, 'Provides compact business context.'),
    makeCheck('contact', 'Contact route exists', hasContact, 10, 'Provides a fallback action path.'),
  ]

  return {
    chatgpt: { score: scoreChecks(chatgptChecks), checks: chatgptChecks },
    perplexity: { score: scoreChecks(perplexityChecks), checks: perplexityChecks },
    google: { score: scoreChecks(googleChecks), checks: googleChecks },
    claude: { score: scoreChecks(claudeChecks), checks: claudeChecks },
  }
}
