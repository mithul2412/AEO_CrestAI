import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ScoreDisplay from './ScoreDisplay.jsx'

function buildCheck(id, label, weight, passed, lift = '') {
  return { id, label, weight, passed, lift }
}

const results = {
  overallScore: 65,
  contentScore: 70,
  geuScore: 60,
  llmContentScore: 66,
  queryScore: null,
  gapScore: null,
  llmContentModels: [
    { model: 'Llama 3.3', llmContentScore: 64, briefReason: 'Direct answer path is solid.' },
  ],
  llmContentStatus: [
    { model: 'Llama 3.3', status: 'ok' },
  ],
  checks: [
    buildCheck('faq', 'FAQ structure', 20, true, '+11% citation lift'),
    buildCheck('stats', 'Statistics / numbers', 15, true, '+40% avg'),
    buildCheck('schema', 'Structured data / schema', 15, false, '~ impact'),
  ],
  geuChecks: [
    buildCheck('standalone', 'Standalone sentences', 30, true, 'AutoGEO'),
    buildCheck('coherent', 'Coherent opening', 20, true, 'AutoGEO'),
  ],
}

describe('ScoreDisplay', () => {
  it('renders an executive summary first and hides technical scoring until requested', () => {
    render(<ScoreDisplay results={results} loading={false} />)

    expect(screen.getAllByText('Ready with risks').length).toBeGreaterThan(0)
    expect(screen.getByText('What happened')).toBeInTheDocument()
    expect(screen.getByText('Why it matters')).toBeInTheDocument()
    expect(screen.getByText('What to do next')).toBeInTheDocument()
    expect(screen.getByText('Top blocker')).toBeInTheDocument()
    expect(screen.queryByText('Checks breakdown')).not.toBeInTheDocument()
    expect(screen.queryByText('Technical model notes')).not.toBeInTheDocument()

    const hero = screen.getByText('Baseline Readiness').closest('.overall-score-hero')
    expect(hero).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Technical score details/i }))

    expect(screen.getByText('Checks breakdown')).toBeInTheDocument()
    expect(screen.getByText('Technical model notes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Checks breakdown/i }))
    expect(screen.getByRole('button', { name: 'Page structure 2/3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AI usability 2/2' })).toBeInTheDocument()
    expect(screen.getAllByText('FAQ structure').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'AI usability 2/2' }))

    expect(screen.getAllByText('Standalone sentences').length).toBeGreaterThan(0)
    expect(screen.getByText('Coherent opening')).toBeInTheDocument()
  })
})
