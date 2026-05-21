import { render, screen, fireEvent, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Chat from './Chat.jsx'

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

describe('Chat', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a model toggle and switches between model responses for the same turn', async () => {
    fetch.mockResolvedValueOnce(createJsonResponse({
      responses: [
        { model: 'Qwen 3.6 Plus', response: 'Qwen answer with **one** strong fix.' },
        { model: 'Nemotron 120B', response: 'Nemotron answer with `two` stronger fixes.' },
        { model: 'GPT OSS 120B', response: 'GPT OSS answer with three stronger fixes.' },
      ],
    }))

    render(<Chat markdown="# Test page" stage="post-fetch" />)

    fireEvent.click(screen.getByRole('button', { name: 'What AI usability signals are missing from this content?' }))

    expect(await screen.findByText(/Qwen answer with/)).toBeInTheDocument()
    const modelSelector = screen.getByRole('group', { name: 'Select model' })
    expect(modelSelector).toBeInTheDocument()
    expect(screen.queryByText(/Nemotron answer with/)).not.toBeInTheDocument()

    fireEvent.click(within(modelSelector).getByRole('button', { name: 'Nemotron' }))

    expect(await screen.findByText(/Nemotron answer with/)).toBeInTheDocument()
    expect(screen.queryByText(/Qwen answer with/)).not.toBeInTheDocument()

    fireEvent.click(within(modelSelector).getByRole('button', { name: 'GPT OSS' }))

    expect(await screen.findByText(/GPT OSS answer with/)).toBeInTheDocument()
  })

  it('shows context strip but hides model selector before the first response', () => {
    render(<Chat markdown="# Test page" stage="post-query" query="best ai crm" fixSource="Model verdict" />)

    expect(screen.getByText('Query')).toBeInTheDocument()
    expect(screen.getByText('best ai crm')).toBeInTheDocument()
    expect(screen.getByText('Model verdict')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Select model' })).not.toBeInTheDocument()
  })

  it('prefills the chat input when a verdict draft is provided', () => {
    render(
      <Chat
        markdown="# Test page"
        stage="post-verdict"
        query="best ai crm"
        draft={'Goal: improve the page for the query "best ai crm"'}
        draftToken={123}
      />
    )

    expect(screen.getByDisplayValue('Goal: improve the page for the query "best ai crm"')).toBeInTheDocument()
    expect(screen.getByText('Draft loaded from verdict')).toBeInTheDocument()
  })
})
