import AgenticReadinessPanel from '../components/AgenticReadinessPanel.jsx'
import { useRun } from '../state/RunContext.jsx'
import { LockedBlock } from '../components/primitives/StateBlocks.jsx'

export default function Agentic() {
  const { hasFetched, hasBaseline, url, markdown, query, activeResults, sourceSignals } = useRun()

  if (!hasFetched) {
    return (
      <LockedBlock
        title="Agentic Layer needs a fetched page"
        copy="Fetch a URL from Overview to generate the AI-readable infrastructure layer."
      />
    )
  }

  if (!hasBaseline) {
    return (
      <LockedBlock
        title="Waiting for baseline"
        copy="The agentic generator runs after the baseline read completes."
      />
    )
  }

  return (
    <section className="section">
      <div className="section__head">
        <div className="section__head-titles">
          <span className="kicker">Agentic Layer</span>
          <h2 className="h-2">Generate the AI-readable infrastructure layer.</h2>
        </div>
      </div>
      <AgenticReadinessPanel
        url={url}
        markdown={markdown}
        query={query}
        analysis={activeResults}
        sourceSignals={sourceSignals}
      />
    </section>
  )
}
