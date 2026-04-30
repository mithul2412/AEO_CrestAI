import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App.jsx'

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
