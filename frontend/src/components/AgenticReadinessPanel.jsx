import { useCallback, useEffect, useState } from 'react'
import ArtifactTabs from './ArtifactTabs.jsx'
import { generateAgenticLayer } from '../utils/agenticApi.js'

export default function AgenticReadinessPanel({
  url,
  markdown,
  query,
  analysis,
  sourceSignals,
}) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setResult(null)
    setError('')
  }, [url, markdown])

  const ready = Boolean(markdown && analysis)

  const handleGenerate = useCallback(async () => {
    if (!ready) return

    setLoading(true)
    setError('')
    try {
      const data = await generateAgenticLayer({
        url,
        markdown,
        query: query?.trim() || undefined,
        analysis,
        sourceSignals,
      })
      setResult(data)
    } catch (err) {
      setError(err?.message || 'Agentic generation failed')
    } finally {
      setLoading(false)
    }
  }, [analysis, markdown, query, ready, sourceSignals, url])

  if (!analysis) return null

  return (
    <div className="section panel agentic-panel" data-testid="agentic-panel">
      <div className="section-head">
        <div>
          <div className="section-kicker">Phase 02B / Agentic readiness layer</div>
          <div className="section-title">Generate the AI-readable infrastructure layer</div>
        </div>
        <div className="section-note">
          Canonical profile, artifacts, validation, and hosted profile links.
        </div>
      </div>

      <div className="agentic-panel-actions">
        <button
          type="button"
          className={`btn-send${loading ? ' loading' : ''}`}
          onClick={handleGenerate}
          disabled={!ready || loading}
        >
          {loading ? <><span className="spinner" /> Generating...</> : 'Generate Agentic AI Readiness Layer'}
        </button>
        <span className={`summary-pill ${ready ? 'ok' : 'warn'}`}>
          {ready ? 'Baseline ready' : 'Waiting for baseline'}
        </span>
      </div>

      {error && (
        <div className="error-bar" role="alert">
          Agentic generation failed: {error}
        </div>
      )}

      {!result && !error && (
        <div className="agentic-empty">
          Agentic artifacts will appear here after generation.
        </div>
      )}

      {result && <ArtifactTabs result={result} />}
    </div>
  )
}
