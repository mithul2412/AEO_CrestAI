import { act } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import IntelligencePanel from './components/IntelligencePanel.jsx'

function createJsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: () => 'application/json',
    },
    json: async () => data,
    text: async () => JSON.stringify(data),
  }
}

function buildCheck(id, label, weight, passed, lift = '') {
  return { id, label, weight, passed, lift }
}

class MockEventSource {
  static instances = []

  constructor(url) {
    this.url = url
    this.listeners = new Map()
    this.closed = false
    MockEventSource.instances.push(this)
  }

  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) || []
    listeners.push(listener)
    this.listeners.set(name, listeners)
  }

  emit(name, payload) {
    const listeners = this.listeners.get(name) || []
    listeners.forEach(listener => listener({ data: JSON.stringify(payload) }))
  }

  close() {
    this.closed = true
  }
}

const baselinePayload = {
  contentScore: 70,
  geuScore: 60,
  llmContentScore: 66,
  llmContentModels: [
    { model: 'Qwen 3.6 Plus', llmContentScore: 64, briefReason: 'Direct answer path is solid.' },
    { model: 'Nemotron 120B', llmContentScore: 68, briefReason: 'The structure is easy to extract.' },
    { model: 'GPT OSS 120B', llmContentScore: 66, briefReason: 'The evidence is moderate.' },
  ],
  llmContentStatus: [
    { model: 'Qwen 3.6 Plus', status: 'ok' },
    { model: 'Nemotron 120B', status: 'ok' },
    { model: 'GPT OSS 120B', status: 'ok' },
  ],
  overallScore: 65,
  queryScore: null,
  gapScore: null,
  checks: [
    buildCheck('faq', 'FAQ structure', 20, true, '+11% citation lift'),
    buildCheck('stats', 'Statistics / numbers', 15, true, '+40% avg'),
    buildCheck('schema', 'Structured data / schema', 15, false, '~ impact'),
    buildCheck('llmstxt', 'llms.txt present', 10, false, '~ impact'),
  ],
  geuChecks: [
    buildCheck('standalone', 'Standalone sentences', 30, true, 'AutoGEO'),
    buildCheck('coherent', 'Coherent opening', 20, true, 'AutoGEO'),
  ],
  verdicts: [],
  modelStatus: [],
}

const pageIntelligencePayload = {
  access: {
    statusCode: 200,
    finalUrl: 'https://example.com/article',
    canonical: 'https://example.com/article',
    indexable: true,
    robots: {
      googlebot: 'allowed',
      oaiSearchBot: 'allowed',
      gptBot: 'allowed',
      perplexityBot: 'blocked',
    },
    warnings: ['robots.txt blocks perplexityBot.'],
  },
  extraction: {
    title: 'Best CRM Guide',
    metaDescription: 'A CRM guide for teams',
    h1: 'Best CRM for small business',
    headings: ['Best CRM for small business', 'Pricing'],
    schemaTypes: ['Article'],
    wordCount: 1840,
    warnings: ['No structured pricing table was detected in markdown.'],
  },
}

