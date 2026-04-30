import Chat from '../components/Chat.jsx'
import { useRun } from '../state/RunContext.jsx'
import { LockedBlock } from '../components/primitives/StateBlocks.jsx'

export default function Rewrite() {
  const { hasFetched, markdown, query, results, chatDraft, pageIntelligence, querySuggestions, querySuggestionsLoading, demoMode } = useRun()

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
  const fix = results?.intelligence?.highestImpactFix
  const fixSource = fix?.fallback
    ? 'Fallback fix'
    : fix?.model
      ? fix.model
      : fix?.source === 'model-verdict'
        ? 'Model verdict'
        : ''

  return (
    <Chat
      markdown={markdown}
      stage={stage}
      query={query.trim()}
      draft={chatDraft.text}
      draftToken={chatDraft.token}
      pageIntelligence={pageIntelligence}
      fixSource={fixSource}
      querySuggestions={querySuggestions}
      querySuggestionsLoading={querySuggestionsLoading}
      readOnly={demoMode}
    />
  )
}
