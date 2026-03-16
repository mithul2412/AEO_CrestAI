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

  it('shows clearer verdict labels, comparison bars, and fix actions', () => {
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

    expect(screen.getAllByText('See full verdict ->')).toHaveLength(2)
    expect(screen.getByText('Baseline')).toBeInTheDocument()
    expect(screen.getByText('Query')).toBeInTheDocument()
    expect(screen.getAllByText('MED')).toHaveLength(2)

    fireEvent.click(screen.getAllByRole('button', { name: /Copy suggested fix from/ })[0])
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Lead with the answer in sentence one.')

    fireEvent.click(screen.getAllByRole('button', { name: /Send suggested fix from/ })[0])
    expect(onSendToChat).toHaveBeenCalled()
  })
})
