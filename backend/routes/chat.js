import { Router } from 'express'
import { runChatModelPanel } from '../services/openRouterModels.js'
import { packContextForChat } from '../services/contextPacker.js'

const router = Router()

router.post('/', async (req, res) => {
  try {
    const { messages, markdown, query = '', pageIntelligence = {} } = req.body || {}

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' })
    }

    const queryContext = query?.trim()
      ? `\n\nTarget query: ${query.trim()}`
      : ''
    const packed = markdown
      ? packContextForChat({ markdown, query, pageIntelligence, budgetTokens: 3000 })
      : ''
    const systemContent = markdown
      ? `You are an AEO (Answer Engine Optimization) expert assistant. The user is analyzing the following webpage. The context below is a relevance-packed sample (page skeleton + most relevant chunks for the target query when present), not the full page.${queryContext}\n\n${packed}\n\nGround every suggestion in the packed context. When you reference content, cite the chunk id (e.g. c2) shown in the headers. Be concrete, specific, and high-impact.`
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
