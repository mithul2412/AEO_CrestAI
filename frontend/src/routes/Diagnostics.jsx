import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRun } from '../state/RunContext.jsx'
import StatPill from '../components/primitives/StatPill.jsx'
import { LockedBlock, LoadingBlock } from '../components/primitives/StateBlocks.jsx'
import { getCompetitorPosition, getModelConsensus } from '../utils/diagnosticBrief.js'

function tone(score) {
  if (typeof score !== 'number') return 'plain'
  if (score >= 75) return 'ok'
  if (score >= 50) return 'warn'
  return 'danger'
}

function ChunkMinimap({ chunks, activeId }) {
  if (!chunks?.length) return null
  return (
    <aside className="minimap" aria-label="Chunk map">
      <span className="kicker minimap__label">Chunk map</span>
      {chunks.map(chunk => (
        <button
          key={chunk.chunkId}
          type="button"
          className={`minimap__node${activeId === chunk.chunkId ? ' active' : ''}`}
          onClick={() => document.getElementById(`chunk-${chunk.chunkId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        >
          <strong>{chunk.chunkId}</strong>
          <span>{chunk.section || 'Untitled'}</span>
        </button>
      ))}
    </aside>
  )
}

function CompareCell({ label, chunk }) {
  return (
    <div className="compare-cell">
      <span className="kicker">{label}</span>
      {chunk ? (
        <>
          <span className="compare-cell__title">{chunk.section || chunk.chunkId}</span>
          <p className="compare-cell__text">
            {(chunk.text || '').slice(0, 240)}{(chunk.text || '').length > 240 ? '…' : ''}
          </p>
          <div className="chunk-card__meta">
            <span>{chunk.retrievalScore ?? Math.round((chunk.similarity || 0) * 100)} score</span>
            <span>{chunk.directAnswer ? 'Direct' : 'Indirect'}</span>
          </div>
        </>
      ) : (
        <p className="compare-cell__text muted">No chunk available.</p>
      )}
    </div>
  )
}

export default function Diagnostics() {
  const navigate = useNavigate()
  const {
    hasFetched, hasQueryResults, queryAnalyzing,
    results, query, sendDraftToChat,
  } = useRun()

  const intelligence = results?.intelligence || {}
  const citation = intelligence.citationReadiness
  const retrieval = intelligence.retrieval
  const answer = intelligence.answerExtraction
  const competitor = intelligence.competitorIntelligence
  const fix = intelligence.highestImpactFix
  const searchPresence = intelligence.searchPresence || competitor?.searchPresence
  const verdicts = results?.verdicts || []
  const modelStatus = results?.modelStatus || []
  const consensus = getModelConsensus(verdicts, modelStatus)
  const competitorPosition = getCompetitorPosition(competitor)

  const chunks = intelligence.chunks?.length ? intelligence.chunks : retrieval?.topChunks || []
  const minimapChunks = useMemo(() => chunks.slice(0, 24), [chunks])
  const [activeChunkId, setActiveChunkId] = useState(minimapChunks[0]?.chunkId || '')
  const [evidenceOpen, setEvidenceOpen] = useState(false)

  useEffect(() => { setActiveChunkId(minimapChunks[0]?.chunkId || '') }, [minimapChunks])

  useEffect(() => {
    if (!minimapChunks.length || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible?.target?.dataset?.chunkId) {
        setActiveChunkId(visible.target.dataset.chunkId)
      }
    }, { rootMargin: '-15% 0px -55% 0px', threshold: [0.25, 0.5, 0.75] })
    minimapChunks.forEach(c => {
      const el = document.getElementById(`chunk-${c.chunkId}`)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [minimapChunks])

  if (!hasFetched) {
    return (
      <LockedBlock
        title="Diagnostics needs a fetched page"
        copy="Fetch a URL from Overview to start the citation pipeline."
      />
    )
  }

  if (!hasQueryResults) {
    return (
      <LockedBlock
        title="Diagnostics locked — add a target query"
        copy="Retrieval, answer extraction, competitor gap, and the highest-impact fix all unlock once a target query is scored."
        action={
          <button type="button" className="btn btn--sm" onClick={() => navigate('/')}>
            Add a query
          </button>
        }
      />
    )
  }

  if (queryAnalyzing && !results) {
    return <LoadingBlock label="Running query test" lines={5} />
  }

  const subscores = answer?.subscores || {}

  return (
    <div className="diag-shell">
      <div className="vstack" style={{ gap: 'var(--s-7)' }}>
        <section className="section">
          <div className="section__head">
            <div className="section__head-titles">
              <span className="kicker">Citation readiness</span>
              <h2 className="h-2">{citation?.summary || 'How easily this page can be cited for the target query.'}</h2>
            </div>
            <StatPill tone={tone(citation?.score)}>
              {typeof citation?.score === 'number' ? `${citation.score}/100` : '—'}
            </StatPill>
          </div>
          <div className="subscore-grid">
            {Object.entries(citation?.subscores || {}).map(([key, value]) => (
              <div key={key} className="subscore-item">
                <span className="subscore-item__label">{key.replace(/Score$/, '').replace(/[A-Z]/g, m => ` ${m}`).trim()}</span>
                <span className="subscore-item__value">{value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section__head">
            <div className="section__head-titles">
              <span className="kicker">Best match · retrieval</span>
              <h2 className="h-2">Which chunk answers this query best?</h2>
            </div>
            <StatPill tone={tone(retrieval?.retrievalScore)}>
              {typeof retrieval?.retrievalScore === 'number' ? `${retrieval.retrievalScore}/100` : '—'}
            </StatPill>
          </div>
          {retrieval?.diagnosis && <p className="caption">{retrieval.diagnosis}</p>}
          <div className="chunk-list">
            {(retrieval?.topChunks || []).map(chunk => (
              <article
                key={chunk.chunkId}
                id={`chunk-${chunk.chunkId}`}
                data-chunk-id={chunk.chunkId}
                className="chunk-card"
              >
                <div className="chunk-card__head">
                  <span>{chunk.chunkId} · {chunk.section}</span>
                  <strong>{Math.round((chunk.similarity || 0) * 100)}% match</strong>
                </div>
                <p className="chunk-card__text">
                  {(chunk.text || '').slice(0, 360)}{(chunk.text || '').length > 360 ? '…' : ''}
                </p>
                <div className="chunk-card__meta">
                  <span>Position {Math.round((chunk.position || 0) * 100)}%</span>
                  <span>{chunk.wordCount || 0} words</span>
                  <span>{chunk.directAnswer ? 'Direct answer' : 'No direct answer'}</span>
                </div>
              </article>
            ))}
            {!retrieval?.topChunks?.length && (
              <p className="caption">No retrieval chunks were returned for this query.</p>
            )}
          </div>
        </section>

        <section className="section">
          <div className="section__head">
            <div className="section__head-titles">
              <span className="kicker">Answer quality</span>
              <h2 className="h-2">Can the answer be quoted?</h2>
            </div>
            <StatPill tone={tone(answer?.answerScore)}>
              {typeof answer?.answerScore === 'number' ? `${answer.answerScore}/100` : '—'}
            </StatPill>
          </div>
          {answer?.diagnosis && <p className="caption">{answer.diagnosis}</p>}
          <div className="subscore-grid">
            {Object.entries(subscores).map(([key, value]) => (
              <div key={key} className="subscore-item">
                <span className="subscore-item__label">{key.replace(/Score$/, '').replace(/[A-Z]/g, m => ` ${m}`).trim()}</span>
                <span className="subscore-item__value">{value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section__head">
            <div className="section__head-titles">
              <span className="kicker">Competitor position</span>
              <h2 className="h-2">{competitorPosition.headline}</h2>
            </div>
            <StatPill tone={competitorPosition.tone === 'muted' ? 'plain' : competitorPosition.tone}>
              Coverage · {competitorPosition.coverage}
            </StatPill>
          </div>
          <p className="caption">{competitorPosition.detail}</p>

          {competitor?.gap?.status === 'ok' && (
            <div className="compare-grid">
              <CompareCell label="Your top chunk" chunk={competitor.gap.userTopChunk} />
              <CompareCell label="Best competitor chunk" chunk={competitor.gap.competitorTopChunk} />
            </div>
          )}

          {competitor?.competitors?.length > 0 && (
            <div className="competitor-list">
              {competitor.competitors.map(c => (
                <a key={c.url} className="competitor-item" href={c.url} target="_blank" rel="noreferrer">
                  <div>
                    <div className="competitor-item__title">{c.title || c.url}</div>
                    <div className="competitor-item__url">{c.url}</div>
                  </div>
                  <span className="competitor-item__count">{c.chunkCount || 0} chunks</span>
                </a>
              ))}
            </div>
          )}

          {searchPresence && searchPresence.status === 'ok' && (
            <div className="callout">
              <span className="callout__metric">
                {typeof searchPresence.domainRank === 'number' ? `#${searchPresence.domainRank}` : '—'}
              </span>
              <div className="callout__copy">
                <span className="callout__title">Search presence</span>
                <span className="callout__detail">
                  {typeof searchPresence.domainRank === 'number'
                    ? `${searchPresence.sourceDomain || 'Source domain'} appears at result #${searchPresence.domainRank} for this query.`
                    : `${searchPresence.sourceDomain || 'Source domain'} was not found in the discovered result set.`}
                </span>
              </div>
              <StatPill tone={typeof searchPresence.domainRank === 'number' ? 'ok' : 'warn'}>
                {typeof searchPresence.domainRank === 'number' ? 'Ranked' : 'Missing'}
              </StatPill>
            </div>
          )}
        </section>

        <section className="section">
          <div className="section__head">
            <div className="section__head-titles">
              <span className="kicker">Highest-impact fix</span>
              <h2 className="h-2">{fix?.fix || 'A prioritized fix will appear after query scoring.'}</h2>
            </div>
            {fix?.failureMode && <StatPill tone="warn">{fix.failureMode}</StatPill>}
          </div>
          {fix ? (
            <div className="vstack" style={{ gap: 'var(--s-3)' }}>
              <div className="data-list">
                <div className="data-row"><span className="data-row__label">Why</span><span className="data-row__value">{fix.why}</span></div>
                <div className="data-row"><span className="data-row__label">Where to edit</span><span className="data-row__value">{fix.whereToEdit}</span></div>
                <div className="data-row"><span className="data-row__label">Suggested copy</span><span className="data-row__value">{fix.exampleCopy}</span></div>
                <div className="data-row">
                  <span className="data-row__label">Expected lift</span>
                  <span className="data-row__value">
                    {Object.entries(fix.expectedLift || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}
                  </span>
                </div>
                <div className="data-row"><span className="data-row__label">Confidence</span><span className="data-row__value">{fix.confidence ?? '—'}</span></div>
              </div>
              <div className="hstack">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => {
                    const draft = [
                      `Suggested fix: ${fix.fix}`,
                      `Why: ${fix.why}`,
                      `Where to edit: ${fix.whereToEdit}`,
                      `Example copy: ${fix.exampleCopy}`,
                      'Format: issues + rewrite + expected score impact',
                    ].filter(Boolean).join('\n')
                    sendDraftToChat(draft)
                    navigate('/rewrite')
                  }}
                >
                  Send to Rewrite Help
                </button>
              </div>
            </div>
          ) : (
            <p className="caption">The fix generator needs a target query and retrieval result.</p>
          )}
        </section>

        <section className="section">
          <div className="section__head">
            <div className="section__head-titles">
              <span className="kicker">Per-model verdicts</span>
              <h2 className="h-2">What three models say about this answer path.</h2>
            </div>
            <StatPill tone={consensus.tier === 'muted' ? 'plain' : consensus.tier}>
              {consensus.label}
            </StatPill>
          </div>
          <div className="verdict-grid">
            {verdicts.map(v => (
              <article key={v.model} className="verdict-card">
                <div className="verdict-card__head">
                  <span className="verdict-card__model">{v.model}</span>
                  <span className="verdict-card__score">{typeof v.queryMatchScore === 'number' ? v.queryMatchScore : '—'}</span>
                </div>
                {v.failureMode && <span className="kicker">{v.failureMode}</span>}
                {v.verdict && <p className="verdict-card__line">{v.verdict}</p>}
                {v.topGap && <p className="verdict-card__line"><strong>Top gap:</strong> {v.topGap}</p>}
                {v.suggestedFix && <p className="verdict-card__line"><strong>Fix:</strong> {v.suggestedFix}</p>}
              </article>
            ))}
            {!verdicts.length && <p className="caption">No model verdicts were returned for this query.</p>}
          </div>
        </section>

        {chunks.length > 0 && (
          <section className="section">
            <button type="button" className="evidence-toggle" onClick={() => setEvidenceOpen(v => !v)}>
              <span>
                <span className="kicker">Evidence chunks</span>
                <span className="caption" style={{ marginLeft: 12 }}>{chunks.length} chunks</span>
              </span>
              <span className={`evidence-toggle__chev${evidenceOpen ? ' open' : ''}`}>v</span>
            </button>
            {evidenceOpen && (
              <div className="vstack" style={{ gap: 'var(--s-2)' }}>
                {chunks.map(c => (
                  <div key={c.chunkId} className="data-row">
                    <span className="data-row__label">{c.chunkId} · {c.section}</span>
                    <span className="data-row__value">{c.wordCount || 0} words · pos {Math.round((c.position || 0) * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <ChunkMinimap chunks={minimapChunks} activeId={activeChunkId} />
    </div>
  )
}