const queryIntelligencePayload = {
  chunks: [
    {
      chunkId: 'c1',
      section: 'Best CRM for small business',
      position: 0.12,
      text: 'Best CRM for small business is a platform that helps teams manage contacts, pipeline, and follow-up in one workspace.',
      wordCount: 96,
    },
  ],
  retrieval: {
    query: 'best ai crm',
    retrievalScore: 72,
    diagnosis: 'The target query maps to an early, usable chunk.',
    topChunks: [
      {
        chunkId: 'c1',
        section: 'Best CRM for small business',
        position: 0.12,
        text: 'Best CRM for small business is a platform that helps teams manage contacts, pipeline, and follow-up in one workspace.',
        wordCount: 96,
        similarity: 0.82,
        directAnswer: true,
      },
    ],
  },
  answerExtraction: {
    answerScore: 68,
    directAnswerFound: true,
    diagnosis: 'The top chunk contains an extractable answer path.',
  },
  citationReadiness: {
    score: 71,
    summary: 'Strong extraction, but weak evidence. Discovered competitors appear more citation-ready for this query.',
    subscores: {
      accessScore: 88,
      extractionScore: 82,
      retrievalScore: 72,
      answerScore: 68,
      evidenceScore: 42,
      structureScore: 75,
      freshnessScore: 65,
      competitorGapScore: 58,
    },
  },
  competitorIntelligence: {
    status: 'ok',
    discovery: {
      status: 'ok',
      query: 'best ai crm',
      competitors: [
        {
          title: 'Best CRM Software for Small Businesses',
          url: 'https://competitor.com/best-crm',
          snippet: 'Compare CRM software for small businesses.',
          tavilyScore: 0.91,
        },
      ],
    },
    competitors: [
      {
        sourceId: 'competitor-1',
        title: 'Best CRM Software for Small Businesses',
        url: 'https://competitor.com/best-crm',
        snippet: 'Compare CRM software for small businesses.',
        chunkCount: 2,
      },
    ],
    gap: {
      status: 'ok',
      winner: 'competitor',
      winningCompetitor: {
        title: 'Best CRM Software for Small Businesses',
        url: 'https://competitor.com/best-crm',
      },
      scoreDelta: 12,
      failureMode: 'Answer Failure',
      missingAttributes: ['direct answer', 'stronger evidence'],
      whyCompetitorWon: 'The competitor chunk directly answers the query and includes fresher evidence.',
      competitorGapScore: 58,
      userTopChunk: {
        chunkId: 'c1',
        section: 'Best CRM for small business',
        retrievalScore: 72,
        directAnswer: true,
        text: 'Best CRM for small business is a platform that helps teams manage contacts, pipeline, and follow-up in one workspace.',
      },
      competitorTopChunk: {
        chunkId: 'competitor-1-c1',
        section: 'Best CRM Software for Small Businesses',
        retrievalScore: 84,
        directAnswer: true,
        text: 'The best CRM software for small businesses includes contact management, pipeline tracking, pricing clarity, and 2025 proof.',
      },
    },
    failures: [],
  },
  highestImpactFix: {
    failureMode: 'Evidence Failure',
    fix: 'Add one specific statistic to the top answer block.',
    whereToEdit: 'Within the first 200 words.',
    why: 'The page answers the query, but citation confidence is limited by weak proof.',
    exampleCopy: 'Based on 200 customer accounts, teams reduced response time by 31% in 2025.',
    expectedLift: {
      retrievalScore: '+4',
      answerScore: '+8',
    },
    confidence: 'medium',
  },
}

const agenticPayload = {
  profileId: 'profile-example-com',
  slug: 'example-com',
  canonicalProfile: {
    source: {
      sourceUrl: 'https://example.com/article',
      origin: 'https://example.com',
    },
    business: {
      name: 'Example',
      domain: 'example.com',
      description: 'Example helps teams prepare content for AI systems.',
    },
    metadata: {
      updatedAt: '2026-04-28T07:00:00.000Z',
    },
  },
  artifacts: {
    llmsTxt: '# Example\n\n## AI-readable profile\n- http://localhost:3001/agent/example-com',
    llmsFullTxt: '# Example AI-readable Profile\n\nSource URL: https://example.com/article',
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'Organization', name: 'Example' }],
    faqBlock: [{ question: 'What is Example?', answer: 'Example prepares content.', sourceUrl: 'https://example.com/article' }],
    actionMetadata: [{ id: 'action-contact', type: 'contact', label: 'Contact', url: 'https://example.com/contact', status: 'active' }],
    claimSourceMap: [{ claim: 'Example prepares content.', sourceUrl: 'https://example.com/article', sourceText: 'Example prepares content.' }],
    structuredServiceProductData: [{ id: 'service-example', type: 'service', name: 'AI content readiness' }],
    robotsRecommendations: [{ engine: 'ChatGPT', userAgents: ['OAI-SearchBot'], recommendation: 'Allow when policy permits.' }],
    alternateLinkSnippet: '<link rel="alternate" type="application/json" href="http://localhost:3001/agent/example-com.json" title="AI-readable business profile" />',
  },
  hostedProfile: {
    htmlUrl: 'http://localhost:3001/agent/example-com',
    jsonUrl: 'http://localhost:3001/agent/example-com.json',
    markdownUrl: 'http://localhost:3001/agent/example-com.md',
  },
  validation: {
    ok: true,
    approvalRequired: false,
    warnings: [],
    errors: [],
    checks: [
      { id: 'jsonld-array', label: 'JSON-LD is an array', status: 'pass', message: 'jsonLd is an array' },
    ],
  },
  engineReadiness: {
    chatgpt: { score: 86, checks: [{ id: 'jsonld', label: 'JSON-LD exists', passed: true }] },
    perplexity: { score: 82, checks: [] },
    google: { score: 84, checks: [] },
    claude: { score: 80, checks: [] },
  },
  warnings: [],
}

