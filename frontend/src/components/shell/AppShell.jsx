import { Outlet, useLocation } from 'react-router-dom'
import TopBar from './TopBar.jsx'
import RunHeader from './RunHeader.jsx'
import NavRail from './NavRail.jsx'
import { useRun } from '../../state/RunContext.jsx'

export default function AppShell() {
  const { hasFetched } = useRun()
  const { pathname } = useLocation()

  if (!hasFetched) {
    return (
      <div className="shell shell--no-runheader">
        <TopBar />
        <div className="focus">
          <Outlet />
        </div>
      </div>
    )
  }

  const wide = pathname.startsWith('/diagnostics')

  return (
    <div className="shell">
      <TopBar />
      <RunHeader />
      <NavRail />
      <main className="main">
        <div className={`main__content${wide ? ' main__content--wide' : ''}`}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
