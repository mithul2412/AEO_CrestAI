import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRun } from '../state/RunContext.jsx'
import StatPill from '../components/primitives/StatPill.jsx'
import { LockedBlock, LoadingBlock } from '../components/primitives/StateBlocks.jsx'
import CompetitorMindmap from '../components/CompetitorMindmap.jsx'
import { getCompetitorPosition, getModelConsensus } from '../utils/diagnosticBrief.js'

const TABS = [
  { id: 'verdict', label: 'Verdict' },
  { id: 'answer', label: 'Answer Path' },
  { id: 'market', label: 'Market' },
]

function tone(score) {
  if (typeof score !== 'number') return 'plain'
  if (score >= 75) return 'ok'
  if (score >= 50) return 'warn'
  return 'danger'
}

function readableSubscoreLabel(key) {
  return key
    .replace(/Score$/, '')
    .replace(/[A-Z]/g, m => ` ${m}`)
    .trim()
    .replace(/^./, c => c.toUpperCase())
}

function subscoreSignals(subscores = {}) {
  const entries = Object.entries(subscores)
    .filter(([, value]) => typeof value === 'number')
    .map(([key, value]) => ({ key, value, label: readableSubscoreLabel(key) }))

  return {
    weak: entries.filter(item => item.value < 70).sort((a, b) => a.value - b.value).slice(0, 4),
    strong: entries.filter(item => item.value >= 75).sort((a, b) => b.value - a.value).slice(0, 4),
  }
}

function SignalList({ label, empty, items, variant }) {
  return (
    <div className="diag-signal-list">
      <span className="kicker">{label}</span>
      {items.length ? items.map(item => (
        <div key={item.key} className={`diag-signal-list__row diag-signal-list__row--${variant}`}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      )) : (
        <p className="caption">{empty}</p>
      )}
    </div>
  )
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

function VerdictTab({ citation, fix, sendFixToRewrite }) {
  const signals = subscoreSignals(citation?.subscores || {})
  return (
    <div className="vstack" style={{ gap: 'var(--s-6)' }}>
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
              <span className="subscore-item__label">{readableSubscoreLabel(key)}</span>
              <span className="subscore-item__value" data-tone={tone(value)}>{value}</span>
            </div>
          ))}
        </div>
        <div className="diag-signal-grid">
          <SignalList
            label="Fix First Signals"
            variant="danger"
            items={signals.weak}
            empty="No weak signal is currently below the action threshold."
          />
          <SignalList
            label="Citation Strengths"
            variant="ok"
            items={signals.strong}
            empty="No strong citation signal is above the confidence threshold yet."
          />
        </div>
      </section>

      <section className="section">
        <div className="section__head section__head--fix">
          <div className="section__head-titles">
            <span className="kicker">Highest-impact fix</span>
            <h2 className="h-2">{fix?.fix || 'A prioritized fix will appear after query scoring.'}</h2>
          </div>
          {fix?.failureMode && <StatPill tone="warn">{fix.failureMode}</StatPill>}
        </div>
        {fix ? (
          <div className="vstack" style={{ gap: 'var(--s-3)' }}>
            <div className="data-list">
              {fix.why && <div className="data-row"><span className="data-row__label">Why</span><span className="data-row__value">{fix.why}</span></div>}
              {fix.whereToEdit && <div className="data-row"><span className="data-row__label">Where to edit</span><span className="data-row__value">{fix.whereToEdit}</span></div>}
              {fix.exampleCopy && <div className="data-row"><span className="data-row__label">Suggested copy</span><span className="data-row__value">{fix.exampleCopy}</span></div>}
              {fix.expectedLift && Object.keys(fix.expectedLift).length > 0 && (
                <div className="data-row">
                  <span className="data-row__label">Expected lift</span>
                  <span className="data-row__value">
                    {Object.entries(fix.expectedLift).map(([k, v]) => `${readableSubscoreLabel(k)}: ${v}`).join(' · ') || '—'}
                  </span>
                </div>
              )}
              {fix.confidence && <div className="data-row"><span className="data-row__label">Confidence</span><span className="data-row__value">{fix.confidence}</span></div>}
            </div>
            <div className="hstack">
              <button type="button" className="btn btn--sm" onClick={sendFixToRewrite}>
                Send to Rewrite Help
              </button>
            </div>
          </div>
        ) : (
          <p className="caption">The fix generator needs a target query and retrieval result.</p>
        )}
      </section>
    </div>
  )
}