const agenticProfilesPayload = {
  profiles: [
    {
      slug: 'example-com',
      profileId: 'profile-example-com',
      businessName: 'Example',
      domain: 'example.com',
      sourceUrl: 'https://example.com/article',
      updatedAt: '2026-04-28T07:00:00.000Z',
      storedAt: '2026-04-28T07:00:00.000Z',
      version: 1,
      monitoring: {
        lastScannedAt: '2026-04-28T07:30:00.000Z',
        lastChangeDetectedAt: '',
        lastRescanStatus: 'no_changes',
        lastRescanSummary: 'Rescan completed with no profile changes detected.',
      },
      validationOk: true,
    },
  ],
}

const pendingApproval = {
  id: 'apr-example-pricing',
  slug: 'example-com',
  profileId: 'profile-example-com',
  status: 'pending',
  changeEventIds: ['evt-pricing'],
  eventSummaries: [
    {
      id: 'evt-pricing',
      type: 'pricing_changed',
      path: 'claims[pricing]',
      summary: 'pricing_changed at claims[pricing]',
      affected_artifacts: ['hosted_profile', 'json_ld'],
      approval_required: true,
    },
  ],
  affectedArtifacts: ['hosted_profile', 'json_ld'],
  oldValues: [{ eventId: 'evt-pricing', path: 'claims[pricing]', value: 'Pricing starts at $8,000 per month.' }],
  newValues: [{ eventId: 'evt-pricing', path: 'claims[pricing]', value: 'Pricing starts at $12,000 per month.' }],
  createdAt: '2026-04-28T07:45:00.000Z',
  reviewedAt: '',
  reviewerNote: '',
}

const pendingApprovalTwo = {
  ...pendingApproval,
  id: 'apr-example-policy',
  changeEventIds: ['evt-policy'],
  eventSummaries: [
    {
      id: 'evt-policy',
      type: 'policy_changed',
      path: 'policies',
      summary: 'policy_changed at policies',
      affected_artifacts: ['hosted_profile'],
      approval_required: true,
    },
  ],
  affectedArtifacts: ['hosted_profile'],
  oldValues: [{ eventId: 'evt-policy', path: 'policies', value: 'Old refund policy.' }],
  newValues: [{ eventId: 'evt-policy', path: 'policies', value: 'New refund policy.' }],
}

