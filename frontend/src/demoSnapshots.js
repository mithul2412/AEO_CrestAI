const capturedAt = '2026-04-30T21:11:00.000Z'
const demoQuery = 'Whats the cost of this plan'

const markdown = `# Xfinity Internet

Xfinity offers home internet plans with download speeds that vary by location, plan, and network availability. Customers can shop internet-only plans, bundle internet with mobile or TV, and add equipment such as an xFi Gateway.

## Internet plans

- Entry-level plans are positioned for browsing, email, and smaller households.
- Mid-tier plans are positioned for streaming, video calls, gaming, and multiple connected devices.
- Gigabit and multi-gig options are positioned for heavier households where available.

## Bundles and mobile

Xfinity promotes savings when customers combine home internet with Xfinity Mobile or other services. Availability, pricing, taxes, fees, equipment charges, and promotional terms vary by address.

## Support and account actions

Customers can check service availability, compare plans, sign in to manage an account, troubleshoot connectivity, and schedule installation or support.

## Frequently asked questions

### Whats the cost of this plan?

Xfinity plan costs vary by address, speed tier, equipment, fees, taxes, contract terms, and current promotions. Customers should check their address to see the current price for a specific plan.

### Can Xfinity internet be bundled?

Yes. Xfinity commonly promotes bundles with mobile, TV, streaming, or equipment options depending on location and eligibility.

### Are prices the same everywhere?

No. Xfinity prices, fees, offers, and speeds can vary by address and market. Customers should check availability for their exact address.`

const checks = [
  { id: 'faq', label: 'FAQ structure', weight: 20, lift: '+11% citation lift', passed: true },
  { id: 'stats', label: 'Statistics / numbers', weight: 15, lift: '+40% avg', passed: true },
  { id: 'citations', label: 'External citations', weight: 20, lift: '+115% visibility', passed: true },
  { id: 'schema', label: 'Structured data / schema', weight: 15, lift: '~ impact', passed: false },
  { id: 'comparison', label: 'Comparison framing', weight: 10, lift: '~ impact', passed: true },
  { id: 'fluency', label: 'Fluency / reading level', weight: 10, lift: '+22% avg', passed: true },
  { id: 'llmstxt', label: 'llms.txt present', weight: 10, lift: '~ impact', passed: false },
]

const geuChecks = [
  { id: 'standalone', label: 'Standalone sentences', weight: 30, lift: 'AutoGEO', passed: true },
  { id: 'frontloaded', label: 'Answer front-loaded', weight: 25, lift: 'AutoGEO', passed: false },
  { id: 'sourced', label: 'Sourced claims', weight: 25, lift: 'AutoGEO', passed: false },
  { id: 'coherent', label: 'Coherent opening', weight: 20, lift: 'AutoGEO', passed: false },
]

const llmContentModels = [
  {
    model: 'Llama 3.3 70B',
    llmContentScore: 44,
    briefReason: 'The page communicates the service category, but plan details, eligibility, and source-backed specifics need clearer extractable structure.',
  },
]

const chunks = [
  {
    chunkId: 'c1',
    section: 'Internet plans',
    text: 'Xfinity offers home internet plans with download speeds that vary by location, plan, and network availability. Customers can shop internet-only plans, bundle internet with mobile or TV, and add equipment such as an xFi Gateway.',
    similarity: 0.82,
    position: 0.18,
    wordCount: 34,
    directAnswer: true,
  },
  {
    chunkId: 'c2',
    section: 'Bundles and mobile',
    text: 'Xfinity promotes savings when customers combine home internet with Xfinity Mobile or other services. Availability, pricing, taxes, fees, equipment charges, and promotional terms vary by address.',
    similarity: 0.69,
    position: 0.42,
    wordCount: 27,
    directAnswer: true,
  },
  {
    chunkId: 'c3',
    section: 'Frequently asked questions',
    text: 'Xfinity plan costs vary by address, speed tier, equipment, fees, taxes, contract terms, and current promotions. Customers should check their address to see the current price for a specific plan.',
    similarity: 0.88,
    position: 0.74,
    wordCount: 18,
    directAnswer: true,
  },
]

