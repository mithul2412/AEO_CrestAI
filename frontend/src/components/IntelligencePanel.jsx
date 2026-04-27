import WanderingEyes from './WanderingEyes.jsx'
import { useEffect, useMemo, useState } from 'react'

function scoreTone(score) {
  if (score == null) return 'muted'
  if (score >= 75) return 'ok'
  if (score >= 50) return 'warn'
  return 'danger'
}

function crawlerLabel(key) {
  return {
    googlebot: 'Googlebot',
    oaiSearchBot: 'OAI-SearchBot',
    gptBot: 'GPTBot',
    perplexityBot: 'PerplexityBot',
  }[key] || key
}

function statusLabel(value) {
  if (value === true) return 'Yes'
  if (value === false) return 'Risk'
  if (value == null) return 'Unknown'
  return String(value).charAt(0).toUpperCase() + String(value).slice(1)
}

function PreviewText({ markdown }) {
  const preview = markdown
    ? markdown.split('\n').filter(Boolean).slice(0, 12).join('\n')
    : 'Fetch a page to see the AI-readable markdown preview.'

  return <pre className="intelligence-preview">{preview}</pre>
}

function EmptyIntelligence() {
  return (
    <div className="intelligence-empty">
      <div className="section-kicker">Intelligence mode</div>
      <div className="section-title">Fetch a page to inspect the citation pipeline.</div>
      <p>Access, extraction, chunks, retrieval, answer quality, and the highest-impact fix will appear here.</p>
    </div>
  )
}

function winnerLabel(winner) {
  if (winner === 'user') return 'You'
  if (winner === 'competitor') return 'Competitor'
  return 'Unknown'
}

function competitorStatusCopy(competitor, { query = '', queryAnalyzing = false } = {}) {
  if (queryAnalyzing) return 'Discovering competitors and comparing citation-ready chunks.'
  if (!competitor) {
    return query
      ? 'Run query analysis to discover competitors for this target question.'
      : 'Competitor discovery runs after query analysis.'
  }
  if (competitor.status === 'disabled') {
    return competitor.discovery?.reason === 'TAVILY_API_KEY is missing'
      ? 'Tavily is not configured.'
      : (competitor.discovery?.reason || competitor.reason || 'Competitor discovery is disabled.')
  }
  if (competitor.status === 'error') return 'Competitor discovery failed.'
  if (competitor.status === 'insufficient_data') return 'No usable competitor chunks found.'
  return `Tavily found ${competitor.competitors?.length || 0} competing page${(competitor.competitors?.length || 0) === 1 ? '' : 's'} for this query.`
}

function ChunkCompare({ label, chunk }) {
  return (
    <div className="gap-chunk">
      <span className="fix-label">{label}</span>
      {chunk ? (
        <>
          <strong>{chunk.section || chunk.chunkId}</strong>
          <p>{chunk.text?.slice(0, 260)}{chunk.text?.length > 260 ? '...' : ''}</p>
          <div className="chunk-meta">
            <span>{chunk.retrievalScore ?? '--'} score</span>
            <span>{chunk.directAnswer ? 'Direct answer' : 'No direct answer'}</span>
          </div>
        </>
      ) : (
        <p>No chunk available.</p>
      )}
    </div>
  )
}

function IntelligencePending({ children, title = 'Working through the citation path' }) {
  return (
    <div className="intelligence-locked intelligence-locked--loading">
      <WanderingEyes className="wandering-eyes-inline" title={title} />
      <span>{children}</span>
    </div>
  )
}

function queryLockedCopy(query, fallback) {
  return query
    ? 'Target query is ready. Run Re-Score with Query above to unlock this diagnosis.'
    : fallback
}

