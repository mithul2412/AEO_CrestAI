import { useEffect, useMemo, useState } from 'react'

const WIDTH = 860
const HEIGHT = 520
const CX = WIDTH / 2
const CY = HEIGHT / 2
const MIN_R = 92
const MAX_R = 218
const CANVAS_PAD = 48
const REPULSION_PASSES = 6
const LABEL_PAD = 22
const VISIBLE_CAP_DEFAULT = 8
const VISIBLE_CAP_MAX = 12

const TIER_ORDER = ['leader', 'challenger', 'niche', 'adjacent']

const TIER_META = {
  leader: { color: 'var(--ok)', label: 'Leader' },
  challenger: { color: 'var(--ink)', label: 'Challenger' },
  niche: { color: 'var(--warn)', label: 'Niche' },
  adjacent: { color: 'var(--muted)', label: 'Adjacent' },
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function polar(angle, radius) {
  return {
    x: CX + Math.cos(angle) * radius,
    y: CY + Math.sin(angle) * radius,
  }
}

function strongestAngleId(node) {
  if (node.strongestAngleId) return node.strongestAngleId
  return [...(node.appearances || [])].sort((a, b) => a.rank - b.rank)[0]?.angleId || null
}

function nodeLabel(domain = '') {
  return domain.length > 22 ? `${domain.slice(0, 21)}…` : domain
}

// Pairwise repulsion: 6 deterministic passes that push overlapping nodes apart by 25% of
// their overlap. No D3 dependency; cheap (O(n^2) on n<=12) and stable across renders.
function relaxNodes(nodes) {
  const result = nodes.map(node => ({ ...node }))
  for (let pass = 0; pass < REPULSION_PASSES; pass++) {
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i]
        const b = result[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
        const minDist = a.r + b.r + 8
        if (dist >= minDist) continue
        const overlap = (minDist - dist) * 0.25
        const ux = dx / dist
        const uy = dy / dist
        a.x -= ux * overlap
        a.y -= uy * overlap
        b.x += ux * overlap
        b.y += uy * overlap
      }
    }
  }
  return result.map(node => ({
    ...node,
    x: clamp(node.x, CANVAS_PAD, WIDTH - CANVAS_PAD),
    y: clamp(node.y, CANVAS_PAD, HEIGHT - CANVAS_PAD),
  }))
}

// Detect label-vs-node overlap to decide which labels need leader-line callouts.
function labelNeedsCallout(node, others) {
  const labelY = node.y + node.r + LABEL_PAD
  const labelHalfW = Math.min(80, node.domain.length * 4)
  for (const other of others) {
    if (other === node) continue
    const dx = Math.abs(other.x - node.x)
    const dy = Math.abs(other.y - labelY)
    if (dx < labelHalfW + other.r && dy < other.r + 14) return true
  }
  return false
}

// Place callout labels INSIDE the canvas at the side nearest the node, with text-anchor
// pointed back toward the centre so the text grows away from the edge (never clips out).
function calloutAnchor(node) {
  const goingRight = node.x >= CX
  return {
    x: goingRight ? WIDTH - 12 : 12,
    y: node.y,
    anchor: goingRight ? 'end' : 'start',
  }
}

function buildEmptyCopy(data) {
  if (data?.status === 'disabled') {
    return data.reason || 'Set TAVILY_API_KEY in backend/.env and run a query test to populate competitor positioning.'
  }
  if (data?.status === 'error') {
    return data.reason || 'Tavily search failed. Retry the query after checking the backend search configuration.'
  }
  return 'Run a query test to populate competitor positioning.'
}

