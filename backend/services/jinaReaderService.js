import fetch from 'node-fetch'

export const DEFAULT_JINA_TIMEOUT_MS = 60_000

function buildJinaHeaders() {
  return {
    Accept: 'text/markdown',
    'X-Return-Format': 'markdown',
    ...(process.env.JINA_API_KEY && { Authorization: `Bearer ${process.env.JINA_API_KEY}` }),
  }
}

export async function fetchMarkdownWithJina(url, {
  onChunk = null,
  signal = AbortSignal.timeout(DEFAULT_JINA_TIMEOUT_MS),
} = {}) {
  const jinaUrl = `https://r.jina.ai/${url}`
  const jinaRes = await fetch(jinaUrl, {
    headers: buildJinaHeaders(),
    signal,
  })

  if (!jinaRes.ok) {
    const errorText = await jinaRes.text().catch(() => '')
    const compactError = errorText.replace(/\s+/g, ' ').trim()
    throw new Error(compactError ? `Jina returned ${jinaRes.status}: ${compactError}` : `Jina returned ${jinaRes.status}`)
  }

  let markdown = ''
  let chunkCount = 0

  for await (const chunk of jinaRes.body) {
    const textChunk = chunk.toString('utf8')
    markdown += textChunk
    chunkCount += 1
    if (onChunk) onChunk(textChunk, { chunkCount, totalChars: markdown.length })
  }

  if (!markdown.trim()) {
    throw new Error('Empty response from Jina AI')
  }

  return {
    url,
    markdown,
    charCount: markdown.length,
    chunkCount,
  }
}
