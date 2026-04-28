import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildQueryDiscovery } from '../services/queryDiscoveryService.js'

const API_BASE = process.env.AEO_API_BASE || 'http://localhost:3001'
const QUERY_LIMIT = Number(process.env.AEO_BENCHMARK_QUERIES || 3)
const REQUEST_TIMEOUT_MS = Number(process.env.AEO_BENCHMARK_TIMEOUT_MS || 120_000)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outputDir = path.resolve(__dirname, '../benchmark-results')

const BENCHMARK_SITES = [
  {
    name: 'Gusto Payroll',
    category: 'Payroll / HR',
    url: 'https://gusto.com/product/payroll',
    queries: [
      'best payroll software for small business',
      'gusto payroll pricing',
      'gusto vs adp for small business',
    ],
  },
  {
    name: 'HubSpot CRM',
    category: 'CRM',
    url: 'https://www.hubspot.com/products/crm',
    queries: [
      'best crm for small business',
      'hubspot crm pricing',
      'hubspot crm vs salesforce essentials',
    ],
  },
  {
    name: 'Shopify Pricing',
    category: 'Ecommerce',
    url: 'https://www.shopify.com/pricing',
    queries: [
      'best ecommerce platform for small business',
      'shopify plans',
      'shopify vs wix ecommerce',
    ],
  },
  {
    name: 'QuickBooks Online',
    category: 'Accounting',
    url: 'https://quickbooks.intuit.com/accounting/',
    queries: [
      'best accounting software for small business',
      'quickbooks online pricing',
      'quickbooks vs xero for small business',
    ],
  },
  {
    name: 'Calendly Scheduling',
    category: 'Scheduling',
    url: 'https://calendly.com/pricing',
    queries: [
      'best scheduling software for small business',
      'calendly plans',
      'calendly vs acuity scheduling',
    ],
  },
  {
    name: 'Mailchimp Marketing',
    category: 'Email Marketing',
    url: 'https://mailchimp.com/pricing/marketing/',
    queries: [
      'best email marketing software for small business',
      'mailchimp pricing plans',
      'mailchimp vs constant contact',
    ],
  },
  {
    name: 'Asana Project Management',
    category: 'Project Management',
    url: 'https://asana.com/pricing',
    queries: [
      'best project management software for small business',
      'asana pricing plans',
      'asana vs monday for small business',
    ],
  },
  {
    name: 'Zendesk Customer Service',
    category: 'Customer Support',
    url: 'https://www.zendesk.com/service/',
    queries: [
      'best customer support software for small business',
      'zendesk pricing plans',
      'zendesk vs freshdesk for small business',
    ],
  },
  {
    name: 'Square Payments',
    category: 'Business Banking / Payments',
    url: 'https://squareup.com/us/en/payments',
    queries: [
      'best payment processing for small business',
      'square payment processing fees',
      'square vs stripe for small business',
    ],
  },
  {
    name: 'Wix Business Websites',
    category: 'Website Builders',
    url: 'https://www.wix.com/business',
    queries: [
      'best website builder for small business',
      'wix business plans',
      'wix vs squarespace for small business',
    ],
  },
  {
    name: 'RingCentral Business Phone',
    category: 'VoIP',
    url: 'https://www.ringcentral.com/office/plansandpricing.html',
    queries: [
      'best voip phone service for small business',
      'ringcentral pricing plans',
      'ringcentral vs nextiva for small business',
    ],
  },
  {
    name: 'Brex Business Banking',
    category: 'Business Banking / Payments',
    url: 'https://www.brex.com/product/business-account',
    queries: [
      'best business banking for startups and small business',
      'brex business account fees',
      'brex vs mercury for small business',
    ],
  },
]

function timeoutSignal() {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS)
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    signal: timeoutSignal(),
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    throw new Error(`${res.status}: ${data.error || text.slice(0, 300)}`)
  }
  return data
}

