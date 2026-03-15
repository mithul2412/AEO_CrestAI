import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fetchRoute from './routes/fetch.js'
import analyzeRoute from './routes/analyze.js'
import chatRoute from './routes/chat.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.use('/fetch', fetchRoute)
app.use('/analyze', analyzeRoute)
app.use('/chat', chatRoute)

app.get('/health', (req, res) => res.json({ ok: true }))

app.listen(PORT, () => {
  console.log(`AEO Scorer backend running on http://localhost:${PORT}`)
})

export default app
