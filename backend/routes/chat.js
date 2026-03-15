import { Router } from 'express'
import fetch from 'node-fetch'
import { truncateMarkdown } from '../utils/truncate.js'

const router = Router()
const LLM_TIMEOUT_MS = 30_000

function buildProviderError(provider, status, rawText = '') {
  const compact = rawText ? rawText.replace(/\s+/g, ' ').trim() : ''
  return compact ? `${provider} error ${status}: ${compact}` : `${provider} error ${status}`
}

async function callGroqChat(messages, systemContent) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('Missing GROQ_API_KEY')
  }

  const allMessages = systemContent
    ? [{ role: 'system', content: systemContent }, ...messages]
    : messages

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: allMessages,
      temperature: 0.5,
      max_tokens: 650,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(buildProviderError('Groq', res.status, err))
  }

  const data = await res.json()
  return { model: 'Llama 3.3', response: data.choices?.[0]?.message?.content || '' }
}

async function callOpenRouterChat(messages, systemContent) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('Missing OPENROUTER_API_KEY')
  }

  const allMessages = systemContent
    ? [{ role: 'system', content: systemContent }, ...messages]
    : messages

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3-super-120b-a12b:free',
      messages: allMessages,
      max_tokens: 650,
      temperature: 0.5,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(buildProviderError('OpenRouter', res.status, err))
  }

  const data = await res.json()
  return { model: 'Nemotron 120B', response: data.choices?.[0]?.message?.content || '' }
}

router.post('/', async (req, res) => {
  try {
    const { messages, markdown } = req.body || {}

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' })
    }

    const systemContent = markdown
      ? `You are an AEO (Answer Engine Optimization) expert assistant. The user is analyzing the following webpage content:\n\n${truncateMarkdown(markdown, 3000)}\n\nHelp them improve their content for AI answer engines with concrete, high-impact suggestions.`
      : 'You are an AEO (Answer Engine Optimization) expert assistant. Help users improve their content for AI answer engines.'

    const settled = await Promise.allSettled([
      callGroqChat(messages, systemContent),
      callOpenRouterChat(messages, systemContent),
    ])

    const responses = settled
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value)

    if (responses.length === 0) {
      const errors = settled
        .map(result => result.reason?.message)
        .filter(Boolean)
        .join('; ')
      return res.status(502).json({ error: errors || 'All models failed' })
    }

    res.json({ responses })
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Chat failed' })
  }
})

export default router
