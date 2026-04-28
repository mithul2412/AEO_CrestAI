import { Router } from 'express'
import { truncateMarkdown } from '../utils/truncate.js'
import { runChatModelPanel } from '../services/openRouterModels.js'

const router = Router()

router.post('/', async (req, res) => {
  try {
    const { messages, markdown, query = '' } = req.body || {}

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' })
    }

    const queryContext = query?.trim()
      ? `\n\nTarget query: ${query.trim()}`
      : ''
    const systemContent = markdown
      ? `You are an AEO (Answer Engine Optimization) expert assistant. The user is analyzing the following webpage content:${queryContext}\n\n${truncateMarkdown(markdown, 3000)}\n\nHelp them improve their content for AI answer engines with concrete, high-impact suggestions.`
      : 'You are an AEO (Answer Engine Optimization) expert assistant. Help users improve their content for AI answer engines.'

    const panel = await runChatModelPanel({ messages, systemContent })

    if (panel.responses.length === 0) {
      const errors = panel.settled
        .map(result => result.reason?.message)
        .filter(Boolean)
        .join('; ')
      return res.status(502).json({ error: errors || 'All models failed' })
    }

    res.json({ responses: panel.responses, modelStatus: panel.status })
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Chat failed' })
  }
})

export default router
