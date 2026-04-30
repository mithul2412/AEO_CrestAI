import { Link } from 'react-router-dom'
import Wordmark from './Wordmark.jsx'
import { useRun } from '../../state/RunContext.jsx'

function ThemeIcon({ theme }) {
  if (theme === 'dark') {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M12 4.5V2.2M12 21.8v-2.3M4.5 12H2.2M21.8 12h-2.3M6.7 6.7 5.1 5.1M18.9 18.9l-1.6-1.6M17.3 6.7l1.6-1.6M5.1 18.9l1.6-1.6" />
        <circle cx="12" cy="12" r="4.2" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24">
      <path d="M20.2 15.2A7.7 7.7 0 0 1 8.8 3.8 8.7 8.7 0 1 0 20.2 15.2Z" />
    </svg>
  )
}

export default function TopBar() {
  const { theme, setTheme, hasFetched, startNewTest } = useRun()
  const isDark = theme === 'dark'

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <Link to="/" aria-label="Crest.ai home" style={{ display: 'inline-flex' }}>
          <Wordmark />
        </Link>
      </div>
      <div className="topbar-actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={startNewTest}
          disabled={!hasFetched}
        >
          New test
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
        >
          <ThemeIcon theme={theme} />
        </button>
      </div>
    </header>
  )
}
