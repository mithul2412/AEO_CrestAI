import { useId, useState } from 'react'
import {
  getAnswerGapCopy,
  getBlockedPageState,
  getCompetitorPosition,
  getExecutiveQueryVerdict,
  getFixFirstCopy,
  getModelConsensus,
  getTechnicalLabel,
} from '../utils/diagnosticBrief.js'

function toneClass(tone) {
  return tone ? ` diagnostic-brief--${tone}` : ''
}

function formatScore(value) {
  return typeof value === 'number' ? value : '--'
}

function Metric({ label, value, detail, tone = 'muted' }) {
  return (
    <div className={`brief-metric brief-metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  )
}

function RacewayBar({ label, value }) {
  const width = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : 0
  return (
    <div className="raceway-row">
      <span>{label}</span>
      <div className="raceway-track" aria-hidden="true">
        <div className="raceway-fill" style={{ width: `${width}%` }} />
      </div>
      <strong>{formatScore(value)}</strong>
    </div>
  )
}

function getChunkScore(chunk) {
  if (!chunk) return null
  if (typeof chunk.retrievalScore === 'number') return chunk.retrievalScore
  if (typeof chunk.similarity === 'number') return Math.round(chunk.similarity * 100)
  return null
}

export default function DiagnosticBrief({
  results,
  markdown,
  pageIntelligence,
  query,
  normalizedUrl,
  onSendToRewrite,
}) {
  const [technicalOpen, setTechnicalOpen] = useState(false)
  const drawerId = useId()

  if (!results || results.queryScore == null) return null

  const intelligence = results.intelligence || {}
  const blockedState = getBlockedPageState(pageIntelligence, markdown)
  const gapScore = results.gapScore ?? (
    typeof results.contentScore === 'number' && typeof results.queryScore === 'number'
      ? results.contentScore - results.queryScore
      : null
  )
  const queryVerdict = getExecutiveQueryVerdict({
    queryScore: results.queryScore,
    gapScore,
    blockedState,
  })
  const answerGap = getAnswerGapCopy(gapScore)
  const fixCopy = getFixFirstCopy({
    fix: intelligence.highestImpactFix,
    verdicts: results.verdicts || [],
    blockedState,
  })
  const competitor = intelligence.competitorIntelligence || {}
  const competitorPosition = getCompetitorPosition(competitor)
  const consensus = getModelConsensus(results.verdicts || [], results.modelStatus || [])
  const userTopScore = getChunkScore(competitor.gap?.userTopChunk)
  const competitorTopScore = getChunkScore(competitor.gap?.competitorTopChunk)
  const scanType = blockedState.isBlocked ? 'limited gate page' : 'normal'
  const schemaTypes = pageIntelligence?.extraction?.schemaTypes || []
  const preview = markdown
    ? markdown.split('\n').filter(Boolean).slice(0, 10).join('\n')
    : 'No raw content preview is available.'

  return (
    <section className={`diagnostic-brief${blockedState.isBlocked ? ' diagnostic-brief--blocked' : ''}`} aria-label="Diagnostic brief">
      <div className={`diagnostic-brief-zone diagnostic-brief-zone-a${toneClass(queryVerdict.tone)}`}>
        <div className="brief-zone-copy">
          <div className="section-kicker">Summary / Query verdict</div>
          <h2>{queryVerdict.title}</h2>
          <p>{queryVerdict.meaning}</p>
          <strong>{queryVerdict.next}</strong>
        </div>
        <div className="brief-score-stack">
          <Metric
            label={blockedState.scoreLabel}
            value={formatScore(results.queryScore)}
            detail={blockedState.isBlocked ? 'Not content readiness' : 'What the target query can extract'}
            tone={queryVerdict.tone}
          />
          <Metric
            label={getTechnicalLabel('gapScore')}
            value={typeof gapScore === 'number' ? `${gapScore >= 0 ? '+' : ''}${gapScore}` : '--'}
            detail={answerGap.label}
            tone={answerGap.tone}
          />
        </div>
      </div>

      <div className="diagnostic-brief-zone diagnostic-brief-zone-b">
        <div className="brief-zone-copy">
          <div className="section-kicker">Fix First</div>
          <h3>{fixCopy.headline}</h3>
          <p>{fixCopy.reason}</p>
          {fixCopy.failureMode && <span className="summary-pill muted">{fixCopy.failureMode}</span>}
        </div>
        <button
          type="button"
          className="context-primary-action brief-action"
          onClick={() => onSendToRewrite?.(fixCopy.draft)}
        >
          Send to Rewrite Help
        </button>
      </div>

      {!blockedState.isBlocked && (
        <div className="diagnostic-brief-zone diagnostic-brief-zone-c">
          <div className="brief-zone-copy">
            <div className="section-kicker">Competitor Position</div>
            <h3>{competitorPosition.headline}</h3>
            <p>{competitorPosition.detail}</p>
          </div>
          <div className="competitor-coverage-panel">
            <span className="summary-pill muted">Coverage: {competitorPosition.coverage}</span>
            <span className={`summary-pill ${competitorPosition.tone}`}>
              {typeof competitorPosition.delta === 'number'
                ? `${competitorPosition.delta > 0 ? '+' : ''}${competitorPosition.delta} delta`
                : 'No delta'}
            </span>
            <div className="raceway-stack">
              <RacewayBar label="Your top answer path" value={userTopScore} />
              <RacewayBar label="Best readable competitor" value={competitorTopScore} />
            </div>
          </div>
        </div>
      )}

      <div className="diagnostic-brief-technical">
        <button
          type="button"
          className="details-header evidence-disclosure-trigger technical-score-trigger"
          aria-expanded={technicalOpen}
          aria-controls={drawerId}
          onClick={() => setTechnicalOpen(value => !value)}
        >
          <div>
            <div className="details-heading">Technical Diagnostics</div>
            <div className="details-subheading">Scores, model notes, competitor detail, and raw evidence.</div>
          </div>
          <span className={`checks-chevron${technicalOpen ? ' open' : ''}`}>v</span>
        </button>

        {technicalOpen && (
          <div id={drawerId} role="region" aria-label="Technical Diagnostics" className="diagnostic-technical-body">
            <div className="brief-context-strip">
              <span title={query || 'No target query'}>Query: {query || 'No target query'}</span>
              <span>Scan type: {scanType}</span>
              <span title={normalizedUrl || 'No source URL'}>{normalizedUrl || 'No source URL'}</span>
            </div>

            <div className="brief-technical-grid">
              <Metric label={getTechnicalLabel('contentScore')} value={formatScore(results.contentScore)} detail="Page checks" tone="muted" />
              <Metric label={getTechnicalLabel('geuScore')} value={formatScore(results.geuScore)} detail="Reusable answer signals" tone="muted" />
              <Metric label={getTechnicalLabel('llmContentScore')} value={formatScore(results.llmContentScore)} detail="Baseline model read" tone="muted" />
              <Metric label={getTechnicalLabel('queryScore')} value={formatScore(results.queryScore)} detail="Target query fit" tone="muted" />
            </div>

            <div className="brief-technical-section">
              <div className="details-heading">Model verdicts</div>
              <span className={`summary-pill ${consensus.tier}`}>{consensus.label}</span>
              <div className="brief-model-list">
                {(results.verdicts || []).map(verdict => (
                  <article key={verdict.model} className="brief-model-card">
                    <div className="brief-model-card-head">
                      <strong>{verdict.model}</strong>
                      <span>{formatScore(verdict.queryMatchScore)}</span>
                    </div>
                    <small>{verdict.failureMode || 'Failure mode unavailable'}</small>
                    {verdict.verdict && <p>{verdict.verdict}</p>}
                    {verdict.topGap && <p><strong>Top gap:</strong> {verdict.topGap}</p>}
                    {verdict.suggestedFix && <p><strong>Suggested fix:</strong> {verdict.suggestedFix}</p>}
                  </article>
                ))}
              </div>
            </div>

            <div className="brief-technical-section">
              <div className="details-heading">Evidence digest</div>
              <div className="fetch-signal-digest">
                <span>Title: {pageIntelligence?.extraction?.title || 'Missing'}</span>
                <span>Words: {(pageIntelligence?.extraction?.wordCount || 0).toLocaleString()}</span>
                <span>Access: {blockedState.label}</span>
                <span>Schema: {schemaTypes.length ? schemaTypes.join(', ') : 'None detected'}</span>
              </div>
              <pre className="brief-raw-preview">{preview}</pre>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
