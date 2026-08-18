import { chunkMarkdown } from './chunkService.js'
import { fetchMarkdownWithJina } from './jinaReaderService.js'
import { discoverCompetitors } from './tavilyService.js'

export async function buildCompetitorCorpus({
  query,
  sourceUrl,
  maxCompetitors = 3,
  discover = discoverCompetitors,
  fetchMarkdown = fetchMarkdownWithJina,
} = {}) {
  const discovery = await discover({
    query,
    sourceUrl,
    maxResults: maxCompetitors,
  })

  if (discovery.status !== 'ok' || discovery.competitors.length === 0) {
    return {
      discovery,
      competitors: [],
      failures: [],
    }
  }

  const settled = await Promise.allSettled(
    discovery.competitors.map(async (competitor, index) => {
      const fetched = await fetchMarkdown(competitor.url, {
        signal: AbortSignal.timeout(25_000),
      })
      const sourceId = `competitor-${index + 1}`
      const chunks = chunkMarkdown(fetched.markdown).map(chunk => ({
        ...chunk,
        chunkId: `${sourceId}-${chunk.chunkId}`,
        sourceId,
        sourceType: 'competitor',
        sourceUrl: competitor.url,
        sourceTitle: competitor.title,
      }))

      return {
        ...competitor,
        sourceId,
        charCount: fetched.charCount,
        chunkCount: chunks.length,
        chunks,
      }
    })
  )

  return {
    discovery,
    competitors: settled
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value),
    failures: settled
      .filter(result => result.status === 'rejected')
      .map(result => result.reason?.message || 'Unknown competitor fetch error'),
  }
}