function ChunkMinimap({ chunks, activeChunkId }) {
  if (!chunks.length) return null

  const scrollToChunk = (chunkId) => {
    document.getElementById(`chunk-map-${chunkId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }

  return (
    <aside className="chunk-minimap" aria-label="Chunk minimap">
      <div className="chunk-minimap-label">Chunk map</div>
      <div className="chunk-minimap-list">
        {chunks.map(chunk => (
          <button
            key={chunk.chunkId}
            type="button"
            className={`chunk-minimap-node${activeChunkId === chunk.chunkId ? ' active' : ''}`}
            onClick={() => scrollToChunk(chunk.chunkId)}
          >
            <strong>{chunk.chunkId}</strong>
            <span>{chunk.section || 'Untitled section'}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}

function CompetitiveCitationGap({ competitor, query = '', queryAnalyzing = false }) {
  const gap = competitor?.gap || null
  const competitors = competitor?.competitors || []
  const hasGap = gap?.status === 'ok'
  const isError = competitor?.status === 'error'
  const isDisabled = competitor?.status === 'disabled'

  return (
    <section className="section panel intelligence-card">
      <div className="section-head compact">
        <div>
          <div className="section-kicker">Competitive Citation Gap</div>
          <div className="details-heading">Who is more citation-ready?</div>
        </div>
        <span className={`summary-pill ${hasGap ? scoreTone(gap.competitorGapScore) : isError || isDisabled ? 'warn' : 'muted'}`}>
          {hasGap ? winnerLabel(gap.winner) : 'Pending'}
        </span>
      </div>

      <div className={`competitor-gap-status${isError ? ' error' : ''}`}>
        {competitorStatusCopy(competitor, { query, queryAnalyzing })}
        {competitor?.error && <span>{competitor.error}</span>}
      </div>

      {competitors.length > 0 && (
        <div className="competitor-list">
          {competitors.map(item => (
            <a key={item.url} className="competitor-item" href={item.url} target="_blank" rel="noreferrer">
              <div>
                <strong>{item.title || item.url}</strong>
                <span>{item.snippet || item.url}</span>
              </div>
              <small>{item.chunkCount || 0} chunks</small>
            </a>
          ))}
        </div>
      )}

      {hasGap && (
        <>
          <div className="gap-result">
            <div>
              <span className="fix-label">Result</span>
              <strong>{gap.winner === 'competitor' ? 'Competitor is more citation-ready' : 'You have the stronger top chunk'}</strong>
            </div>
            <div>
              <span className="fix-label">Score delta</span>
              <strong>{gap.scoreDelta > 0 ? '+' : ''}{gap.scoreDelta}</strong>
            </div>
          </div>

          <div className="gap-explanation">{gap.whyCompetitorWon}</div>

          {gap.missingAttributes?.length > 0 && (
            <div className="missing-attributes">
              {gap.missingAttributes.map(attribute => (
                <span key={attribute}>{attribute}</span>
              ))}
            </div>
          )}

          <div className="gap-chunk-grid">
            <ChunkCompare label="Your top chunk" chunk={gap.userTopChunk} />
            <ChunkCompare label="Competitor top chunk" chunk={gap.competitorTopChunk} />
          </div>
        </>
      )}

      {competitor?.failures?.length > 0 && (
        <div className="competitor-failures">
          {competitor.failures.map(failure => (
            <span key={failure}>{failure}</span>
          ))}
        </div>
      )}
    </section>
  )
}

export default function IntelligencePanel({ markdown, pageIntelligence, results, query, queryAnalyzing = false }) {
  const access = pageIntelligence?.access || {}
  const extraction = pageIntelligence?.extraction || {}
  const intelligence = results?.intelligence || {}
  const citation = intelligence.citationReadiness
  const retrieval = intelligence.retrieval
  const answer = intelligence.answerExtraction
  const competitor = intelligence.competitorIntelligence
  const fix = intelligence.highestImpactFix
  const chunks = intelligence.chunks?.length ? intelligence.chunks : []
  const minimapChunks = useMemo(
    () => (chunks.length ? chunks : retrieval?.topChunks || []),
    [chunks, retrieval?.topChunks]
  )
  const [activeChunkId, setActiveChunkId] = useState(minimapChunks[0]?.chunkId || '')
  const robots = access.robots || {}
  const warnings = [...(access.warnings || []), ...(extraction.warnings || [])]
  const subscores = citation?.subscores || {}

  useEffect(() => {
    setActiveChunkId(minimapChunks[0]?.chunkId || '')
  }, [minimapChunks])

  useEffect(() => {
    if (!minimapChunks.length || typeof IntersectionObserver === 'undefined') return undefined

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]

      if (visible?.target?.dataset?.chunkId) {
        setActiveChunkId(visible.target.dataset.chunkId)
      }
    }, { rootMargin: '-15% 0px -55% 0px', threshold: [0.25, 0.5, 0.75] })

    minimapChunks.forEach(chunk => {
      const target = document.getElementById(`chunk-map-${chunk.chunkId}`)
      if (target) observer.observe(target)
    })

    return () => observer.disconnect()
  }, [minimapChunks])

  if (!markdown && !pageIntelligence) return <EmptyIntelligence />

  return (
    <div className="intelligence-shell">
      <ChunkMinimap chunks={minimapChunks} activeChunkId={activeChunkId} />
      <div className="intelligence-panel">
      <div className="section panel intelligence-hero">
        <div>
          <div className="section-kicker">Crest.ai Intelligence</div>
          <div className="section-title">Citation pipeline diagnosis</div>
          <p className="intelligence-copy">
            Reconstruct the visible path from crawler access to retrievable answer block.
          </p>
        </div>
        <div className={`intelligence-score intelligence-score--${scoreTone(citation?.score)}`}>
          <span>AI Citation Readiness</span>
          <strong>{citation?.score ?? '--'}</strong>
          <small>{citation?.summary || 'Add a target query to complete retrieval and answer diagnosis.'}</small>
        </div>
      </div>

      <div className="intelligence-grid">
        <section className="section panel intelligence-card">
          <div className="section-head compact">
            <div>
              <div className="section-kicker">AI Access Status</div>
              <div className="details-heading">Can crawlers reach it?</div>
            </div>
            <span className={`summary-pill ${access.indexable === false ? 'warn' : 'ok'}`}>
              {access.indexable === false ? 'Risk' : 'Inspectable'}
            </span>
          </div>

          <div className="access-table" role="table" aria-label="AI Access Status">
            {Object.entries(robots).map(([key, value]) => (
              <div key={key} className="access-row" role="row">
                <span role="cell">{crawlerLabel(key)}</span>
                <strong className={`access-status ${value}`} role="cell">{statusLabel(value)}</strong>
              </div>
            ))}
            <div className="access-row" role="row">
              <span role="cell">Page Indexability</span>
              <strong className={`access-status ${access.indexable === false ? 'blocked' : 'allowed'}`} role="cell">
                {statusLabel(access.indexable)}
              </strong>
            </div>
          </div>
          <div className="intelligence-meta-list">
            <span>HTTP {access.statusCode ?? 'unknown'}</span>
            <span>{access.canonical || access.finalUrl || 'No canonical URL found'}</span>
          </div>
        </section>

        <section className="section panel intelligence-card">
          <div className="section-head compact">
            <div>
              <div className="section-kicker">AI-Readable Preview</div>
              <div className="details-heading">What the parser sees</div>
            </div>
            <span className="summary-pill ok">{(extraction.wordCount || 0).toLocaleString()} words</span>
          </div>

          <div className="extraction-facts">
            <div><span>Title</span><strong>{extraction.title || 'Missing'}</strong></div>
            <div><span>H1</span><strong>{extraction.h1 || 'Missing'}</strong></div>
            <div><span>Schema</span><strong>{extraction.schemaTypes?.length ? extraction.schemaTypes.join(', ') : 'None detected'}</strong></div>
          </div>
          <PreviewText markdown={markdown} />
        </section>
      </div>

      <section className="section panel intelligence-card">
        <div className="section-head compact">
          <div>
            <div className="section-kicker">Extraction Warnings</div>
            <div className="details-heading">Invisible content risks</div>
          </div>
        </div>
        <div className="warning-list">
          {warnings.length > 0 ? warnings.map(warning => (
            <div key={warning} className="warning-item">{warning}</div>
          )) : (
            <div className="warning-item ok">No major access or extraction warnings detected.</div>
          )}
        </div>
      </section>

      <div className="intelligence-grid">
        <section className="section panel intelligence-card">
          <div className="section-head compact">
            <div>
              <div className="section-kicker">Retrieval Fitness</div>
              <div className="details-heading">Which chunk would be retrieved?</div>
            </div>
            <span className={`summary-pill ${scoreTone(retrieval?.retrievalScore)}`}>
              {retrieval?.retrievalScore ?? '--'} / 100
            </span>
          </div>
          {retrieval ? (
            <>
              <div className="retrieval-diagnosis">{retrieval.diagnosis}</div>
              <div className="chunk-list">
                {retrieval.topChunks.map(chunk => (
                  <article key={chunk.chunkId} id={`chunk-map-${chunk.chunkId}`} data-chunk-id={chunk.chunkId} className="chunk-card">
                    <div className="chunk-card-head">
                      <span>{chunk.chunkId} / {chunk.section}</span>
                      <strong>{Math.round(chunk.similarity * 100)}% match</strong>
                    </div>
                    <p>{chunk.text.slice(0, 420)}{chunk.text.length > 420 ? '...' : ''}</p>
                    <div className="chunk-meta">
                      <span>Position {Math.round(chunk.position * 100)}%</span>
                      <span>{chunk.wordCount} words</span>
                      <span>{chunk.directAnswer ? 'Direct answer' : 'No direct answer'}</span>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : queryAnalyzing ? (
            <IntelligencePending title="Ranking page chunks">Ranking chunks against the target query...</IntelligencePending>
          ) : (
            <div className="intelligence-locked">
              {queryLockedCopy(query, 'Add and score a target query to rank chunks.')}
            </div>
          )}
        </section>

        <section className="section panel intelligence-card">
          <div className="section-head compact">
            <div>
              <div className="section-kicker">Answer Extraction Diagnosis</div>
              <div className="details-heading">Can the answer be quoted?</div>
            </div>
            <span className={`summary-pill ${scoreTone(answer?.answerScore)}`}>
              {answer?.answerScore ?? '--'} / 100
            </span>
          </div>
          <div className="answer-diagnosis">
            {answer?.diagnosis || (
              queryAnalyzing
                ? <span className="answer-diagnosis-loading"><WanderingEyes className="wandering-eyes-inline" title="Checking answer extraction" /> Checking whether the top chunk can be quoted...</span>
                : queryLockedCopy(query, 'Run a query to test whether the top chunk contains a standalone answer.')
            )}
          </div>

          <div className="subscore-grid">
            {Object.entries(subscores).map(([key, value]) => (
              <div key={key} className="subscore-item">
                <span>{key.replace(/Score$/, '').replace(/[A-Z]/g, match => ` ${match}`).trim()}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <CompetitiveCitationGap competitor={competitor} query={query} queryAnalyzing={queryAnalyzing} />

      <section className="section panel intelligence-card">
        <div className="section-head compact">
          <div>
            <div className="section-kicker">Highest-Impact Fix</div>
            <div className="details-heading">{fix?.fix || 'One prioritized fix will appear after query scoring.'}</div>
          </div>
          {fix && <span className="summary-pill warn">{fix.failureMode}</span>}
        </div>
        {fix ? (
          <div className="fix-grid">
            <div>
              <span className="fix-label">Why</span>
              <p>{fix.why}</p>
            </div>
            <div>
              <span className="fix-label">Where to edit</span>
              <p>{fix.whereToEdit}</p>
            </div>
            <div className="fix-copy">
              <span className="fix-label">Suggested copy</span>
              <p>{fix.exampleCopy}</p>
            </div>
            <div>
              <span className="fix-label">Expected lift</span>
              <p>{Object.entries(fix.expectedLift || {}).map(([key, value]) => `${key}: ${value}`).join(' / ')}</p>
              <span className="summary-pill ok">Confidence {fix.confidence}</span>
            </div>
          </div>
        ) : queryAnalyzing ? (
          <IntelligencePending title="Generating highest-impact fix">Building the highest-impact fix from retrieval and answer signals...</IntelligencePending>
        ) : (
          <div className="intelligence-locked">
            {queryLockedCopy(query, 'The fix generator needs a target query and retrieval result.')}
          </div>
        )}
      </section>

      {chunks.length > 0 && (
        <section className="section panel intelligence-card">
          <div className="section-head compact">
            <div>
              <div className="section-kicker">Chunk View</div>
              <div className="details-heading">How Crest.ai split the page</div>
            </div>
            <span className="summary-pill ok">{chunks.length} chunks</span>
          </div>
          <div className="chunk-strip">
            {chunks.map(chunk => {
              const isTopChunk = retrieval?.topChunks?.some(topChunk => topChunk.chunkId === chunk.chunkId)
              return (
              <div
                key={chunk.chunkId}
                id={isTopChunk ? undefined : `chunk-map-${chunk.chunkId}`}
                data-chunk-id={isTopChunk ? undefined : chunk.chunkId}
                className="chunk-strip-item"
              >
                <strong>{chunk.chunkId}</strong>
                <span>{chunk.section}</span>
                <small>{chunk.wordCount} words / {Math.round(chunk.position * 100)}%</small>
              </div>
              )
            })}
          </div>
        </section>
      )}
      </div>
    </div>
  )
}
