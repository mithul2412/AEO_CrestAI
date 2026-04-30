import { useEffect, useRef, useState } from 'react'
import { readApiError } from '../utils/api.js'
import WanderingEyes from './WanderingEyes.jsx'

const MODELS = [
  { id: 'Qwen 3.6 Plus', label: 'Qwen', className: 'qwen' },
  { id: 'Nemotron 120B', label: 'Nemotron', className: 'nemotron' },
  { id: 'GPT OSS 120B', label: 'GPT OSS', className: 'gptoss' }
]

const STAGE_SUGGESTIONS = {
  'post-fetch': [
    'What AI usability signals are missing from this content?',
    'What is the biggest content gap?',
    'What structured data is missing?',
  ],
  'post-query': [
    'How do I improve my query match score?',
    'What is the biggest content gap?',
    'Rewrite the intro for direct answer-first style.',
  ],
  'post-verdict': [
    'What single fix would improve both model scores?',
    'Turn topGap into a replacement paragraph (120 words).',
    'Prioritize fixes by impact and effort.',
  ]
}

const STAGE_META = {
  'post-fetch': {
    eyebrow: 'Context loaded',
    title: 'Ask for rewrite help from the current page context.',
  },
  'post-query': {
    eyebrow: 'Query in focus',
    title: 'Rewrite against the exact question.',
  },
  'post-verdict': {
    eyebrow: 'Fix First ready',
    title: 'Turn the weakest section into a rewrite.',
  }
}

function renderInline(str, keyBase) {
  const parts = []
  let keyIndex = 0
  const pattern = /(\*\*(.+?)\*\*|`(.+?)`)/g
  let last = 0
  let match

  while ((match = pattern.exec(str)) !== null) {
    if (match.index > last) parts.push(str.slice(last, match.index))
    if (match[0].startsWith('**')) {
      parts.push(<strong key={`${keyBase}-s${keyIndex++}`}>{match[2]}</strong>)
    } else {
      parts.push(
        <code key={`${keyBase}-s${keyIndex++}`} className="chat-inline-code">
          {match[3]}
        </code>
      )
    }
    last = match.index + match[0].length
  }

  if (last < str.length) parts.push(str.slice(last))
  return parts.length > 0 ? parts : [str]
}

function renderStructured(text) {
  const lines = text.split('\n')
  const elements = []
  let listItems = []
  let listType = null
  let keyIndex = 0

  const flushList = () => {
    if (listItems.length === 0) return
    const Tag = listType === 'ol' ? 'ol' : 'ul'
    elements.push(
      <Tag key={keyIndex++} className="chat-rich-list">
        {listItems.map((item, itemIndex) => (
          <li key={itemIndex}>{renderInline(item, `li-${keyIndex}-${itemIndex}`)}</li>
        ))}
      </Tag>
    )
    listItems = []
    listType = null
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      continue
    }

    if (/^#{1,3}\s/.test(trimmed)) {
      flushList()
      const heading = trimmed.replace(/^#{1,3}\s+/, '')
      elements.push(
        <div key={keyIndex++} className="chat-rich-heading">
          {heading}
        </div>
      )
      continue
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)/)
    if (unorderedMatch) {
      if (listType === 'ol') flushList()
      listType = 'ul'
      listItems.push(unorderedMatch[1])
      continue
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)/)
    if (orderedMatch) {
      if (listType === 'ul') flushList()
      listType = 'ol'
      listItems.push(orderedMatch[1])
      continue
    }

    flushList()
    elements.push(<p key={keyIndex++} className="chat-rich-paragraph">{renderInline(trimmed, `p-${keyIndex}`)}</p>)
  }

  flushList()
  return elements
}

function TypingBubble({ label, modelClass }) {
  return (
    <div className="msg-model-wrap typing-wrap">
      <span className={`msg-model-label ${modelClass}`}>{label}</span>
      <div className="typing-indicator">
        <WanderingEyes className="wandering-eyes-chat" title={`${label} is thinking`} />
        <span>Thinking through the page...</span>
      </div>
    </div>
  )
}

