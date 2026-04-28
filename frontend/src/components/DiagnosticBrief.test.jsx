import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DiagnosticBrief from './DiagnosticBrief.jsx'

const pageIntelligence = {
  access: {
    statusCode: 200,
    finalUrl: 'https://example.com/article',
    indexable: true,
    warnings: [],
  },
  extraction: {
    title: 'Best CRM Guide',
    h1: 'Best CRM for small business',
    schemaTypes: ['Article'],
    wordCount: 1200,
    warnings: [],
  },
}

const results = {
  contentScore: 74,
  geuScore: 64,
  llmContentScore: 68,
  queryScore: 52,
  gapScore: 22,
  verdicts: [
    {
      model: 'Llama 3.3',
      queryMatchScore: 51,
      failureMode: 'Answer Failure',
      verdict: 'Useful but not direct.',
      topGap: 'Opening answer is too indirect.',
      suggestedFix: 'Lead with the answer.',
    },
    {
      model: 'Nemotron 120B',
      queryMatchScore: 53,
      failureMode: 'Answer Failure',
      verdict: 'Related but weak.',
      topGap: 'Needs evidence.',
      suggestedFix: 'Add a proof point.',
    },
  ],
  modelStatus: [
    { model: 'Llama 3.3', status: 'ok' },
    { model: 'Nemotron 120B', status: 'ok' },
  ],
  intelligence: {
    highestImpactFix: {
      failureMode: 'Evidence Failure',
      fix: 'Add one specific statistic to the top answer block.',
      why: 'The page answers the query, but proof is weak.',
      whereToEdit: 'Opening section.',
      exampleCopy: 'Teams reduced response time by 31% in 2025.',
    },
    competitorIntelligence: {
      status: 'ok',
      competitors: [
        { title: 'A', url: 'https://a.example', chunkCount: 1 },
        { title: 'B', url: 'https://b.example', chunkCount: 1 },
      ],
      gap: {
        status: 'ok',
        winner: 'competitor',
        scoreDelta: 12,
        whyCompetitorWon: 'The competitor answers earlier with stronger evidence.',
        userTopChunk: { retrievalScore: 62 },
        competitorTopChunk: { retrievalScore: 74 },
      },
    },
  },
}

describe('DiagnosticBrief', () => {
  it('renders the decision brief before model evidence and opens one Technical Diagnostics drawer', () => {
    const onSendToRewrite = vi.fn()

    render(
      <DiagnosticBrief
        results={results}
        markdown="# Best CRM\n\nReadable content."
        pageIntelligence={pageIntelligence}
        query="best ai crm"
        normalizedUrl="https://example.com/article"
        onSendToRewrite={onSendToRewrite}
      />
    )

    expect(screen.getByText('The answer path is weak')).toBeInTheDocument()
    expect(screen.getByText('Add one specific statistic to the top answer block.')).toBeInTheDocument()
    expect(screen.getByText('Coverage: Medium')).toBeInTheDocument()
    expect(screen.getByText('Best readable competitor has a stronger answer path.')).toBeInTheDocument()
    expect(screen.queryByText('Useful but not direct.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Technical Diagnostics/i }))

    expect(screen.getByText('Strong consensus: Answer Failure.')).toBeInTheDocument()
    expect(screen.getByText('Useful but not direct.')).toBeInTheDocument()
    expect(screen.getByText('Schema: Article')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Send to Rewrite Help' }))
    expect(onSendToRewrite).toHaveBeenCalledWith(expect.stringContaining('Suggested fix: Add one specific statistic'))
  })

  it('shows blocked-page Summary and hides competitor comparison', () => {
    render(
      <DiagnosticBrief
        results={results}
        markdown="Access Denied"
        pageIntelligence={{
          access: { statusCode: 403 },
          extraction: { title: 'Access Denied', h1: 'Access Denied', schemaTypes: [], wordCount: 1188 },
        }}
        query="what are xfinity internet plans?"
        normalizedUrl="https://www.xfinity.com/"
        onSendToRewrite={vi.fn()}
      />
    )

    expect(screen.getByText('Blocked')).toBeInTheDocument()
    expect(screen.getByText('AI is reading an access gate, not your real page.')).toBeInTheDocument()
    expect(screen.getAllByText('Fix access first.').length).toBeGreaterThan(0)
    expect(screen.getByText('Blocked-page score')).toBeInTheDocument()
    expect(screen.queryByText('Competitor Position')).not.toBeInTheDocument()
  })
})
