import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CompetitorMindmap from './CompetitorMindmap.jsx'

const okMap = {
  status: 'ok',
  angleCount: 4,
  marketSummary: {
    searchedAngles: '4/4',
    visibleCompetitors: 2,
    sourceDomainPresence: 'acme.com did not appear in any of the searched angles.',
    topLeader: { domain: 'g2.com', tier: 'Leader', presenceScore: 82, bestRank: 1 },
    recommendedMove: 'Build a direct answer block against g2.com.',
  },
  angles: [
    { angleId: 'target', angleLabel: 'Target Query', angleQuery: 'best CRM for small business', status: 'ok', resultCount: 8 },
    { angleId: 'category', angleLabel: 'Category Leaders', angleQuery: 'top CRM for small business software', status: 'ok', resultCount: 8 },
    { angleId: 'alternatives', angleLabel: 'Alternatives', angleQuery: 'Acme alternatives', status: 'ok', resultCount: 8 },
    { angleId: 'comparison', angleLabel: 'Comparison', angleQuery: 'CRM comparison Acme', status: 'ok', resultCount: 8 },
  ],
  competitors: [
    {
      id: 'g2-com',
      domain: 'g2.com',
      title: 'Best CRM Software',
      url: 'https://g2.com/categories/crm',
      tier: 'leader',
      tierLabel: 'Leader',
      presenceScore: 82,
      bestRank: 1,
      avgRank: 1.5,
      coverage: 0.75,
      strongestAngleId: 'category',
      rankReason: 'High market presence: 3/4 angles, best rank #1, strongest in Category Leaders.',
      snippetPreview: 'G2 compares CRM software for small business buyers.',
      strengths: ['Rank #1 on "Category Leaders"', 'Surfaces in 3 angles'],
      appearances: [
        { angleId: 'category', angleLabel: 'Category Leaders', rank: 1, url: 'https://g2.com/categories/crm' },
        { angleId: 'target', angleLabel: 'Target Query', rank: 2, url: 'https://g2.com/categories/crm' },
      ],
    },
    {
      id: 'salesforce-com',
      domain: 'salesforce.com',
      title: 'Salesforce CRM',
      url: 'https://salesforce.com/crm',
      tier: 'challenger',
      tierLabel: 'Challenger',
      presenceScore: 66,
      bestRank: 3,
      avgRank: 3,
      coverage: 0.25,
      strongestAngleId: 'comparison',
      rankReason: 'Narrow but visible presence: best rank #3, strongest in Comparison.',
      strengths: ['Rank #3 on "Comparison"'],
      appearances: [
        { angleId: 'comparison', angleLabel: 'Comparison', rank: 3, url: 'https://salesforce.com/crm' },
      ],
    },
  ],
}

describe('CompetitorMindmap', () => {
  it('renders a market field and active rationale', () => {
    render(<CompetitorMindmap data={okMap} brandLabel="Acme" />)

    expect(screen.getByText('Market Read')).toBeInTheDocument()
    expect(screen.getByText('2 visible domains')).toBeInTheDocument()
    expect(screen.getAllByText('g2.com').length).toBeGreaterThan(0)
    expect(screen.getByText(/High market presence/i)).toBeInTheDocument()
  })

  it('cycles active nodes with arrow keys', () => {
    render(<CompetitorMindmap data={okMap} brandLabel="Acme" />)

    const app = screen.getByRole('application', { name: /competitor market field/i })
    fireEvent.keyDown(app, { key: 'ArrowRight' })

    expect(screen.getAllByText('salesforce.com').length).toBeGreaterThan(0)
    expect(screen.getByText(/Narrow but visible presence/i)).toBeInTheDocument()
  })

  it('shows disabled state copy when Tavily is unavailable', () => {
    render(<CompetitorMindmap data={{ status: 'disabled', reason: 'TAVILY_API_KEY is missing' }} />)

    expect(screen.getByText('No market field yet')).toBeInTheDocument()
    expect(screen.getByText(/TAVILY_API_KEY is missing/)).toBeInTheDocument()
  })
})