function AnswerPathTab({ retrieval, answer, chunks, evidenceOpen, setEvidenceOpen, minimapChunks, activeChunkId }) {
  const subscores = answer?.subscores || {}
  return (
    <div className="diag-shell">
      <div className="vstack" style={{ gap: 'var(--s-6)' }}>
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
                <span className="subscore-item__label">{readableSubscoreLabel(key)}</span>
                <span className="subscore-item__value" data-tone={tone(value)}>{value}</span>
              </div>
            ))}
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

function CompetitorMapTab({ competitorMap, competitor, competitorPosition, searchPresence, brandLabel }) {
  const marketSummary = competitorMap?.marketSummary
  return (
    <div className="vstack" style={{ gap: 'var(--s-6)' }}>
      <section className="section">
        <div className="section__head">
          <div className="section__head-titles">
            <span className="kicker">Competitor positioning</span>
            <h2 className="h-2">{competitorPosition.headline}</h2>
          </div>
          <StatPill tone={competitorPosition.tone === 'muted' ? 'plain' : competitorPosition.tone}>
            {competitorMap?.status === 'ok'
              ? `${competitorMap.competitors?.length || 0} domains · ${competitorMap.angleCount || 0} angles`
              : `Coverage · ${competitorPosition.coverage}`}
          </StatPill>
        </div>
        <p className="caption">{competitorPosition.detail}</p>

        {marketSummary && (
          <div className="market-summary-grid">
            <div className="market-summary-tile">
              <span className="kicker">Angles</span>
              <strong>{marketSummary.searchedAngles || '—'}</strong>
              <span>searched successfully</span>
            </div>
            <div className="market-summary-tile">
              <span className="kicker">Competitors</span>
              <strong>{marketSummary.visibleCompetitors ?? 0}</strong>
              <span>visible domains</span>
            </div>
            <div className="market-summary-tile market-summary-tile--wide">
              <span className="kicker">Recommended Move</span>
              <strong>{marketSummary.topLeader?.domain || 'No leader found'}</strong>
              <span>{marketSummary.recommendedMove || 'Run a Tavily-backed query to populate the market read.'}</span>
            </div>
          </div>
        )}

        <CompetitorMindmap data={competitorMap} brandLabel={brandLabel} />
      </section>

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
    </div>
  )
}

function ModelReadsTab({ verdicts, consensus, modelStatus }) {
  return (
    <div className="vstack" style={{ gap: 'var(--s-6)' }}>
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
        <div className="model-status-row">
          {(modelStatus || []).map(status => (
            <span key={status.model} className={`model-status-row__item model-status-row__item--${status.status === 'ok' ? 'ok' : 'danger'}`}>
              <span>{status.model}</span>
              <strong>{status.status === 'ok' ? 'Ready' : 'Failed'}</strong>
            </span>
          ))}
        </div>
        <div className="verdict-grid">
          {verdicts.map(v => (
            <article key={v.model} className="verdict-card">
              <div className="verdict-card__head">
                <span className="verdict-card__model">{v.model}</span>
                <span className="verdict-card__score" data-tone={tone(v.queryMatchScore)}>
                  {typeof v.queryMatchScore === 'number' ? v.queryMatchScore : '—'}
                </span>
              </div>
              {v.failureMode && <span className="kicker">{v.failureMode}</span>}
              {v.verdict && <p className="verdict-card__line">{v.verdict}</p>}
              {(v.topGap || v.suggestedFix) && (
                <details className="model-detail">
                  <summary>Read details</summary>
                  {v.topGap && <p className="verdict-card__line"><strong>Top gap:</strong> {v.topGap}</p>}
                  {v.suggestedFix && <p className="verdict-card__line"><strong>Fix:</strong> {v.suggestedFix}</p>}
                </details>
              )}
            </article>
          ))}
          {!verdicts.length && <p className="caption">No model verdicts were returned for this query.</p>}
        </div>
      </section>
    </div>
  )
}

function AnswerPathWithModels({
  retrieval, answer, chunks,
  evidenceOpen, setEvidenceOpen,
  minimapChunks, activeChunkId,
  verdicts, consensus, modelStatus,
}) {
  return (
    <div className="vstack" style={{ gap: 'var(--s-6)' }}>
      <AnswerPathTab
        retrieval={retrieval}
        answer={answer}
        chunks={chunks}
        evidenceOpen={evidenceOpen}
        setEvidenceOpen={setEvidenceOpen}
        minimapChunks={minimapChunks}
        activeChunkId={activeChunkId}
      />
      <ModelReadsTab verdicts={verdicts} consensus={consensus} modelStatus={modelStatus} />
    </div>
  )
}