const marketAngles = [
  {
    angleId: 'target',
    angleLabel: 'Target Query',
    angleQuery: demoQuery,
    status: 'ok',
    resultCount: 8,
  },
  {
    angleId: 'category',
    angleLabel: 'Category Leaders',
    angleQuery: 'home internet plan cost',
    status: 'ok',
    resultCount: 8,
  },
  {
    angleId: 'alternatives',
    angleLabel: 'Alternatives',
    angleQuery: 'Xfinity internet alternatives pricing',
    status: 'ok',
    resultCount: 8,
  },
  {
    angleId: 'comparison',
    angleLabel: 'Comparison',
    angleQuery: 'home internet pricing comparison Xfinity',
    status: 'ok',
    resultCount: 8,
  },
]

const marketCompetitors = [
  {
    id: 'att-com',
    domain: 'att.com',
    url: 'https://www.att.com/internet/',
    presenceScore: 84,
    bestRank: 1,
    coverage: 0.75,
    tier: 'leader',
    tierLabel: 'Leader',
    domainType: 'brand',
    strongestAngleId: 'target',
    rankReason: 'High market presence: 3/4 angles, best rank #1, strongest in Target Query.',
    whyHere: 'AT&T surfaces clear plan-price snippets for cost-oriented internet searches.',
    snippetPreview: 'AT&T Fiber plans are commonly presented with monthly starting prices, speed tiers, and availability notes.',
    strengths: ['Clear monthly price snippets', 'Strong speed-tier framing'],
    appearances: [
      { angleId: 'target', angleLabel: 'Target Query', angleQuery: demoQuery, rank: 1, url: 'https://www.att.com/internet/', title: 'AT&T Internet plans', snippet: 'Compare AT&T Fiber internet plans, speeds, and monthly pricing.' },
      { angleId: 'category', angleLabel: 'Category Leaders', angleQuery: 'home internet plan cost', rank: 2, url: 'https://www.att.com/internet/', title: 'AT&T Fiber pricing', snippet: 'Internet plans with clear speed and monthly price options.' },
      { angleId: 'comparison', angleLabel: 'Comparison', angleQuery: 'home internet pricing comparison Xfinity', rank: 3, url: 'https://www.att.com/internet/', title: 'AT&T vs cable internet', snippet: 'Compare fiber internet options by speed, price, and availability.' },
    ],
  },
  {
    id: 'verizon-com',
    domain: 'verizon.com',
    url: 'https://www.verizon.com/home/internet/',
    presenceScore: 77,
    bestRank: 2,
    coverage: 0.75,
    tier: 'leader',
    tierLabel: 'Leader',
    domainType: 'brand',
    strongestAngleId: 'category',
    rankReason: 'High market presence: 3/4 angles, best rank #2, strongest in Category Leaders.',
    whyHere: 'Verizon shows strongly for home internet pricing and bundle-cost comparisons.',
    snippetPreview: 'Verizon home internet pages often expose plan prices, autopay notes, and availability checks.',
    strengths: ['Plan costs visible in snippets', 'Bundle pricing language'],
    appearances: [
      { angleId: 'category', angleLabel: 'Category Leaders', angleQuery: 'home internet plan cost', rank: 1, url: 'https://www.verizon.com/home/internet/', title: 'Verizon Home Internet', snippet: 'Shop home internet plans and compare monthly prices.' },
      { angleId: 'target', angleLabel: 'Target Query', angleQuery: demoQuery, rank: 2, url: 'https://www.verizon.com/home/internet/', title: 'Verizon internet cost', snippet: 'Check plan availability and current internet pricing.' },
      { angleId: 'alternatives', angleLabel: 'Alternatives', angleQuery: 'Xfinity internet alternatives pricing', rank: 4, url: 'https://www.verizon.com/home/internet/', title: 'Verizon alternatives', snippet: 'Compare 5G home and fiber internet plans.' },
    ],
  },
  {
    id: 'spectrum-com',
    domain: 'spectrum.com',
    url: 'https://www.spectrum.com/internet',
    presenceScore: 66,
    bestRank: 3,
    coverage: 0.5,
    tier: 'challenger',
    tierLabel: 'Challenger',
    domainType: 'brand',
    strongestAngleId: 'alternatives',
    rankReason: 'Broad presence: 2/4 angles with best rank #3.',
    whyHere: 'Spectrum appears for alternative-provider and pricing comparison angles.',
    snippetPreview: 'Spectrum internet pages typically lead with promotional internet pricing and speed claims.',
    strengths: ['Promotional price framing', 'Alternative provider visibility'],
    appearances: [
      { angleId: 'alternatives', angleLabel: 'Alternatives', angleQuery: 'Xfinity internet alternatives pricing', rank: 3, url: 'https://www.spectrum.com/internet', title: 'Spectrum Internet', snippet: 'View Spectrum internet plans, speeds, and current promotional pricing.' },
      { angleId: 'comparison', angleLabel: 'Comparison', angleQuery: 'home internet pricing comparison Xfinity', rank: 5, url: 'https://www.spectrum.com/internet', title: 'Spectrum internet plans', snippet: 'Compare internet plans and equipment options.' },
    ],
  },
  {
    id: 't-mobile-com',
    domain: 't-mobile.com',
    url: 'https://www.t-mobile.com/home-internet',
    presenceScore: 58,
    bestRank: 4,
    coverage: 0.5,
    tier: 'challenger',
    tierLabel: 'Challenger',
    domainType: 'brand',
    strongestAngleId: 'category',
    rankReason: 'Broad presence: 2/4 angles with best rank #4.',
    whyHere: 'T-Mobile appears in wireless home internet pricing and alternative-provider searches.',
    snippetPreview: 'T-Mobile Home Internet pages emphasize a simple monthly price and availability check.',
    strengths: ['Simple monthly-price message', 'Strong alternative angle'],
    appearances: [
      { angleId: 'category', angleLabel: 'Category Leaders', angleQuery: 'home internet plan cost', rank: 4, url: 'https://www.t-mobile.com/home-internet', title: 'T-Mobile Home Internet', snippet: 'Home internet with simple monthly pricing and availability by address.' },
      { angleId: 'alternatives', angleLabel: 'Alternatives', angleQuery: 'Xfinity internet alternatives pricing', rank: 5, url: 'https://www.t-mobile.com/home-internet', title: 'T-Mobile internet alternative', snippet: 'Wireless home internet alternative with price-focused messaging.' },
    ],
  },
]

