import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'

function createJsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => data,
    text: async () => JSON.stringify(data),
  }
}

const BASELINE_RESPONSE = {
  contentScore: 70,
  geuScore: 65,
  llmContentScore: 72,
  queryScore: null,
  overallScore: 69,
  gapScore: null,
  checks: [{ id: 'c1', label: 'Has heading', passed: true, weight: 10 }],
  geuChecks: [],
  verdicts: [],
  llmContentModels: [{ model: 'TestLLM', llmContentScore: 72, briefReason: 'Solid content.' }],
  llmContentStatus: [],
}

const FETCH_RESPONSE = {
  markdown: '# Test page\n\nThis is content for citation testing.',
  charCount: 52,
  normalizedUrl: 'https://example.com',
  sourceSignals: {},
  intelligence: {
    access: { statusCode: 200, finalUrl: 'https://example.com', canonical: 'https://example.com', indexable: true, robots: { googlebot: 'allowed' }, warnings: [] },
    extraction: { title: 'Test page', h1: 'Test page', wordCount: 8, schemaTypes: [] },
    warnings: [],
  },
}

const QUERY_RESPONSE = {
  contentScore: 70,
  geuScore: 65,
  llmContentScore: 72,
  queryScore: 58,
  overallScore: 66,
  gapScore: 12,
  checks: [{ id: 'c1', label: 'Has heading', passed: true, weight: 10 }],
  geuChecks: [],
  verdicts: [{ model: 'TestLLM', queryMatchScore: 58, verdict: 'Partial answer found.', failureMode: null }],
  llmContentModels: [],
  llmContentStatus: [],
  intelligence: {
    retrieval: {
      retrievalScore: 62,
      topChunks: [{ chunkId: 'c1', section: 'Intro', text: 'Content text here.', similarity: 0.72, position: 0.1, wordCount: 3, directAnswer: false }],
    },
  },
}

describe('App shell', () => {
  it('renders the focus gate with the wordmark and URL input on first load', () => {
    render(<App />)

    expect(screen.getByText('Test AI citation readiness.')).toBeInTheDocument()
    expect(screen.getByText('Crest.ai · AI Visibility Lab')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/example.com/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Fetch Page/i })).toBeInTheDocument()
  })

  it('exposes the theme toggle in the topbar', () => {
    render(<App />)

    expect(screen.getByLabelText(/Switch to (light|dark) theme/)).toBeInTheDocument()
  })

  it('disables New test until a page is fetched', () => {
    render(<App />)

    const newTest = screen.getByRole('button', { name: /New test/i })
    expect(newTest).toBeDisabled()
  })
})

describe('App workflow integration', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('EventSource', undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetch → baseline → query → diagnostics unlock', async () => {
    fetch
      .mockResolvedValueOnce(createJsonResponse(FETCH_RESPONSE))
      .mockResolvedValueOnce(createJsonResponse(BASELINE_RESPONSE))

    render(<App />)

    fireEvent.change(screen.getByPlaceholderText(/example.com/), {
      target: { value: 'example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Fetch Page/i }))

    // Baseline complete — RunHeader shows "Add target query" (query is empty),
    // so only one "Run query test" button exists in Overview at this point.
    const initialRunBtn = await screen.findByRole('button', { name: /Run query test/i })
    expect(initialRunBtn).toBeDisabled()

    // Typing a query makes RunHeader also show "Run query test".
    // Pick the last matching button, which is the Overview analyze button.
    fireEvent.change(screen.getByPlaceholderText(/e\.g\./i), {
      target: { value: 'what is this page about?' },
    })
    const runBtns = screen.getAllByRole('button', { name: /Run query test/i })
    const analyzeBtn = runBtns[runBtns.length - 1]
    expect(analyzeBtn).not.toBeDisabled()

    fetch.mockResolvedValueOnce(createJsonResponse(QUERY_RESPONSE))
    fireEvent.click(analyzeBtn)

    await screen.findByRole('button', { name: /Re-run query/i })
    expect(screen.queryByPlaceholderText(/e\.g\./i)).not.toBeInTheDocument()
  })

  it('Enter key in initial query input is gated by baseline/query conditions', async () => {
    fetch
      .mockResolvedValueOnce(createJsonResponse(FETCH_RESPONSE))
      .mockResolvedValueOnce(createJsonResponse(BASELINE_RESPONSE))

    render(<App />)

    fireEvent.change(screen.getByPlaceholderText(/example.com/), {
      target: { value: 'example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Fetch Page/i }))

    // Wait until baseline has loaded (one "Run query test" button, still disabled).
    await screen.findByRole('button', { name: /Run query test/i })

    const queryInput = screen.getByPlaceholderText(/e\.g\./i)

    // Empty query — Enter must not trigger analyze (still 2 calls total).
    fireEvent.keyDown(queryInput, { key: 'Enter' })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))

    // Non-empty query — Enter should trigger analyze.
    fireEvent.change(queryInput, { target: { value: 'test query' } })
    fetch.mockResolvedValueOnce(createJsonResponse(QUERY_RESPONSE))
    fireEvent.keyDown(queryInput, { key: 'Enter' })

    await screen.findByRole('button', { name: /Re-run query/i })
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('shows an error message when baseline analysis fails', async () => {
    fetch
      .mockResolvedValueOnce(createJsonResponse(FETCH_RESPONSE))
      .mockResolvedValueOnce(createJsonResponse({ error: 'Service unavailable' }, 503))

    render(<App />)

    fireEvent.change(screen.getByPlaceholderText(/example.com/), {
      target: { value: 'example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Fetch Page/i }))

    await screen.findByText(/baseline analysis failed/i)
    expect(screen.getByRole('button', { name: /Retry baseline/i })).toBeInTheDocument()
  })
})
