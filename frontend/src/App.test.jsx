import { act } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'

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

    await screen.findByText('Model verdicts')
    expect(screen.getAllByText('Content-Query Gap')).toHaveLength(2)
    expect(screen.getByText('LLM content readout')).toBeInTheDocument()
    expect(screen.getByText('Direct answer path is solid.')).toBeInTheDocument()
    expect(screen.queryByText('Unlock side-by-side fixes from both models.')).not.toBeInTheDocument()

    const analyzeBody = JSON.parse(fetch.mock.calls[1][1].body)
    expect(analyzeBody.baselineLlmContentScore).toBe(66)

    await waitFor(() => {
      expect(screen.getByText('High gap - direct answer quality trails the baseline content signals')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /Send suggested fix from/ })[0])
    expect(screen.getByDisplayValue(/Goal: improve the page for the query "best ai crm"/)).toBeInTheDocument()
  })
})
