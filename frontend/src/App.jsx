import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AppShell from './components/shell/AppShell.jsx'
import { RunProvider } from './state/RunContext.jsx'
import Overview from './routes/Overview.jsx'
import Source from './routes/Source.jsx'
import Diagnostics from './routes/Diagnostics.jsx'
import Rewrite from './routes/Rewrite.jsx'
import Agentic from './routes/Agentic.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <RunProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Overview />} />
            <Route path="source" element={<Source />} />
            <Route path="diagnostics" element={<Diagnostics />} />
            <Route path="rewrite" element={<Rewrite />} />
            <Route path="agentic" element={<Agentic />} />
          </Route>
        </Routes>
      </RunProvider>
    </BrowserRouter>
  )
}
