import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App.jsx'

describe('App', () => {
  it('renders the MotionViz fetch gate', () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<App />)
    expect(screen.getByText('Test AI Citation Readiness')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('https://example.com/page-to-analyze')).toBeInTheDocument()
  })
})
