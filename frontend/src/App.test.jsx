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
    { model: 'Llama 3.3', llmContentScore: 64, briefReason: 'Direct answer path is solid.' },
    { model: 'Nemotron 120B', llmContentScore: 68, briefReason: 'The structure is easy to extract.' },
  ],
  llmContentStatus: [
    { model: 'Llama 3.3', status: 'ok' },
    { model: 'Nemotron 120B', status: 'ok' },
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

  it('streams fetch content and shows the baseline LLM score readout', async () => {
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

    await screen.findByText('LLM Score')
    expect(screen.getByText('Model baseline')).toBeInTheDocument()
    expect(screen.getByText('LLM content readout')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://example.com/article')).toBeInTheDocument()
    expect(screen.getAllByText('Checks breakdown')).toHaveLength(1)

    const hero = screen.getByText('Overall AEO Score').closest('.overall-score-hero')
    expect(hero).not.toBeNull()
    expect(within(hero).getByText('Checks breakdown')).toBeInTheDocument()

    const analyzeBody = JSON.parse(fetch.mock.calls[0][1].body)
    expect(analyzeBody.sourceSignals.llmsTxt.present).toBe(true)
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

    await screen.findByText('LLM Score')
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

  it('preserves the baseline LLM score during query re-score and uses content-query gap semantics', async () => {
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
          { model: 'Llama 3.3', queryMatchScore: 48, verdict: 'Useful but not direct enough.', topGap: 'Needs a tighter opening answer.', suggestedFix: 'Lead with the answer in sentence one.' },
          { model: 'Nemotron 120B', queryMatchScore: 52, verdict: 'Reasonably aligned for the query.', topGap: 'Missing sharper comparison cues.', suggestedFix: 'Add a short answer-first comparison block.' },
        ],
        modelStatus: [
          { model: 'Llama 3.3', status: 'ok' },
          { model: 'Nemotron 120B', status: 'ok' },
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

    await screen.findByText('LLM Score')
    expect(screen.getByText('Unlock side-by-side fixes from both models.')).toBeInTheDocument()

    const tooltipTrigger = screen.getByRole('button', { name: 'What does GEU mean?' })
    fireEvent.focus(tooltipTrigger)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Generative Engine Usability')

    fireEvent.change(screen.getByPlaceholderText('e.g. what is the best CRM for small business?'), {
      target: { value: 'best ai crm' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Re-Score with Query' }))

    await screen.findByText('Citation pipeline diagnosis')
    fireEvent.click(screen.getByRole('button', { name: 'Score' }))
    await screen.findByText('Model verdicts')
    expect(screen.getAllByText('Content-Query Gap')).toHaveLength(2)
    expect(screen.getByText('LLM content readout')).toBeInTheDocument()
    expect(screen.getByText('Direct answer path is solid.')).toBeInTheDocument()
    expect(screen.queryByText('Unlock side-by-side fixes from both models.')).not.toBeInTheDocument()

    const analyzeBody = JSON.parse(fetch.mock.calls[1][1].body)
    expect(analyzeBody.baselineLlmContentScore).toBe(66)
    expect(analyzeBody.sourceUrl).toBe('https://example.com/article')

    await waitFor(() => {
      expect(screen.getByText('High gap - direct answer quality trails the baseline content signals')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /Send suggested fix from/ })[0])
    expect(screen.getByDisplayValue(/Goal: improve the page for the query "best ai crm"/)).toBeInTheDocument()
  })

  it('locks Intelligence diagnostics until a target query is scored', async () => {
    fetch.mockResolvedValueOnce(createJsonResponse(baselinePayload))

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Intelligence' }))
    expect(screen.getByText('Fetch a page to inspect the citation pipeline.')).toBeInTheDocument()

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

    await screen.findByText('LLM Score')
    fireEvent.click(screen.getByRole('button', { name: 'Intelligence' }))
    expect(screen.getByText('Run a target query to open the diagnostic timeline')).toBeInTheDocument()
    expect(screen.getByText(/Access and extraction have been collected/)).toBeInTheDocument()
  })

  it('shows retrieval diagnosis, chunk view, and highest-impact fix in Intelligence mode after query scoring', async () => {
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

    await screen.findByText('LLM Score')
    fireEvent.change(screen.getByPlaceholderText('e.g. what is the best CRM for small business?'), {
      target: { value: 'best ai crm' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Re-Score with Query' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Intelligence' }))

    expect(await screen.findByText('Retrieval Fitness')).toBeInTheDocument()
    expect(screen.getByText('The target query maps to an early, usable chunk.')).toBeInTheDocument()
    expect(screen.getByText('Competitive Citation Gap')).toBeInTheDocument()
    expect(screen.getByText('The competitor chunk directly answers the query and includes fresher evidence.')).toBeInTheDocument()
    expect(screen.getAllByText('Best CRM Software for Small Businesses').length).toBeGreaterThan(0)
    expect(screen.getByText('direct answer')).toBeInTheDocument()
    expect(screen.getByText('Add one specific statistic to the top answer block.')).toBeInTheDocument()
    expect(screen.getByText('Chunk View')).toBeInTheDocument()
    expect(screen.getByText('Confidence medium')).toBeInTheDocument()

    const analyzeBody = JSON.parse(fetch.mock.calls[1][1].body)
    expect(analyzeBody.pageIntelligence.access.statusCode).toBe(200)
    expect(analyzeBody.sourceUrl).toBe('https://example.com/article')
  })

  it('renders user-win, disabled, and error states for Competitive Citation Gap', () => {
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

    expect(screen.getByText('You have the stronger top chunk')).toBeInTheDocument()
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
})
