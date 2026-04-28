import { useCallback, useEffect, useRef, useState } from 'react'
import { readApiError } from '../utils/api.js'
import InfinityLoop from './InfinityLoop.jsx'

function normalizeUrlInput(input) {
  const raw = input.trim()
  if (!raw) return ''
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(raw)) return raw
  return `https://${raw.replace(/^\/+/, '')}`
}

export default function UrlInput({ url, onUrlChange, onFetchComplete }) {
  const [fetching, setFetching] = useState(false)
  const [preview, setPreview] = useState('')
  const [charCount, setCharCount] = useState(0)
  const [chunkCount, setChunkCount] = useState(0)
  const [fetchDigest, setFetchDigest] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [fetchDone, setFetchDone] = useState(false)
  const [streamState, setStreamState] = useState('idle')
  const [error, setError] = useState('')
  const eventSourceRef = useRef(null)

  const closeStream = useCallback(() => {
    eventSourceRef.current?.close()
    eventSourceRef.current = null
  }, [])

  useEffect(() => () => closeStream(), [closeStream])

  const handleFetch = useCallback(async () => {
    const normalizedUrl = normalizeUrlInput(url)
    if (!normalizedUrl) return

    closeStream()
    setFetching(true)
    setError('')
    setPreview('')
    setCharCount(0)
    setChunkCount(0)
    setFetchDigest(null)
    setFetchDone(false)
    setStreamState('connecting')

    if (typeof EventSource === 'undefined') {
      try {
        const res = await fetch(`/fetch?url=${encodeURIComponent(normalizedUrl)}`)
        if (!res.ok) {
          throw new Error(await readApiError(res, `Fetch error: ${res.status}`))
        }
        const data = await res.json()
        setPreview(data.markdown)
        setCharCount(data.charCount)
        setFetchDigest({
          title: data.intelligence?.extraction?.title || 'Missing',
          wordCount: data.intelligence?.extraction?.wordCount || 0,
          accessStatus: data.intelligence?.access?.statusCode ? `HTTP ${data.intelligence.access.statusCode}` : 'Unknown access',
          schema: data.intelligence?.extraction?.schemaTypes?.length ? data.intelligence.extraction.schemaTypes.join(', ') : 'None detected',
        })
        setFetchDone(true)
        setStreamState('complete')
        onFetchComplete(data.markdown, data.charCount, data.sourceSignals || {}, data.intelligence || null, data.normalizedUrl || normalizedUrl)
      } catch (e) {
        setStreamState('error')
        setError(e.message)
      } finally {
        setFetching(false)
      }
      return
    }

    let streamedMarkdown = ''
    let finished = false
    const eventSource = new EventSource(`/fetch?url=${encodeURIComponent(normalizedUrl)}&stream=1`)
    eventSourceRef.current = eventSource

    eventSource.addEventListener('status', event => {
      const data = JSON.parse(event.data)
      setStreamState('connected')
      if (data?.normalizedUrl && data.normalizedUrl !== url) {
        onUrlChange(data.normalizedUrl)
      }
    })

    eventSource.addEventListener('chunk', event => {
      const data = JSON.parse(event.data)
      streamedMarkdown += data.chunk || ''
      setStreamState('streaming')
      setChunkCount(count => count + 1)
      setPreview(streamedMarkdown)
      setCharCount(streamedMarkdown.length)
    })

    eventSource.addEventListener('complete', event => {
      const data = JSON.parse(event.data)
      finished = true
      setPreview(data.markdown || streamedMarkdown)
      setCharCount(data.charCount || (data.markdown || streamedMarkdown).length)
      setFetchDigest({
        title: data.intelligence?.extraction?.title || 'Missing',
        wordCount: data.intelligence?.extraction?.wordCount || 0,
        accessStatus: data.intelligence?.access?.statusCode ? `HTTP ${data.intelligence.access.statusCode}` : 'Unknown access',
        schema: data.intelligence?.extraction?.schemaTypes?.length ? data.intelligence.extraction.schemaTypes.join(', ') : 'None detected',
      })
      setFetchDone(true)
      setStreamState('complete')
      setFetching(false)
      closeStream()
      if (data.normalizedUrl) {
        onUrlChange(data.normalizedUrl)
      }
      onFetchComplete(
        data.markdown || streamedMarkdown,
        data.charCount || (data.markdown || streamedMarkdown).length,
        data.sourceSignals || {},
        data.intelligence || null,
        data.normalizedUrl || normalizedUrl
      )
    })

    eventSource.addEventListener('failure', event => {
      const data = JSON.parse(event.data)
      finished = true
      setStreamState('error')
      setError(data.error || 'Fetch failed')
      setFetching(false)
      closeStream()
      if (data.normalizedUrl) {
        onUrlChange(data.normalizedUrl)
      }
    })

    eventSource.onerror = () => {
      if (finished) return
      setStreamState('error')
      setError('Streaming connection lost while fetching the page.')
      setFetching(false)
      closeStream()
    }
  }, [closeStream, onFetchComplete, onUrlChange, url])

  return (
    <div>
      <div className="url-row">
        <input
          className="url-input"
          placeholder="https://example.com/page-to-analyze"
          value={url}
          onChange={e => onUrlChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !fetching && handleFetch()}
          disabled={fetching}
        />
        <button
          className={`btn${fetching ? ' loading' : ''}`}
          onClick={handleFetch}
          disabled={fetching}
        >
          {fetching
            ? <><InfinityLoop className="infinity-loop-button" title="Accessing page content" /> Accessing...</>
            : 'Fetch Page'}
        </button>
      </div>

      <div className="fetch-status-strip">
        <span className={`fetch-status-pill ${streamState}`}>
          {streamState === 'idle' && 'Ready to fetch'}
          {streamState === 'connecting' && 'Reaching the page'}
          {streamState === 'connected' && 'Page found'}
          {streamState === 'streaming' && 'Pulling content'}
          {streamState === 'complete' && 'Ready to score'}
          {streamState === 'error' && 'Could not fetch'}
        </span>
        {(fetching || fetchDone) && (
          <span className="fetch-inline-meta">
            {fetching
              ? <><InfinityLoop className="infinity-loop-inline" title="Reading page content" /> Reading page content...</>
              : `${charCount.toLocaleString()} chars${chunkCount > 0 ? ` · ${chunkCount} chunks` : ''}`}
          </span>
        )}
      </div>

      {error && <div className="error-bar">{error}</div>}

      {!fetching && fetchDone && (
        <>
          <div className="fetch-preview-header">
            <span className="fetch-preview-label">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M4 6l1.5 1.5L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Content fetched
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="char-counter">{charCount.toLocaleString()} chars</span>
              <button
                className="tab-btn"
                onClick={() => setShowPreview(value => !value)}
              >
                {showPreview ? 'Hide raw content' : 'View raw content'}
              </button>
            </span>
          </div>
          {fetchDigest && (
            <div className="fetch-signal-digest fetch-signal-digest--inline">
              <span>Title: {fetchDigest.title}</span>
              <span>Words: {fetchDigest.wordCount.toLocaleString()}</span>
              <span>Access: {fetchDigest.accessStatus}</span>
              <span>Schema: {fetchDigest.schema}</span>
            </div>
          )}
          {showPreview && (
            <div className="preview-textarea">
              {preview}
            </div>
          )}
        </>
      )}
    </div>
  )
}