describe('App', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
    vi.stubGlobal('fetch', vi.fn())
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses compact app chrome instead of workflow scroll navigation', () => {
    render(<App />)

    expect(screen.queryByLabelText('Primary workflow')).not.toBeInTheDocument()
    expect(screen.queryByText('Analysis')).not.toBeInTheDocument()
    expect(screen.queryByText('Rewrite Help')).not.toBeInTheDocument()

    const themeButton = screen.getByRole('button', { name: 'Switch to dark theme' })
    expect(themeButton).toBeInTheDocument()
    fireEvent.click(themeButton)
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument()
  })

  it('streams fetch content and shows the executive baseline summary first', async () => {
    fetch.mockResolvedValueOnce(createJsonResponse(baselinePayload))

    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('https://example.com/page-to-analyze'), {
      target: { value: 'example.com/article' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fetch Page' }))

    expect(MockEventSource.instances).toHaveLength(1)
    expect(MockEventSource.instances[0].url).toContain(encodeURIComponent('https://example.com/article'))

    await act(async () => {
      MockEventSource.instances[0].emit('chunk', { chunk: '# Heading\n\nIntro copy' })
      MockEventSource.instances[0].emit('complete', {
        markdown: '# Heading\n\nIntro copy',
        charCount: 21,
        normalizedUrl: 'https://example.com/article',
        sourceSignals: {
          llmsTxt: { present: true, url: 'https://example.com/llms.txt' },
          llmsFullTxt: { present: false, url: null },
        },
      })
    })

    expect((await screen.findAllByText('Ready with risks')).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Diagnostic workspace status')).toBeInTheDocument()
    expect(screen.getByText('Current test is loaded')).toBeInTheDocument()
    expect(screen.getByText('Page fetched')).toBeInTheDocument()
    expect(screen.getByText('Baseline ready')).toBeInTheDocument()
    expect(screen.getByText('Query waiting')).toBeInTheDocument()
    expect(within(screen.getByLabelText('Diagnostic workspace status')).getByRole('button', { name: 'Run Query Test' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Primary workflow')).not.toBeInTheDocument()
    expect(screen.queryByText('Choose the lens for this step')).not.toBeInTheDocument()
    expect(screen.getByText('What happened')).toBeInTheDocument()
    expect(screen.getByText('What to do next')).toBeInTheDocument()
    expect(screen.getByText('Technical score details')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://example.com/article')).toBeInTheDocument()
    expect(screen.queryByText('Checks breakdown')).not.toBeInTheDocument()

    const hero = screen.getByText('Baseline Readiness').closest('.overall-score-hero')
    expect(hero).not.toBeNull()
    expect(within(hero).getByText('Top blocker')).toBeInTheDocument()

    const analyzeBody = JSON.parse(fetch.mock.calls[0][1].body)
    expect(analyzeBody.sourceSignals.llmsTxt.present).toBe(true)
  })

  it('shows the agentic panel after baseline analysis and generates artifacts', async () => {
    fetch
      .mockResolvedValueOnce(createJsonResponse(baselinePayload))
      .mockResolvedValueOnce(createJsonResponse(agenticPayload))
      .mockResolvedValueOnce(createJsonResponse(agenticProfilesPayload))
      .mockResolvedValueOnce(createJsonResponse({ approvals: [] }))

    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('https://example.com/page-to-analyze'), {
      target: { value: 'https://example.com/article' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fetch Page' }))

    await act(async () => {
      MockEventSource.instances[0].emit('complete', {
        markdown: '# Example\n\nExample helps teams prepare content for AI systems.',
        charCount: 60,
        normalizedUrl: 'https://example.com/article',
        sourceSignals: {
          sourceUrl: 'https://example.com/article',
          origin: 'https://example.com',
          llmsTxt: { present: false, url: null },
          llmsFullTxt: { present: false, url: null },
        },
      })
    })

    await screen.findByText('Generate the AI-readable infrastructure layer')
    expect(screen.getByText('Overall AEO Score')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Generate Agentic AI Readiness Layer' }))

    await screen.findByRole('tab', { name: 'llms.txt' })
    expect(fetch.mock.calls[1][0]).toBe('/agentic/generate')
    const requestBody = JSON.parse(fetch.mock.calls[1][1].body)
    expect(requestBody).toMatchObject({
      url: 'https://example.com/article',
      markdown: '# Example\n\nExample helps teams prepare content for AI systems.',
      analysis: expect.objectContaining({ overallScore: 65 }),
      sourceSignals: expect.objectContaining({ origin: 'https://example.com' }),
    })

    fireEvent.click(screen.getByRole('tab', { name: 'llms.txt' }))
    expect(screen.getByText(/# Example/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Hosted links' }))
    expect(screen.getByText('http://localhost:3001/agent/example-com.json')).toBeInTheDocument()
    expect(await screen.findByTestId('agentic-monitoring-panel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rescan stored source URL' })).toBeInTheDocument()
  })

  it('renders rescan no-op result inside the agentic panel', async () => {
    fetch
      .mockResolvedValueOnce(createJsonResponse(baselinePayload))
      .mockResolvedValueOnce(createJsonResponse(agenticPayload))
      .mockResolvedValueOnce(createJsonResponse(agenticProfilesPayload))
      .mockResolvedValueOnce(createJsonResponse({ approvals: [] }))
      .mockResolvedValueOnce(createJsonResponse({
        status: 'no_changes',
        changed: false,
        slug: 'example-com',
        changes: [],
        affectedArtifacts: [],
        validation: { ok: true },
        monitoring: {
          lastScannedAt: '2026-04-28T08:00:00.000Z',
          lastRescanStatus: 'no_changes',
          lastRescanSummary: 'Rescan completed with no profile changes detected.',
        },
      }))
      .mockResolvedValueOnce(createJsonResponse(agenticProfilesPayload))
      .mockResolvedValueOnce(createJsonResponse({ approvals: [] }))

    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('https://example.com/page-to-analyze'), {
      target: { value: 'https://example.com/article' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fetch Page' }))

    await act(async () => {
      MockEventSource.instances[0].emit('complete', {
        markdown: '# Example\n\nExample helps teams prepare content for AI systems.',
        charCount: 60,
        normalizedUrl: 'https://example.com/article',
        sourceSignals: {
          sourceUrl: 'https://example.com/article',
          origin: 'https://example.com',
          llmsTxt: { present: false, url: null },
          llmsFullTxt: { present: false, url: null },
        },
      })
    })

    await screen.findByText('Generate the AI-readable infrastructure layer')
    fireEvent.click(screen.getByRole('button', { name: 'Generate Agentic AI Readiness Layer' }))
    await screen.findByTestId('agentic-monitoring-panel')

    fireEvent.click(screen.getByRole('button', { name: 'Rescan stored source URL' }))

    expect(await screen.findByText('Rescan result')).toBeInTheDocument()
    expect(screen.getAllByText('no changes').length).toBeGreaterThan(0)
    expect(screen.getByText('No changes detected.')).toBeInTheDocument()
    expect(fetch.mock.calls.some(call => call[0] === '/agentic/rescan/example-com')).toBe(true)
  })

  it('renders pending approvals with old and new values', async () => {
    fetch
      .mockResolvedValueOnce(createJsonResponse(baselinePayload))
      .mockResolvedValueOnce(createJsonResponse(agenticPayload))
      .mockResolvedValueOnce(createJsonResponse(agenticProfilesPayload))
      .mockResolvedValueOnce(createJsonResponse({ approvals: [pendingApproval] }))

    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('https://example.com/page-to-analyze'), {
      target: { value: 'https://example.com/article' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fetch Page' }))

    await act(async () => {
      MockEventSource.instances[0].emit('complete', {
        markdown: '# Example\n\nExample helps teams prepare content for AI systems.',
        charCount: 60,
        normalizedUrl: 'https://example.com/article',
        sourceSignals: {
          sourceUrl: 'https://example.com/article',
          origin: 'https://example.com',
        },
      })
    })

    await screen.findByText('Generate the AI-readable infrastructure layer')
    fireEvent.click(screen.getByRole('button', { name: 'Generate Agentic AI Readiness Layer' }))

    expect(await screen.findByText('Pending approvals')).toBeInTheDocument()
    expect(screen.getByText('pricing changed')).toBeInTheDocument()
    expect(screen.getByText('Pricing starts at $8,000 per month.')).toBeInTheDocument()
    expect(screen.getByText('Pricing starts at $12,000 per month.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  it('approve and reject actions call the approval backend helpers', async () => {
    fetch
      .mockResolvedValueOnce(createJsonResponse(baselinePayload))
      .mockResolvedValueOnce(createJsonResponse(agenticPayload))
      .mockResolvedValueOnce(createJsonResponse(agenticProfilesPayload))
      .mockResolvedValueOnce(createJsonResponse({ approvals: [pendingApproval, pendingApprovalTwo] }))
      .mockResolvedValueOnce(createJsonResponse({
        approval: { ...pendingApproval, status: 'approved', reviewedAt: '2026-04-28T08:05:00.000Z' },
        publishedProfile: {
          profile: {
            ...agenticPayload.canonicalProfile,
            metadata: { updatedAt: '2026-04-28T08:05:00.000Z' },
          },
          artifacts: agenticPayload.artifacts,
          validation: agenticPayload.validation,
          engineReadiness: agenticPayload.engineReadiness,
          hostedProfile: agenticPayload.hostedProfile,
        },
      }))
      .mockResolvedValueOnce(createJsonResponse(agenticProfilesPayload))
      .mockResolvedValueOnce(createJsonResponse({ approvals: [pendingApprovalTwo] }))
      .mockResolvedValueOnce(createJsonResponse({
        approval: { ...pendingApprovalTwo, status: 'rejected', reviewedAt: '2026-04-28T08:06:00.000Z' },
        publishedProfile: null,
      }))
      .mockResolvedValueOnce(createJsonResponse(agenticProfilesPayload))
      .mockResolvedValueOnce(createJsonResponse({ approvals: [] }))

    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('https://example.com/page-to-analyze'), {
      target: { value: 'https://example.com/article' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fetch Page' }))

    await act(async () => {
      MockEventSource.instances[0].emit('complete', {
        markdown: '# Example\n\nExample helps teams prepare content for AI systems.',
        charCount: 60,
        normalizedUrl: 'https://example.com/article',
        sourceSignals: {
          sourceUrl: 'https://example.com/article',
          origin: 'https://example.com',
        },
      })
    })

    await screen.findByText('Generate the AI-readable infrastructure layer')
    fireEvent.click(screen.getByRole('button', { name: 'Generate Agentic AI Readiness Layer' }))

    await screen.findByText('pricing changed')
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0])

    await waitFor(() => {
      expect(fetch.mock.calls.some(call => call[0] === '/agentic/approvals/apr-example-pricing/approve')).toBe(true)
    })

    await screen.findByText('policy changed')
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))

    await waitFor(() => {
      expect(fetch.mock.calls.some(call => call[0] === '/agentic/approvals/apr-example-policy/reject')).toBe(true)
    })
    expect(screen.getByRole('tab', { name: 'llms.txt' })).toBeInTheDocument()
  })

  it('keeps agentic generation errors inside the panel', async () => {
    fetch
      .mockResolvedValueOnce(createJsonResponse(baselinePayload))
      .mockResolvedValueOnce(createJsonResponse({ error: 'Agentic layer is disabled' }, 503))

    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('https://example.com/page-to-analyze'), {
      target: { value: 'https://example.com/article' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fetch Page' }))

    await act(async () => {
      MockEventSource.instances[0].emit('complete', {
        markdown: '# Example\n\nExample helps teams prepare content for AI systems.',
        charCount: 60,
        normalizedUrl: 'https://example.com/article',
        sourceSignals: {},
      })
    })

    await screen.findByText('Generate the AI-readable infrastructure layer')
    fireEvent.click(screen.getByRole('button', { name: 'Generate Agentic AI Readiness Layer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Agentic generation failed: Agentic layer is disabled')
    expect(screen.getByText('Overall AEO Score')).toBeInTheDocument()
  })

  it('shows the baseline analysis error instead of an empty score panel when analyze fails', async () => {
    fetch.mockResolvedValueOnce(createJsonResponse({ error: 'Analyze failed upstream' }, 502))

    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('https://example.com/page-to-analyze'), {
      target: { value: 'example.com/article' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fetch Page' }))

    await act(async () => {
      MockEventSource.instances[0].emit('complete', {
        markdown: '# Heading\n\nIntro copy',
        charCount: 21,
        sourceSignals: {},
      })
    })

    expect(await screen.findByText('Baseline analysis failed: Analyze failed upstream')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry baseline scoring' })).toBeInTheDocument()
  })

  it('shows advanced optimization opportunities, query suggestions, and a locked preview before query scoring', async () => {
    fetch.mockResolvedValueOnce(createJsonResponse(baselinePayload))

    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('https://example.com/page-to-analyze'), {
      target: { value: 'example.com/article' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fetch Page' }))

    await act(async () => {
      MockEventSource.instances[0].emit('complete', {
        markdown: '# Heading\n\nIntro copy',
        charCount: 21,
        sourceSignals: {
          llmsTxt: { present: false, url: null },
          llmsFullTxt: { present: false, url: null },
        },
      })
    })

    expect((await screen.findAllByText('Ready with risks')).length).toBeGreaterThan(0)
    expect(screen.getByText('3 opportunities - +25 pts potential')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show optimizations' }))
    expect(screen.getByText('Unlock +15 pts - Add structured data')).toBeInTheDocument()
    expect(screen.getByText('Unlock +10 pts - Add llms.txt')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'See template' })[0])
    expect(screen.getByText('llms.txt starter template')).toBeInTheDocument()
    expect(screen.getByText(/Add a query to preview direct answer quality/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a query to unlock' })).toBeInTheDocument()

    const suggestion = screen.getByRole('button', { name: 'What is Example pricing?' })
    fireEvent.click(suggestion)
    expect(screen.getByDisplayValue('What is Example pricing?')).toBeInTheDocument()
  })

  it('preserves the baseline model score during query re-score and uses plain answer-gap semantics', async () => {
    fetch
      .mockResolvedValueOnce(createJsonResponse(baselinePayload))
      .mockResolvedValueOnce(createJsonResponse({
        contentScore: 70,
        geuScore: 60,
        queryScore: 50,
        gapScore: 20,
        checks: baselinePayload.checks,
        geuChecks: baselinePayload.geuChecks,
        verdicts: [
          { model: 'Qwen 3.6 Plus', queryMatchScore: 48, failureMode: 'Answer Failure', verdict: 'Useful but not direct enough.', topGap: 'Needs a tighter opening answer.', suggestedFix: 'Lead with the answer in sentence one.' },
          { model: 'Nemotron 120B', queryMatchScore: 52, failureMode: 'Answer Failure', verdict: 'Reasonably aligned for the query.', topGap: 'Missing sharper comparison cues.', suggestedFix: 'Add a short answer-first comparison block.' },
          { model: 'GPT OSS 120B', queryMatchScore: 50, failureMode: 'Answer Failure', verdict: 'Related but needs better proof.', topGap: 'Missing attribution.', suggestedFix: 'Add a named source.' },
        ],
        modelStatus: [
          { model: 'Qwen 3.6 Plus', status: 'ok' },
          { model: 'Nemotron 120B', status: 'ok' },
          { model: 'GPT OSS 120B', status: 'ok' },
        ],
      }))

    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('https://example.com/page-to-analyze'), {
      target: { value: 'https://example.com/article' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fetch Page' }))

    await act(async () => {
      MockEventSource.instances[0].emit('complete', {
        markdown: '# Heading\n\nIntro copy',
        charCount: 21,
        sourceSignals: {
          llmsTxt: { present: true, url: 'https://example.com/llms.txt' },
          llmsFullTxt: { present: false, url: null },
        },
      })
    })

    expect((await screen.findAllByText('Ready with risks')).length).toBeGreaterThan(0)
    expect(screen.getByText('Add a query to preview direct answer quality.')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('e.g. what is the best CRM for small business?'), {
      target: { value: 'best ai crm' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Re-Score with Query' }))

    await screen.findByText('The answer path is weak')
    expect(screen.getByLabelText('Diagnostic workspace status')).toBeInTheDocument()
    expect(screen.getByText('Citation diagnosis is ready')).toBeInTheDocument()
    expect(screen.queryByText('Score 67')).not.toBeInTheDocument()
    expect(screen.queryByText('Gap +20')).not.toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Workspace view' })).getByRole('button', { name: 'Summary' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Workspace view' })).getByRole('button', { name: 'Diagnostics' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Analysis workspace lenses')).not.toBeInTheDocument()
    expect(screen.queryByText('Verdict first. Evidence when needed.')).not.toBeInTheDocument()
    expect(screen.getAllByText('Answer gap').length).toBeGreaterThan(0)
    expect(screen.getByText('Technical Diagnostics')).toBeInTheDocument()
    expect(screen.queryByText('Useful but not direct enough.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Technical Diagnostics/i }))
    expect(screen.getByText('Useful but not direct enough.')).toBeInTheDocument()
    expect(screen.queryByText('Add a query to preview direct answer quality.')).not.toBeInTheDocument()

    const analyzeBody = JSON.parse(fetch.mock.calls[1][1].body)
    expect(analyzeBody.baselineLlmContentScore).toBe(66)
    expect(analyzeBody.sourceUrl).toBe('https://example.com/article')

    await waitFor(() => {
      expect(screen.getAllByText(/Large answer gap/).length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Send to Rewrite Help' }))
    expect(screen.getByDisplayValue(/Suggested fix: Lead with the answer in sentence one./)).toBeInTheDocument()
  })

  it('locks Diagnostics until a target query is scored', async () => {
    fetch.mockResolvedValueOnce(createJsonResponse(baselinePayload))

    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('https://example.com/page-to-analyze'), {
      target: { value: 'example.com/article' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fetch Page' }))

    await act(async () => {
      MockEventSource.instances[0].emit('complete', {
        markdown: '# Best CRM for small business\n\nReadable AI content.',
        charCount: 52,
        normalizedUrl: 'https://example.com/article',
        sourceSignals: {
          llmsTxt: { present: true, url: 'https://example.com/llms.txt' },
          llmsFullTxt: { present: false, url: null },
        },
        intelligence: pageIntelligencePayload,
      })
    })

    expect((await screen.findAllByText('Ready with risks')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Diagnostics' }))
    expect(screen.getByText('Run a target query to open the diagnostic timeline')).toBeInTheDocument()
    expect(screen.getByText(/Access and extraction have been collected/)).toBeInTheDocument()
  })

  it('shows retrieval diagnosis, chunk view, and highest-impact fix in Diagnostics mode after query scoring', async () => {
    fetch
      .mockResolvedValueOnce(createJsonResponse(baselinePayload))
      .mockResolvedValueOnce(createJsonResponse({
        contentScore: 70,
        geuScore: 60,
        queryScore: 72,
        gapScore: -2,
        checks: baselinePayload.checks,
        geuChecks: baselinePayload.geuChecks,
        verdicts: [],
        modelStatus: [],
        intelligence: queryIntelligencePayload,
      }))

    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('https://example.com/page-to-analyze'), {
      target: { value: 'https://example.com/article' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fetch Page' }))

    await act(async () => {
      MockEventSource.instances[0].emit('complete', {
        markdown: '# Best CRM for small business\n\nReadable AI content.',
        charCount: 52,
        sourceSignals: {
          llmsTxt: { present: true, url: 'https://example.com/llms.txt' },
          llmsFullTxt: { present: false, url: null },
        },
        intelligence: pageIntelligencePayload,
      })
    })

    expect((await screen.findAllByText('Ready with risks')).length).toBeGreaterThan(0)
    fireEvent.change(screen.getByPlaceholderText('e.g. what is the best CRM for small business?'), {
      target: { value: 'best ai crm' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Re-Score with Query' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Diagnostics' }))

    expect(await screen.findByText('Best Match')).toBeInTheDocument()
    expect(screen.getByText('The target query maps to an early, usable chunk.')).toBeInTheDocument()
    expect(screen.getByText('Competitor Position')).toBeInTheDocument()
    expect(screen.getByText('The competitor chunk directly answers the query and includes fresher evidence.')).toBeInTheDocument()
    expect(screen.getByText('direct answer')).toBeInTheDocument()
    expect(screen.getByText('Add one specific statistic to the top answer block.')).toBeInTheDocument()
    expect(screen.getByText('Evidence Chunks')).toBeInTheDocument()
    expect(screen.getByText('Fix certainty medium')).toBeInTheDocument()

    const analyzeBody = JSON.parse(fetch.mock.calls[1][1].body)
    expect(analyzeBody.pageIntelligence.access.statusCode).toBe(200)
    expect(analyzeBody.sourceUrl).toBe('https://example.com/article')
  })

  it('renders user-win, disabled, and error states for Competitor Gap', () => {
    const baseResults = {
      intelligence: {
        citationReadiness: {
          score: 82,
          summary: 'Competitive gap is favorable.',
          subscores: {},
        },
      },
    }

    const { rerender } = render(
      <IntelligencePanel
        markdown="# Best CRM\n\nReadable content."
        pageIntelligence={pageIntelligencePayload}
        results={{
          intelligence: {
            ...baseResults.intelligence,
            competitorIntelligence: {
              status: 'ok',
              competitors: [],
              gap: {
                status: 'ok',
                winner: 'user',
                scoreDelta: -8,
                whyCompetitorWon: 'Your top chunk is more citation-ready than the discovered competitor chunks for this query.',
                competitorGapScore: 100,
                missingAttributes: [],
                userTopChunk: {
                  chunkId: 'c1',
                  section: 'Opening',
                  retrievalScore: 88,
                  directAnswer: true,
                  text: 'Your page directly answers the query.',
                },
                competitorTopChunk: {
                  chunkId: 'competitor-1-c1',
                  section: 'Competitor',
                  retrievalScore: 80,
                  directAnswer: false,
                  text: 'Competitor context.',
                },
              },
              failures: [],
            },
          },
        }}
        query="best ai crm"
      />
    )

    expect(screen.getByText('Your page has the stronger top answer path')).toBeInTheDocument()
    expect(screen.getByText('Your top chunk is more citation-ready than the discovered competitor chunks for this query.')).toBeInTheDocument()

    rerender(
      <IntelligencePanel
        markdown="# Best CRM\n\nReadable content."
        pageIntelligence={pageIntelligencePayload}
        results={{
          intelligence: {
            ...baseResults.intelligence,
            competitorIntelligence: {
              status: 'disabled',
              discovery: { reason: 'TAVILY_API_KEY is missing' },
              competitors: [],
              gap: null,
              failures: [],
            },
          },
        }}
        query="best ai crm"
      />
    )

    expect(screen.getByText('Tavily is not configured.')).toBeInTheDocument()

    rerender(
      <IntelligencePanel
        markdown="# Best CRM\n\nReadable content."
        pageIntelligence={pageIntelligencePayload}
        results={{
          intelligence: {
            ...baseResults.intelligence,
            competitorIntelligence: {
              status: 'error',
              error: 'Tavily request failed',
              competitors: [],
              gap: null,
              failures: [],
            },
          },
        }}
        query="best ai crm"
      />
    )

    expect(screen.getByText('Competitor discovery failed.')).toBeInTheDocument()
    expect(screen.getByText('Tavily request failed')).toBeInTheDocument()
  })

  it('explains blocked access and Access Denied readability in plain language', () => {
    render(
      <IntelligencePanel
        markdown="Access Denied\n\nRequest blocked."
        pageIntelligence={{
          access: {
            statusCode: 403,
            finalUrl: 'https://www.xfinity.com/',
            canonical: 'https://www.xfinity.com/',
            indexable: false,
            robots: {
              googlebot: 'allowed',
              oaiSearchBot: 'allowed',
              gptBot: 'allowed',
              perplexityBot: 'allowed',
            },
            warnings: [],
          },
          extraction: {
            title: 'Access Denied',
            h1: 'Access Denied',
            schemaTypes: [],
            wordCount: 1188,
            warnings: [],
          },
        }}
        results={{ intelligence: {} }}
        query=""
      />
    )

    expect(screen.getByText('AI readers may be blocked')).toBeInTheDocument()
    expect(screen.getByText(/automated readers are seeing an access-control page/)).toBeInTheDocument()
    expect(screen.getByText('Search eligibility')).toBeInTheDocument()
    expect(screen.getByText('AI is seeing a blocked page')).toBeInTheDocument()
    expect(screen.getByText(/analyzing the blocked response rather than the customer-facing page/)).toBeInTheDocument()
  })
})
