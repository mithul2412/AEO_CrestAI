import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Verdicts from './Verdicts.jsx'

describe('Verdicts', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(),
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a plain query verdict first and keeps model detail behind technical notes', () => {
    const onSendToChat = vi.fn()

    render(
      <Verdicts
        verdicts={[
          {
            model: 'Llama 3.3',
            queryMatchScore: 48,
            verdict: 'Useful but not direct enough.',
            topGap: 'Needs a tighter opening answer.',
            suggestedFix: 'Lead with the answer in sentence one.',
          },
          {
            model: 'Nemotron 120B',
            queryMatchScore: 52,
            verdict: 'Reasonably aligned for the query.',
            topGap: 'Missing sharper comparison cues.',
            suggestedFix: 'Add a short answer-first comparison block.',
          },
        ]}
        queryScore={50}
        contentScore={70}
        gapScore={20}
        modelStatus={[
          { model: 'Llama 3.3', status: 'ok' },
          { model: 'Nemotron 120B', status: 'ok' },
        ]}
        onSendToChat={onSendToChat}
      />
    )

    expect(screen.getByText('The answer path is weak')).toBeInTheDocument()
    expect(screen.getByText('Model consensus')).toBeInTheDocument()
    expect(screen.getByText(/Large answer gap/)).toBeInTheDocument()
    expect(screen.queryByText('Useful but not direct enough.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Technical model notes/i }))

    expect(screen.getByText('Useful but not direct enough.')).toBeInTheDocument()
    expect(screen.getByText('Reasonably aligned for the query.')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /Copy suggested fix from/ })[0])
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Lead with the answer in sentence one.')

    fireEvent.click(screen.getAllByRole('button', { name: /Send suggested fix from/ })[0])
    expect(onSendToChat).toHaveBeenCalled()
  })
})