function uniqueQueries(seedQueries, discoveredQueries) {
  const seen = new Set()
  return [...seedQueries, ...discoveredQueries]
    .map(query => String(query || '').trim())
    .filter(Boolean)
    .filter(query => {
      const key = query.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, QUERY_LIMIT)
}

function parseLift(value) {
  const numeric = Number(String(value || '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(numeric) ? numeric : 0
}

function estimateAfterFix(analysis) {
  const current = analysis.intelligence?.citationReadiness?.score || analysis.queryScore || 0
  const lifts = Object.values(analysis.intelligence?.highestImpactFix?.expectedLift || {}).map(parseLift)
  const lift = lifts.length ? Math.max(...lifts) : 0
  return Math.max(0, Math.min(100, Math.round(current + lift)))
}

function summarizeModels(analysis) {
  return (analysis.modelStatus || [])
    .map(status => `${status.model}:${status.status}${status.credentialLabel ? `(${status.credentialLabel})` : ''}`)
    .join(', ')
}

function summarizeModelErrors(statuses = []) {
  return statuses
    .filter(status => status.status === 'error')
    .map(status => `${status.model}: ${sanitizeError(status.error)}`)
}

function sanitizeError(error = '') {
  return String(error)
    .replace(/"user_id":"[^"]+"/g, '"user_id":"[redacted]"')
    .replace(/user_[A-Za-z0-9]+/g, 'user_[redacted]')
}

async function analyzeSite(site) {
  const fetchResult = await fetchJson(`${API_BASE}/fetch?url=${encodeURIComponent(site.url)}`)
  const discovery = buildQueryDiscovery({
    query: site.queries[0],
    sourceUrl: fetchResult.normalizedUrl || site.url,
    markdown: fetchResult.markdown,
    pageIntelligence: fetchResult.intelligence || {},
    maxQueries: QUERY_LIMIT,
  })
  const queries = uniqueQueries(site.queries, discovery.candidates)
  const baseline = await fetchJson(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      markdown: fetchResult.markdown,
      sourceSignals: fetchResult.sourceSignals || {},
      pageIntelligence: fetchResult.intelligence || {},
    }),
  })

  const queryResults = []
  for (const query of queries) {
    const analysis = await fetchJson(`${API_BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markdown: fetchResult.markdown,
        query,
        sourceUrl: fetchResult.normalizedUrl || site.url,
        sourceSignals: fetchResult.sourceSignals || {},
        baselineLlmContentScore: baseline.llmContentScore,
        pageIntelligence: fetchResult.intelligence || {},
      }),
    })

    queryResults.push({
      query,
      queryScore: analysis.queryScore,
      citationReadiness: analysis.intelligence?.citationReadiness?.score ?? null,
      estimatedAfterFix: estimateAfterFix(analysis),
      domainRank: analysis.intelligence?.searchPresence?.domainRank ?? null,
      searchStatus: analysis.intelligence?.searchPresence?.status || 'unknown',
      competitorStatus: analysis.intelligence?.competitorIntelligence?.status || 'unknown',
      fix: analysis.intelligence?.highestImpactFix || null,
      modelAgreement: summarizeModels(analysis),
      modelErrors: summarizeModelErrors(analysis.modelStatus || []),
      modelScores: (analysis.verdicts || []).map(verdict => ({
        model: verdict.model,
        score: verdict.queryMatchScore,
        failureMode: verdict.failureMode,
      })),
    })
  }

  return {
    name: site.name,
    category: site.category,
    url: site.url,
    normalizedUrl: fetchResult.normalizedUrl,
    fetch: {
      charCount: fetchResult.charCount,
      title: fetchResult.intelligence?.extraction?.title || '',
      wordCount: fetchResult.intelligence?.extraction?.wordCount || 0,
      accessStatus: fetchResult.intelligence?.access?.statusCode || null,
    },
    queryDiscovery: discovery,
    baseline: {
      overallScore: baseline.overallScore,
      contentScore: baseline.contentScore,
      geuScore: baseline.geuScore,
      llmContentScore: baseline.llmContentScore,
      modelAgreement: (baseline.llmContentStatus || [])
        .map(status => `${status.model}:${status.status}${status.credentialLabel ? `(${status.credentialLabel})` : ''}`)
        .join(', '),
      modelErrors: summarizeModelErrors(baseline.llmContentStatus || []),
    },
    queries: queryResults,
  }
}

function renderMarkdown(report) {
  const lines = [
    `# AEO Benchmark Report`,
    '',
    `Generated: ${report.generatedAt}`,
    `API base: ${report.apiBase}`,
    '',
  ]

  for (const site of report.sites) {
    lines.push(`## ${site.name}`)
    if (site.category) lines.push(`Category: ${site.category}`)
    lines.push(`URL: ${site.normalizedUrl || site.url}`)
    if (site.error) {
      lines.push(`Status: failed - ${site.error}`)
      lines.push('')
      continue
    }
    lines.push(`Fetch: ${site.fetch.charCount} chars, ${site.fetch.wordCount} words, HTTP ${site.fetch.accessStatus}`)
    lines.push(`Baseline: overall ${site.baseline.overallScore}, content ${site.baseline.contentScore}, GEU ${site.baseline.geuScore}, LLM ${site.baseline.llmContentScore}`)
    if (site.baseline.modelErrors?.length) {
      lines.push(`Baseline model errors: ${site.baseline.modelErrors.length}`)
    }
    lines.push('')
    lines.push(`| Query | Query Score | Citation | Est. After Fix | Domain Rank | Competitor | Top Fix | Models |`)
    lines.push(`| --- | ---: | ---: | ---: | --- | --- | --- | --- |`)
    for (const query of site.queries) {
      lines.push(`| ${query.query.replace(/\|/g, '/')} | ${query.queryScore ?? '--'} | ${query.citationReadiness ?? '--'} | ${query.estimatedAfterFix ?? '--'} | ${query.domainRank ?? 'not found'} | ${query.competitorStatus} | ${(query.fix?.fix || '').replace(/\|/g, '/')} | ${query.modelAgreement.replace(/\|/g, '/')} |`)
    }
    const modelErrors = site.queries.flatMap(query => query.modelErrors || [])
    if (modelErrors.length) {
      lines.push('')
      lines.push(`<details><summary>Model errors (${modelErrors.length})</summary>`)
      lines.push('')
      modelErrors.slice(0, 12).forEach(error => lines.push(`- ${error.replace(/\n/g, ' ')}`))
      if (modelErrors.length > 12) lines.push(`- ...and ${modelErrors.length - 12} more.`)
      lines.push('')
      lines.push(`</details>`)
    }
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

async function main() {
  await fetchJson(`${API_BASE}/health`)
  const report = {
    generatedAt: new Date().toISOString(),
    apiBase: API_BASE,
    queryLimit: QUERY_LIMIT,
    sites: [],
  }

  for (const site of BENCHMARK_SITES) {
    console.log(`Analyzing ${site.name}...`)
    try {
      report.sites.push(await analyzeSite(site))
    } catch (err) {
      report.sites.push({
        name: site.name,
        url: site.url,
        error: err.message || 'Unknown benchmark error',
      })
    }
  }

  await fs.mkdir(outputDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const jsonPath = path.join(outputDir, `aeo-benchmark-${stamp}.json`)
  const mdPath = path.join(outputDir, `aeo-benchmark-${stamp}.md`)
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  await fs.writeFile(mdPath, renderMarkdown(report))

  console.log(`Benchmark JSON: ${jsonPath}`)
  console.log(`Benchmark report: ${mdPath}`)
}

main().catch(err => {
  console.error(err.message || err)
  process.exit(1)
})
