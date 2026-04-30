import { NavLink } from 'react-router-dom'
import { useRun } from '../../state/RunContext.jsx'

const Icon = {
  overview: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="2" width="5" height="5" />
      <rect x="9" y="2" width="5" height="5" />
      <rect x="2" y="9" width="5" height="5" />
      <rect x="9" y="9" width="5" height="5" />
    </svg>
  ),
  source: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 4h12M2 8h12M2 12h8" />
    </svg>
  ),
  diagnostics: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 13l3-6 2 3 4-7 3 10" />
    </svg>
  ),
  rewrite: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 13l-1 1 1-4 8-8 3 3-8 8z" />
    </svg>
  ),
  agentic: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="5" />
      <path d="M8 3v10M3 8h10" />
    </svg>
  ),
}

export default function NavRail() {
  const { hasFetched, hasBaseline, hasQueryResults, contentAnalyzing, queryAnalyzing, error } = useRun()

  const sourceState = !hasFetched ? '—'
    : (error && !hasBaseline) ? 'error'
    : hasFetched ? 'ready' : '—'
  const diagState = !hasFetched ? '—'
    : queryAnalyzing ? 'running'
    : hasQueryResults ? 'ready'
    : 'locked'
  const overviewState = !hasFetched ? '—'
    : contentAnalyzing ? 'running'
    : hasBaseline ? 'ready' : '—'
  const rewriteState = !hasFetched ? '—' : 'ready'
  const agenticState = !hasFetched ? '—' : hasBaseline ? 'ready' : 'locked'

  const items = [
    { to: '/', icon: Icon.overview, label: 'Overview', state: overviewState, end: true },
    { to: '/source', icon: Icon.source, label: 'Source', state: sourceState },
    { to: '/diagnostics', icon: Icon.diagnostics, label: 'Diagnostics', state: diagState },
    { to: '/rewrite', icon: Icon.rewrite, label: 'Rewrite Help', state: rewriteState },
    { to: '/agentic', icon: Icon.agentic, label: 'Agentic Layer', state: agenticState },
  ]

  return (
    <nav className="navrail" aria-label="Workspace navigation">
      {items.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `navrail__item${isActive ? ' active' : ''}`}
          title={item.label}
        >
          <span className="navrail__item-icon">{item.icon}</span>
          <span className="navrail__item-label">{item.label}</span>
          <span className="navrail__item-state">{item.state}</span>
        </NavLink>
      ))}
    </nav>
  )
}