export default function Diagnostics() {
  const navigate = useNavigate()
  const {
    hasFetched, hasQueryResults, queryAnalyzing,
    results, query, sendDraftToChat,
  } = useRun()

  const [activeTab, setActiveTab] = useState('verdict')

  const intelligence = results?.intelligence || {}
  const citation = intelligence.citationReadiness
  const retrieval = intelligence.retrieval
  const answer = intelligence.answerExtraction
  const competitor = intelligence.competitorIntelligence
  const competitorMap = intelligence.competitorMap
  const fix = intelligence.highestImpactFix
  const searchPresence = intelligence.searchPresence || competitor?.searchPresence
  const verdicts = results?.verdicts || []
  const modelStatus = results?.modelStatus || []
  const consensus = getModelConsensus(verdicts, modelStatus)
  const competitorPosition = getCompetitorPosition(competitor)
  const brandLabel = intelligence?.queryDiscovery?.brand
    || results?.intelligence?.queryDiscovery?.brand
    || (results?.url ? '' : 'Your page')

  const chunks = intelligence.chunks?.length ? intelligence.chunks : retrieval?.topChunks || []
  const minimapChunks = useMemo(() => (retrieval?.topChunks || []).slice(0, 24), [retrieval])
  const [activeChunkId, setActiveChunkId] = useState(minimapChunks[0]?.chunkId || '')
  const [evidenceOpen, setEvidenceOpen] = useState(false)

  useEffect(() => { setActiveChunkId(minimapChunks[0]?.chunkId || '') }, [minimapChunks])

  useEffect(() => {
    if (activeTab !== 'answer') return undefined
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
  }, [minimapChunks, activeTab])

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
          <div className="hstack" style={{ gap: 'var(--s-2)' }}>
            <button type="button" className="btn btn--sm" onClick={() => navigate('/')}>
              Back to Overview
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => {
                navigate('/')
                requestAnimationFrame(() => {
                  document.getElementById('query-input')?.focus()
                })
              }}
            >
              Add a query
            </button>
          </div>
        }
      />
    )
  }

  if (queryAnalyzing && !results) {
    return <LoadingBlock label="Running query test" lines={5} />
  }

  const sendFixToRewrite = () => {
    if (!fix) return
    const draft = [
      `Suggested fix: ${fix.fix || ''}`,
      fix.why ? `Why: ${fix.why}` : '',
      fix.whereToEdit ? `Where to edit: ${fix.whereToEdit}` : '',
      fix.exampleCopy ? `Example copy: ${fix.exampleCopy}` : '',
      'Format: issues + rewrite + expected score impact',
    ].filter(Boolean).join('\n')
    sendDraftToChat(draft)
    navigate('/rewrite')
  }

  const gap = typeof results?.gapScore === 'number' ? results.gapScore : null
  const gapLabel = typeof gap === 'number' ? `${gap >= 0 ? '+' : ''}${gap}` : '—'

  return (
    <div className="diag">
      <header className="diag-header">
        <div className="diag-header__line">
          <span className="kicker">Diagnostics</span>
          <span className="diag-header__query">Citation pipeline evidence and next fix.</span>
        </div>
        <div className="diag-header__metrics">
          {fix?.failureMode && <StatPill tone="warn">{fix.failureMode}</StatPill>}
          <span className="caption">Context, score, and answer gap stay pinned in the run header.</span>
          <button
            type="button"
            className="btn btn--sm"
            onClick={sendFixToRewrite}
            disabled={!fix}
          >
            Send fix to Rewrite
          </button>
        </div>
      </header>

      <nav className="diag-tabs" role="tablist" aria-label="Diagnostics sections">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`diag-panel-${tab.id}`}
            id={`diag-tab-${tab.id}`}
            className={`diag-tab${activeTab === tab.id ? ' diag-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div
        id={`diag-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`diag-tab-${activeTab}`}
        className="diag-panel"
      >
        {activeTab === 'verdict' && (
          <VerdictTab citation={citation} fix={fix} sendFixToRewrite={sendFixToRewrite} />
        )}
        {activeTab === 'answer' && (
          <AnswerPathWithModels
            retrieval={retrieval}
            answer={answer}
            chunks={chunks}
            evidenceOpen={evidenceOpen}
            setEvidenceOpen={setEvidenceOpen}
            minimapChunks={minimapChunks}
            activeChunkId={activeChunkId}
            verdicts={verdicts}
            consensus={consensus}
            modelStatus={modelStatus}
          />
        )}
        {activeTab === 'market' && (
          <CompetitorMapTab
            competitorMap={competitorMap}
            competitor={competitor}
            competitorPosition={competitorPosition}
            searchPresence={searchPresence}
            brandLabel={brandLabel || 'Your page'}
          />
        )}
      </div>
    </div>
  )
}
