import { fireEvent, render, screen, within } from '@testing-library/react'
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
  it('renders the checks breakdown inside the overall score hero and preserves tab switching', () => {
    render(<ScoreDisplay results={results} loading={false} />)

    expect(screen.getAllByText('Checks breakdown')).toHaveLength(1)

    const hero = screen.getByText('Overall AEO Score').closest('.overall-score-hero')
    expect(hero).not.toBeNull()

    const heroScope = within(hero)
    expect(heroScope.getByText('Checks breakdown')).toBeInTheDocument()
    expect(heroScope.getByRole('button', { name: 'Content 2/3' })).toBeInTheDocument()
    expect(heroScope.getByRole('button', { name: 'GEU 2/2' })).toBeInTheDocument()
    expect(heroScope.getByText('FAQ structure')).toBeInTheDocument()

    fireEvent.click(heroScope.getByRole('button', { name: 'GEU 2/2' }))

    expect(heroScope.getByText('Standalone sentences')).toBeInTheDocument()
    expect(heroScope.queryByText('FAQ structure')).not.toBeInTheDocument()
  })
})