export default function CompetitorMindmap({ data, brandLabel = 'Your page' }) {
  const [activeId, setActiveId] = useState(null)
  const [focusIdx, setFocusIdx] = useState(0)
  const [showAll, setShowAll] = useState(false)

  const totalCompetitors = (data?.competitors || []).length
  const visibleLimit = showAll ? VISIBLE_CAP_MAX : VISIBLE_CAP_DEFAULT

  const layout = useMemo(() => {
    if (!data || data.status !== 'ok') return null
    const angles = (data.angles || []).filter(angle => angle.status === 'ok').slice(0, 4)
    const competitors = (data.competitors || []).slice(0, visibleLimit)
    if (!angles.length || !competitors.length) return { angles, nodes: [], lanes: [] }

    const laneAngles = angles.map((angle, index) => {
      const count = angles.length
      const angleRad = count === 1
        ? 0
        : -Math.PI / 2 + index * ((Math.PI * 2) / count)
      const tip = polar(angleRad, MAX_R + 42)
      const label = polar(angleRad, MAX_R + 70)
      return {
        ...angle,
        angleRad,
        tip,
        label,
        vector: { x: Math.cos(angleRad), y: Math.sin(angleRad) },
        normal: { x: -Math.sin(angleRad), y: Math.cos(angleRad) },
      }
    })

    const laneById = Object.fromEntries(laneAngles.map(angle => [angle.angleId, angle]))
    const grouped = competitors.reduce((acc, competitor) => {
      const angleId = strongestAngleId(competitor) || laneAngles[0]?.angleId
      if (!acc[angleId]) acc[angleId] = []
      acc[angleId].push(competitor)
      return acc
    }, {})

    const initial = []
    Object.entries(grouped).forEach(([angleId, list]) => {
      const lane = laneById[angleId] || laneAngles[0]
      const ordered = [...list].sort((a, b) => b.presenceScore - a.presenceScore)
      ordered.forEach((competitor, index) => {
        const presence = clamp(Number(competitor.presenceScore) || 0, 0, 100)
        const distance = MIN_R + (1 - presence / 100) * (MAX_R - MIN_R)
        const offset = (index - (ordered.length - 1) / 2) * 30
        const point = {
          x: CX + lane.vector.x * distance + lane.normal.x * offset,
          y: CY + lane.vector.y * distance + lane.normal.y * offset,
        }
        const coverage = clamp(Number(competitor.coverage) || 0, 0, 1)
        const appearances = competitor.appearances?.length || 0
        initial.push({
          ...competitor,
          x: point.x,
          y: point.y,
          r: 11 + coverage * 7 + Math.min(appearances, 4) * 1.4,
          lane,
          tierMeta: TIER_META[competitor.tier] || TIER_META.adjacent,
        })
      })
    })

    const nodes = relaxNodes(initial)

    // Decide which labels are too crowded to render in-place and need a leader line.
    const decorated = nodes.map(node => ({
      ...node,
      labelMode: labelNeedsCallout(node, nodes) ? 'callout' : 'inline',
    }))

    return { angles: laneAngles, lanes: laneAngles, nodes: decorated }
  }, [data, visibleLimit])

  useEffect(() => {
    if (!layout?.nodes?.length) return
    const node = layout.nodes[focusIdx]
    if (node) setActiveId(node.id || node.domain)
  }, [focusIdx, layout])

  if (!layout) {
    return (
      <div className="mindmap-empty">
        <span className="kicker">Competitor Map</span>
        <h3 className="state-block__title">No market field yet</h3>
        <p className="caption">{buildEmptyCopy(data)}</p>
      </div>
    )
  }

  if (!layout.nodes.length) {
    return (
      <div className="mindmap-empty">
        <span className="kicker">Competitor Map</span>
        <h3 className="state-block__title">No visible competitors found</h3>
        <p className="caption">Tavily returned usable angle data, but no non-source domains were visible enough to map.</p>
      </div>
    )
  }

  const activeNode = layout.nodes.find(node => (node.id || node.domain) === activeId) || layout.nodes[0]
  const marketSummary = data.marketSummary || {}

  const handleKeyDown = event => {
    if (!layout.nodes.length) return
    if (['ArrowRight', 'ArrowDown'].includes(event.key)) {
      event.preventDefault()
      setFocusIdx(index => (index + 1) % layout.nodes.length)
    }
    if (['ArrowLeft', 'ArrowUp'].includes(event.key)) {
      event.preventDefault()
      setFocusIdx(index => (index - 1 + layout.nodes.length) % layout.nodes.length)
    }
  }

  return (
    <div
      className="mindmap mindmap--field"
      tabIndex={0}
      role="application"
      aria-label="Competitor market field"
      onKeyDown={handleKeyDown}
    >
      <div className="mindmap__topline">
        <div className="mindmap__market-read">
          <span className="kicker">Market Read</span>
          <strong>{marketSummary.visibleCompetitors ?? layout.nodes.length} visible domains</strong>
          <span>{marketSummary.recommendedMove || 'Hover a domain to inspect why it ranks here.'}</span>
        </div>
        <div className="mindmap__legend" aria-label="Tier legend">
          {TIER_ORDER.map(tier => (
            <span key={tier} className="mindmap__legend-item">
              <span className="mindmap__legend-dot" style={{ background: TIER_META[tier].color }} />
              {TIER_META[tier].label}
            </span>
          ))}
        </div>
      </div>

      <div className="mindmap__canvas-wrap">
        {totalCompetitors > VISIBLE_CAP_DEFAULT && (
          <button
            type="button"
            className="mindmap__cap-toggle"
            onClick={() => setShowAll(value => !value)}
            aria-pressed={showAll}
          >
            {showAll ? `Show top ${VISIBLE_CAP_DEFAULT}` : `Show all ${Math.min(totalCompetitors, VISIBLE_CAP_MAX)}`}
          </button>
        )}
        <svg className="mindmap__svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Competitor market positioning">
          <defs>
            <radialGradient id="marketHubGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {[80, 60, 40].map(score => {
            const radius = MIN_R + (1 - score / 100) * (MAX_R - MIN_R)
            return (
              <g key={score}>
                <circle cx={CX} cy={CY} r={radius} fill="none" stroke="var(--line)" strokeDasharray="2 6" />
                <text x={CX + radius + 5} y={CY - 5} className="mindmap__ring-label">{score}</text>
              </g>
            )
          })}

          {layout.lanes.map(lane => (
            <g key={lane.angleId}>
              <line
                x1={CX}
                y1={CY}
                x2={lane.tip.x}
                y2={lane.tip.y}
                stroke="var(--line-strong)"
                strokeDasharray="5 8"
              />
              <text
                x={lane.label.x}
                y={lane.label.y - 6}
                textAnchor={lane.label.x > CX + 12 ? 'start' : lane.label.x < CX - 12 ? 'end' : 'middle'}
                className="mindmap__lane-label"
              >
                {lane.angleLabel}
              </text>
              <text
                x={lane.label.x}
                y={lane.label.y + 10}
                textAnchor={lane.label.x > CX + 12 ? 'start' : lane.label.x < CX - 12 ? 'end' : 'middle'}
                className="mindmap__lane-query"
              >
                {(lane.angleQuery || '').length > 34 ? `${lane.angleQuery.slice(0, 33)}…` : lane.angleQuery}
              </text>
            </g>
          ))}

          <circle cx={CX} cy={CY} r={54} fill="url(#marketHubGlow)" />
          <circle cx={CX} cy={CY} r={34} fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" />
          <text x={CX} y={CY - 5} textAnchor="middle" className="mindmap__hub-kicker">YOU</text>
          <text x={CX} y={CY + 12} textAnchor="middle" className="mindmap__hub-label">{brandLabel}</text>

          {layout.nodes.map((node, index) => {
            const id = node.id || node.domain
            const isActive = id === (activeNode.id || activeNode.domain)
            const opacity = isActive ? 1 : 0.42
            return (
              <g
                key={id}
                className="mindmap__node-group"
                opacity={opacity}
                tabIndex={0}
                role="button"
                aria-label={`${node.domain}, ${node.tierLabel}, presence ${node.presenceScore}`}
                onMouseEnter={() => { setActiveId(id); setFocusIdx(index) }}
                onFocus={() => { setActiveId(id); setFocusIdx(index) }}
              >
                <line
                  x1={CX}
                  y1={CY}
                  x2={node.x}
                  y2={node.y}
                  stroke={node.tierMeta.color}
                  strokeOpacity={isActive ? 0.48 : 0.18}
                  strokeWidth={isActive ? 2 : 1}
                />
                {(node.strengths || []).slice(0, 2).map((_, strengthIndex) => {
                  const angle = (Math.PI * 2 * strengthIndex) / 2 - Math.PI / 4
                  return (
                    <circle
                      key={strengthIndex}
                      cx={node.x + Math.cos(angle) * (node.r + 8)}
                      cy={node.y + Math.sin(angle) * (node.r + 8)}
                      r="3"
                      fill={node.tierMeta.color}
                    />
                  )
                })}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.r + (isActive ? 4 : 0)}
                  fill="var(--paper)"
                  stroke={node.tierMeta.color}
                  strokeWidth={isActive ? 3 : 2}
                />
                <text x={node.x} y={node.y - 1} textAnchor="middle" className="mindmap__node-score" fill={node.tierMeta.color}>
                  {node.presenceScore}
                </text>
                <text x={node.x} y={node.y + 13} textAnchor="middle" className="mindmap__node-rank">
                  #{node.bestRank ?? '—'}
                </text>
                {node.labelMode === 'inline' ? (
                  <text x={node.x} y={node.y + node.r + 18} textAnchor="middle" className="mindmap__node-label">
                    {nodeLabel(node.domain)}
                  </text>
                ) : (() => {
                  const anchor = calloutAnchor(node)
                  return (
                    <>
                      <line
                        className="mindmap__leader-line"
                        x1={node.x + (node.x >= CX ? node.r : -node.r)}
                        y1={node.y}
                        x2={anchor.x + (anchor.anchor === 'end' ? -2 : 2)}
                        y2={anchor.y}
                      />
                      <text
                        className="mindmap__leader-label"
                        x={anchor.x}
                        y={anchor.y + 4}
                        textAnchor={anchor.anchor}
                      >
                        {nodeLabel(node.domain)}
                      </text>
                    </>
                  )
                })()}
              </g>
            )
          })}
        </svg>

        <RationaleCard node={activeNode} marketSummary={marketSummary} />
      </div>

      <div className="mindmap__mobile-list" aria-label="Competitor list">
        {layout.nodes.map((node, index) => {
          const id = node.id || node.domain
          return (
            <button
              key={id}
              type="button"
              className={`mindmap__mobile-item${id === (activeNode.id || activeNode.domain) ? ' active' : ''}`}
              onClick={() => { setActiveId(id); setFocusIdx(index) }}
            >
              <span>{node.domain}</span>
              <strong>{node.presenceScore}</strong>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RationaleCard({ node, marketSummary }) {
  if (!node) return null
  return (
    <aside className="mindmap__rationale" aria-live="polite">
      <header className="mindmap__rationale-head">
        <span className="kicker">{node.tierLabel || node.tierMeta?.label}</span>
        <strong className="mindmap__rationale-domain" translate="no">{node.domain}</strong>
        <a href={node.url} target="_blank" rel="noreferrer" className="mindmap__rationale-link">Open ↗</a>
      </header>
      <div className="mindmap__rationale-meta">
        <span><strong>{node.presenceScore}</strong> presence</span>
        <span>best #{node.bestRank ?? '—'}</span>
        <span>{node.appearances?.length || 0} angles</span>
      </div>
      <p className="mindmap__rationale-why">{node.rankReason || node.whyHere}</p>
      {node.snippetPreview && <p className="mindmap__snippet">{node.snippetPreview}</p>}
      {node.strengths?.length > 0 && (
        <ul className="mindmap__rationale-strengths">
          {node.strengths.map((strength, index) => <li key={index}>{strength}</li>)}
        </ul>
      )}
      <div className="mindmap__rationale-angles">
        <span className="kicker">Angle ranks</span>
        {(node.appearances || []).slice(0, 5).map(appearance => (
          <div key={`${appearance.angleId}-${appearance.url}`} className="mindmap__rationale-angle">
            <span className="mindmap__rationale-angle-label">{appearance.angleLabel}</span>
            <span className="mono">#{appearance.rank}</span>
          </div>
        ))}
      </div>
      {marketSummary?.sourceDomainPresence && (
        <p className="mindmap__source-note">{marketSummary.sourceDomainPresence}</p>
      )}
    </aside>
  )
}