const intelligence = {
  citationReadiness: {
    score: 76,
    summary: 'The target query can be answered clearly, but citation readiness is limited by missing source-level AI signals and a not-front-loaded answer.',
    subscores: {
      retrievalScore: 72,
      answerScore: 64,
      evidenceScore: 46,
      structureScore: 52,
      freshnessScore: 50,
    },
  },
  retrieval: {
    retrievalScore: 72,
    diagnosis: 'The target query maps to usable plan and FAQ content, with the FAQ section providing the clearest direct answer.',
    topChunks: chunks,
  },
  answerExtraction: {
    answerScore: 64,
    diagnosis: 'The answer is present, but it should be moved higher and written as a concise, source-backed answer block.',
    subscores: {
      directnessScore: 72,
      quoteabilityScore: 58,
      evidenceScore: 46,
      specificityScore: 66,
    },
  },
  chunks,
  queryDiscovery: {
    brand: 'Xfinity',
    category: 'home internet provider',
    queries: [
      demoQuery,
      'best home internet provider for streaming?',
      'home internet plans with mobile bundle?',
    ],
  },
  searchPresence: {
    status: 'ok',
    sourceDomain: 'xfinity.com',
    domainRank: 3,
    results: [],
  },
  competitorIntelligence: {
    status: 'ok',
    competitors: marketCompetitors,
    searchPresence: {
      status: 'ok',
      sourceDomain: 'xfinity.com',
      domainRank: 3,
      results: [],
    },
    gap: {
      status: 'ok',
      winner: 'competitor',
      scoreDelta: 8,
      whyCompetitorWon: 'Competitor snippets expose clearer monthly-price language for cost-oriented searches.',
    },
  },
  competitorMap: {
    status: 'ok',
    competitors: marketCompetitors,
    angles: marketAngles,
    angleCount: marketAngles.length,
    marketSummary: {
      searchedAngles: '4/4',
      visibleCompetitors: marketCompetitors.length,
      sourceDomainPresence: 'xfinity.com appears in 2/4 angles, with best rank #3.',
      topLeader: {
        domain: 'att.com',
        tier: 'Leader',
        presenceScore: 84,
        bestRank: 1,
      },
      recommendedMove: 'Make the current plan cost easier to extract: show address-specific caveats, monthly price language, fees, and promotional terms in one quotable block.',
    },
  },
  highestImpactFix: {
    fix: 'Add a direct plan-comparison answer block near the top of the page.',
    why: 'The target answer exists, but the strongest answer is not front-loaded enough for quick extraction.',
    whereToEdit: 'Near the first internet-plan section, before promotional bundles.',
    exampleCopy: 'Xfinity offers residential internet plans for different household needs, from basic browsing to gigabit speeds where available. Exact speeds, prices, fees, and promotions vary by service address.',
    expectedLift: {
      answerScore: '+8 to +12',
      structureScore: '+5 to +8',
    },
    confidence: 'Medium',
    failureMode: 'Answer Failure',
    source: 'demo-snapshot',
  },
}