function ModelResponse({ model, response }) {
  if (!response || response.status === 'pending') {
    return <TypingBubble label={model.id} modelClass={model.className} />
  }

  if (response.status === 'err') {
    return (
      <div className={`chat-response-pane ${model.className} error`}>
        <div className="chat-response-pane-head">
          <span className={`msg-model-label ${model.className}`}>{model.id}</span>
        </div>
        <div className="chat-response-error">
          {response.error || 'No response returned for this model.'}
        </div>
      </div>
    )
  }

  return (
    <div className={`chat-response-pane ${model.className}`}>
      <div className="chat-response-pane-head">
        <span className={`msg-model-label ${model.className}`}>{model.id}</span>
        <button
          className="chat-copy-btn"
          onClick={() => navigator.clipboard?.writeText(response.content)}
          title="Copy response"
        >
          Copy
        </button>
      </div>
      <div className={`msg-bubble msg-${model.className}`}>
        {renderStructured(response.content)}
      </div>
    </div>
  )
}

function emptyResponses() {
  return MODELS.reduce((accumulator, model) => {
    accumulator[model.id] = { status: 'pending' }
    return accumulator
  }, {})
}

function mapApiResponses(responses = []) {
  return MODELS.reduce((accumulator, model) => {
    const found = responses.find(response => response.model === model.id)
    accumulator[model.id] = found
      ? { status: 'ok', content: found.response }
      : { status: 'err', error: 'Model did not respond.' }
    return accumulator
  }, {})
}

function stageLabel(stage) {
  return {
    'post-fetch': 'Baseline',
    'post-query': 'Query Draft',
    'post-verdict': 'Fix First',
  }[stage] || 'Workspace'
}

