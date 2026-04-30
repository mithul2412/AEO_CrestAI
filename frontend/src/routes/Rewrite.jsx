import Chat from '../components/Chat.jsx'
import { useRun } from '../state/RunContext.jsx'
import { LockedBlock } from '../components/primitives/StateBlocks.jsx'

export default function Rewrite() {
  const { hasFetched, markdown, query, results, chatDraft } = useRun()

  if (!hasFetched) {
    return (
      <LockedBlock
        title="Rewrite Help needs a fetched page"
        copy="Fetch a URL from Overview to load context for the chat."
      />
    )
  }

  const stage = results?.verdicts?.length
    ? 'post-verdict'
    : query.trim()
      ? 'post-query'
      : 'post-fetch'

  return (
    <section className="section">
      <div className="section__head">
        <div className="section__head-titles">
          <span className="kicker">Rewrite Help</span>
          <h2 className="h-2">Turn the diagnosis into better page copy.</h2>
        </div>
      </div>
      <Chat
        markdown={markdown}
        stage={stage}
        query={query.trim()}
        draft={chatDraft.text}
        draftToken={chatDraft.token}
      />
    </section>
  )
}