const baselineResults = {
  contentScore: 68,
  geuScore: 20,
  llmContentScore: 44,
  llmContentModels,
  llmContentStatus: [{ model: 'Llama 3.3 70B', status: 'ok' }],
  overallScore: 44,
  queryScore: null,
  gapScore: null,
  checks,
  geuChecks,
  verdicts: [],
  modelStatus: [],
  intelligence: {
    citationReadiness: {
      score: 52,
      summary: 'Baseline citation readiness uses source access, extraction, evidence, structure, and freshness until a query is added.',
      subscores: intelligence.citationReadiness.subscores,
    },
  },
}

const results = {
  contentScore: 68,
  geuScore: 20,
  llmContentScore: 44,
  llmContentModels,
  llmContentStatus: [{ model: 'Llama 3.3 70B', status: 'ok' }],
  overallScore: 52,
  queryScore: 76,
  llmQueryScore: 76,
  deterministicQueryScore: 76,
  scoreConfidence: 'partial',
  queryScoreConfidence: 'partial',
  gapScore: -8,
  checks,
  geuChecks,
  verdicts: [
    {
      model: 'Llama 3.3 70B',
      queryMatchScore: 78,
      verdict: 'The page answers the query clearly at a general level, but lacks a concise, quotable plan summary near the top.',
      failureMode: 'Answer Failure',
      topGap: 'The clearest answer is in FAQ-like content rather than the opening plan section.',
      suggestedFix: 'Move a short plan overview and availability caveat into the first visible content block.',
    },
    {
      model: 'Qwen 2.5 72B',
      queryMatchScore: 74,
      verdict: 'The page gives enough context to understand Xfinity internet plans, but exact plan details and evidence are not easy to cite.',
      failureMode: 'Evidence Failure',
      topGap: 'Pricing and plan terms are described generally, not as a stable cited answer.',
      suggestedFix: 'Add a sourced plan table or clearly dated availability note.',
    },
  ],
  modelStatus: [
    { model: 'Llama 3.3 70B', status: 'ok' },
    { model: 'Qwen 2.5 72B', status: 'ok' },
    { model: 'Nemotron 70B', status: 'error', error: 'Skipped in static demo snapshot.' },
  ],
  intelligence,
}