export default function Chat({
  markdown,
  stage = 'post-fetch',
  query = '',
  draft = '',
  draftToken = 0,
  pageIntelligence = null,
  fixSource = '',
}) {
  const [turns, setTurns] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [showTemplate, setShowTemplate] = useState(false)
  const [viewModel, setViewModel] = useState(MODELS[0].className)
  const [draftNotice, setDraftNotice] = useState('')
  const bottomRef = useRef(null)

  const chips = STAGE_SUGGESTIONS[stage] || STAGE_SUGGESTIONS['post-fetch']
  const stageMeta = STAGE_META[stage] || STAGE_META['post-fetch']
  const promptTemplate = `Goal: improve ${query || '<target query>'}\nScope: <section of page>\nFormat: issues + rewrite + expected score impact`

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, sending])

  useEffect(() => {
    if (!draftToken || !draft) return
    setInput(draft)
    setDraftNotice('Draft loaded from verdict')
  }, [draft, draftToken])

  const sendMessage = async (text) => {
    const userText = text || input.trim()
    if (!userText || sending) return

    setInput('')
    setError('')

    const turnId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const newTurn = { id: turnId, prompt: userText, responses: emptyResponses() }
    setTurns(prev => [...prev, newTurn])
    setSending(true)

    try {
      const history = turns.flatMap(turn => {
        const messages = [{ role: 'user', content: turn.prompt }]
        const modelResponses = MODELS
          .map(model => {
            const response = turn.responses[model.id]
            return response?.status === 'ok' && response.content
              ? `${model.id}: ${response.content}`
              : ''
          })
          .filter(Boolean)
        if (modelResponses.length > 0) {
          messages.push({ role: 'assistant', content: modelResponses.join('\n\n') })
        }
        return messages
      })
      history.push({ role: 'user', content: userText })

      const res = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, markdown, query, pageIntelligence })
      })

      if (!res.ok) {
        throw new Error(await readApiError(res, `Chat error: ${res.status}`))
      }

      const data = await res.json()
      const mapped = mapApiResponses(data.responses || [])
      setTurns(prev => prev.map(turn => turn.id === turnId ? { ...turn, responses: mapped } : turn))
    } catch (e) {
      const errorResponses = MODELS.reduce((accumulator, model) => {
        accumulator[model.id] = { status: 'err', error: e.message }
        return accumulator
      }, {})
      setTurns(prev => prev.map(turn => turn.id === turnId ? { ...turn, responses: errorResponses } : turn))
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  const activeModel = MODELS.find(model => model.className === viewModel) || MODELS[0]
  const hasTurns = turns.length > 0
  const hasAnyResponse = turns.some(turn =>
    Object.values(turn.responses || {}).some(response => response?.status === 'ok')
  )

  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <div className="chat-panel-header-left">
          <span className="chat-panel-dot" />
          <div className="chat-panel-title-wrap">
            <span className="chat-panel-title">Rewrite Help</span>
            <span className="chat-panel-subtitle">
              {stageMeta.eyebrow}{query ? ` · ${query.length > 60 ? `${query.slice(0, 57)}…` : query}` : ''}
            </span>
          </div>
        </div>
        {hasAnyResponse && (
          <div className="chat-panel-header-right">
            <div className="model-seg-ctrl" role="group" aria-label="Select model">
              {MODELS.map(model => (
                <button
                  key={model.id}
                  type="button"
                  className={`model-seg-btn${viewModel === model.className ? ` active ${model.className}` : ''}`}
                  onClick={() => setViewModel(model.className)}
                >
                  {model.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="chat-context-strip">
        <div>
          <span className="kicker">Query</span>
          <strong>{query || 'No target query yet'}</strong>
        </div>
        <div>
          <span className="kicker">Stage</span>
          <strong>{stageLabel(stage)}</strong>
        </div>
        <div>
          <span className="kicker">Fix Source</span>
          <strong>{fixSource || (draft ? 'Diagnostics draft' : 'Chat prompt')}</strong>
        </div>
      </div>

      {!hasTurns && (
        <div className="chat-panel-chips">
          {chips.map(chip => (
            <button key={chip} className="chat-panel-chip" onClick={() => sendMessage(chip)}>
              {chip}
            </button>
          ))}
        </div>
      )}

      {hasTurns && (
        <div className="chat-turns">
          {turns.map(turn => (
            <div key={turn.id} className="chat-turn-card">
              <div className="chat-turn-prompt">
                <div className="chat-turn-label">Prompt</div>
                <div className="msg-bubble msg-user">{turn.prompt}</div>
              </div>

              <div className="chat-turn-response">
                <div className="chat-turn-label">Response</div>
                <div className="chat-single-model">
                  <ModelResponse
                    key={`${turn.id}-${activeModel.id}`}
                    model={activeModel}
                    response={turn.responses[activeModel.id]}
                  />
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {showTemplate && (
        <div className="prompt-formula-card compact">
          <div className="prompt-formula-title">Prompt template</div>
          <pre className="prompt-formula-code">{promptTemplate}</pre>
          <button className="chip" type="button" onClick={() => setInput(promptTemplate)}>
            Insert
          </button>
        </div>
      )}

      {error && <div className="error-bar">{error}</div>}
      {draftNotice && <div className="chat-prefill-note">{draftNotice}</div>}

      <div className="chat-input-row">
        <input
          id="chat-input"
          className="chat-input"
          placeholder="Ask about specific improvements..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          disabled={sending}
        />
        <button
          type="button"
          className="chat-icon-btn"
          onClick={() => setShowTemplate(value => !value)}
          title={showTemplate ? 'Hide template' : 'Show template'}
          aria-label={showTemplate ? 'Hide prompt template' : 'Show prompt template'}
          aria-pressed={showTemplate}
        >
          T
        </button>
        {hasTurns && (
          <button
            type="button"
            className="chat-icon-btn"
            onClick={() => { setTurns([]); setError('') }}
            title="Clear conversation"
            aria-label="Clear conversation"
          >
            ×
          </button>
        )}
        <button
          className="chat-send-btn"
          onClick={() => sendMessage()}
          disabled={sending || !input.trim()}
        >
          {sending ? <><WanderingEyes className="wandering-eyes-button" title="Sending chat message" /> Sending...</> : 'Send'}
        </button>
      </div>
    </div>
  )
}
