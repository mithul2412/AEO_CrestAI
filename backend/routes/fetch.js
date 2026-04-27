import { Router } from 'express'
import fetch from 'node-fetch'
import { buildAccessFallback, crawlPage } from '../services/crawlService.js'
import { extractPageIntelligence } from '../services/extractService.js'
import { fetchMarkdownWithJina } from '../services/jinaReaderService.js'

const router = Router()
const FETCH_TIMEOUT_MS = 60_000
const SIGNAL_TIMEOUT_MS = 8_000

let fetchRequestCounter = 0

function nextFetchRequestId() {
  fetchRequestCounter += 1
  return String(fetchRequestCounter).padStart(4, '0')
}

function logFetch(requestId, message) {
  console.log(`[fetch:${requestId}] ${message}`)
}

function beginSse(res) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()
}

function isStreamRequest(req) {
  return req.query.stream === '1' || req.get('accept') === 'text/event-stream'
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function formatFetchError(err) {
  return err.name === 'TimeoutError' || err.name === 'AbortError'
    ? 'Request timed out - the page may be too large or Jina is slow. Try again.'
    : (err.message || 'Fetch failed')
}

export function normalizeFetchUrl(input) {
  const raw = String(input || '').trim()
  if (!raw) {
    throw new Error('url parameter required')
  }

  const withScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(raw)
    ? raw
    : `https://${raw.replace(/^\/+/, '')}`

  let parsed
  try {
    parsed = new URL(withScheme)
  } catch {
    throw new Error('url must be a valid absolute URL')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('url must use http or https')
  }

  return parsed.toString()
}

async function probeTextFile(url, requestId, label) {
  const attempt = async method => {
    logFetch(requestId, `probing ${label} via ${method} ${url}`)
    const res = await fetch(url, {
      method,
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(SIGNAL_TIMEOUT_MS),
    })
    logFetch(requestId, `${label} ${method} -> ${res.status}`)
    if (res.ok) return true
    if (method === 'HEAD' && res.status === 405) return null
    return false
  }

  try {
    const headResult = await attempt('HEAD')
    if (headResult !== null) return headResult
    return await attempt('GET')
  } catch (err) {
    logFetch(requestId, `${label} probe failed: ${err.message || 'unknown error'}`)
    return false
  }
}

async function buildSourceSignals(normalizedUrl, requestId) {
  const parsedUrl = new URL(normalizedUrl)
  const llmsTxtUrl = new URL('/llms.txt', parsedUrl.origin).toString()
  const llmsFullTxtUrl = new URL('/llms-full.txt', parsedUrl.origin).toString()

  const [llmsTxtPresent, llmsFullTxtPresent] = await Promise.all([
    probeTextFile(llmsTxtUrl, requestId, 'llms.txt'),
    probeTextFile(llmsFullTxtUrl, requestId, 'llms-full.txt'),
  ])

  return {
    sourceUrl: normalizedUrl,
    origin: parsedUrl.origin,
    llmsTxt: {
      present: llmsTxtPresent,
      url: llmsTxtPresent ? llmsTxtUrl : null,
    },
    llmsFullTxt: {
      present: llmsFullTxtPresent,
      url: llmsFullTxtPresent ? llmsFullTxtUrl : null,
    },
  }
}

async function inspectPageIntelligence(normalizedUrl, markdown, crawlPromise, requestId) {
  try {
    const crawlResult = await crawlPromise
    const extraction = extractPageIntelligence({
      html: crawlResult.html,
      markdown,
      url: crawlResult.access.finalUrl || normalizedUrl,
    })

    return {
      access: {
        ...crawlResult.access,
        canonical: extraction.canonical || crawlResult.access.canonical,
        indexable: crawlResult.access.indexable !== false && !extraction.robotsMeta?.noindex,
        warnings: [
          ...(crawlResult.access.warnings || []),
          ...(extraction.robotsMeta?.noindex ? ['Page-level robots meta noindex blocks indexability.'] : []),
          ...(extraction.robotsMeta?.nosnippet ? ['Page-level robots meta nosnippet may limit answer reuse.'] : []),
        ],
      },
      extraction,
    }
  } catch (err) {
    logFetch(requestId, `intelligence inspection failed: ${err.message || 'unknown error'}`)
    return {
      access: buildAccessFallback(normalizedUrl, err.message || 'Access intelligence unavailable.'),
      extraction: extractPageIntelligence({ html: '', markdown, url: normalizedUrl }),
    }
  }
}

router.get('/', async (req, res) => {
  const requestId = nextFetchRequestId()
  const streamMode = isStreamRequest(req)
  const rawUrl = req.query.url

  logFetch(requestId, `incoming request url="${rawUrl || ''}" stream=${streamMode ? 'yes' : 'no'}`)

  let normalizedUrl
  try {
    normalizedUrl = normalizeFetchUrl(rawUrl)
  } catch (err) {
    logFetch(requestId, `validation failed: ${err.message}`)
    if (streamMode) {
      beginSse(res)
      sendSse(res, 'failure', { error: err.message })
      res.end()
      return
    }
    return res.status(400).json({ error: err.message })
  }

  logFetch(requestId, `normalized url="${normalizedUrl}"`)

  if (streamMode) {
    beginSse(res)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    req.on('close', () => {
      logFetch(requestId, 'client connection closed')
      controller.abort()
    })

    try {
      sendSse(res, 'status', { phase: 'connecting', normalizedUrl })
      logFetch(requestId, 'SSE stream opened')

      const sourceSignalsPromise = buildSourceSignals(normalizedUrl, requestId)
      const crawlPromise = crawlPage(normalizedUrl)
      logFetch(requestId, `invoking Jina https://r.jina.ai/${normalizedUrl}`)
      const { markdown, charCount, chunkCount } = await fetchMarkdownWithJina(normalizedUrl, {
        signal: controller.signal,
        onChunk: (chunk, meta) => {
          if (meta.chunkCount <= 3 || meta.chunkCount % 10 === 0) {
            logFetch(requestId, `stream chunk ${meta.chunkCount} (${chunk.length} chars, total ${meta.totalChars})`)
          }
          sendSse(res, 'chunk', { chunk })
        },
      })
      logFetch(requestId, `Jina fetch complete with ${chunkCount} chunks and ${charCount} chars`)
      const [sourceSignals, intelligence] = await Promise.all([
        sourceSignalsPromise,
        inspectPageIntelligence(normalizedUrl, markdown, crawlPromise, requestId),
      ])

      logFetch(requestId, `source signals ready llms.txt=${sourceSignals.llmsTxt.present} llms-full.txt=${sourceSignals.llmsFullTxt.present}`)
      sendSse(res, 'complete', { markdown, charCount, sourceSignals, normalizedUrl, intelligence })
      logFetch(requestId, 'SSE stream completed successfully')
    } catch (err) {
      const message = formatFetchError(err)
      logFetch(requestId, `fetch failed: ${message}`)
      if (!controller.signal.aborted || !req.destroyed) {
        sendSse(res, 'failure', { error: message, normalizedUrl })
      }
    } finally {
      clearTimeout(timeout)
      res.end()
    }
    return
  }

  try {
    const crawlPromise = crawlPage(normalizedUrl)
    const [sourceSignals, { markdown, charCount }] = await Promise.all([
      buildSourceSignals(normalizedUrl, requestId),
      fetchMarkdownWithJina(normalizedUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }),
    ])
    const intelligence = await inspectPageIntelligence(normalizedUrl, markdown, crawlPromise, requestId)

    logFetch(requestId, `JSON fetch completed charCount=${charCount}`)
    res.json({ markdown, charCount, sourceSignals, normalizedUrl, intelligence })
  } catch (err) {
    const message = formatFetchError(err)
    logFetch(requestId, `JSON fetch failed: ${message}`)
    res.status(502).json({ error: message, normalizedUrl })
  }
})

export default router