const agenticResult = {
  slug: 'xfinity-demo',
  canonicalProfile: {
    metadata: {
      version: 1,
      createdAt: capturedAt,
      updatedAt: capturedAt,
    },
    business: {
      name: 'Xfinity',
      domain: 'xfinity.com',
      description: 'Xfinity provides residential internet, mobile, TV, streaming, and home connectivity services, with offers that vary by address.',
    },
    source: {
      sourceUrl: 'https://www.xfinity.com/',
      query: demoQuery,
    },
    offerings: [
      { name: 'Residential internet plans', description: 'Internet plans with speeds and prices that vary by address.' },
      { name: 'Internet and mobile bundles', description: 'Promotional bundles combining home internet with mobile or other services.' },
    ],
    faqs: [
      {
        question: demoQuery,
        answer: 'Xfinity plan costs vary by address, speed tier, equipment, fees, taxes, contract terms, and current promotions. Customers should check their address to see the current price for a specific plan.',
      },
    ],
    contact: {
      website: 'https://www.xfinity.com/',
    },
  },
  artifacts: {
    llmsTxt: '# Xfinity\n\nResidential internet, mobile, and connectivity services.\n\nAI-readable profile: /agent/xfinity-demo',
    llmsFullTxt: '# Xfinity AI-readable profile\n\nSource URL: https://www.xfinity.com/\n\nXfinity provides residential internet plans and bundles. Availability, pricing, speeds, fees, and promotions vary by address.',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Xfinity',
        url: 'https://www.xfinity.com/',
      },
    ],
    faqBlock: `## Frequently asked questions\n\n### ${demoQuery}?\n\nXfinity plan costs vary by address, speed tier, equipment, fees, taxes, contract terms, and current promotions. Customers should check their address to see the current price for a specific plan.`,
    actionMetadata: { primaryAction: 'Check availability', url: 'https://www.xfinity.com/' },
    claimSourceMap: [{ claim: 'Availability and pricing vary by address.', source: 'https://www.xfinity.com/' }],
    structuredServiceProductData: [{ name: 'Residential internet plans', category: 'Internet service' }],
    robotsRecommendations: 'Expose /llms.txt and /llms-full.txt if the production website supports AI-readable files.',
    alternateLinkSnippet: '<link rel="alternate" type="text/markdown" href="/agent/xfinity-demo.md" />',
  },
  validation: {
    ok: true,
    checks: [
      { id: 'profile-name', label: 'Business name detected', status: 'pass' },
      { id: 'llms-text', label: 'llms.txt non-empty Markdown', status: 'pass' },
      { id: 'json-ld', label: 'JSON-LD generated', status: 'pass' },
    ],
  },
  engineReadiness: {
    chatgpt: {
      score: 78,
      checks: [
        { id: 'hosted-profile', label: 'Hosted profile available', passed: true },
        { id: 'llms-txt', label: 'llms.txt generated', passed: true },
      ],
    },
    perplexity: {
      score: 74,
      checks: [
        { id: 'source-map', label: 'Claim-source map generated', passed: true },
        { id: 'markdown-profile', label: 'Markdown profile generated', passed: true },
      ],
    },
  },
  hostedProfile: {
    htmlUrl: '/agent/xfinity-demo',
    jsonUrl: '/agent/xfinity-demo.json',
    markdownUrl: '/agent/xfinity-demo.md',
  },
  storage: {
    version: 1,
    updatedAt: capturedAt,
    monitoring: {
      lastScannedAt: capturedAt,
      lastChangeDetectedAt: null,
      lastRescanStatus: 'demo_snapshot',
      lastRescanSummary: 'Static demo snapshot. Live rescans are disabled in demo mode.',
    },
  },
}

export const demoSnapshots = {
  xfinity: {
    id: 'xfinity',
    label: 'Xfinity demo snapshot',
    capturedAt,
    readOnly: true,
    url: 'https://www.xfinity.com/',
    normalizedUrl: 'https://www.xfinity.com/',
    query: demoQuery,
    markdown,
    charCount: markdown.length,
    sourceSignals: {
      sourceUrl: 'https://www.xfinity.com/',
      origin: 'https://www.xfinity.com',
      llmsTxt: { present: false, url: null },
      llmsFullTxt: { present: false, url: null },
    },
    pageIntelligence: {
      access: {
        statusCode: 200,
        finalUrl: 'https://www.xfinity.com/',
        canonical: 'https://www.xfinity.com/',
        indexable: true,
        robots: {
          googlebot: 'allowed',
          oaiSearchBot: 'allowed',
          gptBot: 'allowed',
          perplexityBot: 'allowed',
        },
        warnings: [],
      },
      extraction: {
        title: 'Xfinity Internet, TV, Mobile and Home Phone',
        h1: 'Xfinity Internet',
        wordCount: 331,
        schemaTypes: [],
        warnings: [],
      },
    },
    baselineResults,
    results,
    querySuggestions: [
      demoQuery,
      'Can Xfinity internet be bundled with mobile?',
      'Do Xfinity prices vary by address?',
    ],
    querySuggestionsMeta: {
      model: 'Static demo fixture',
      fallback: false,
    },
    agenticResult,
  },
}

export function getDemoSnapshot(id) {
  return demoSnapshots[id] || null
}
