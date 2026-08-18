# AEO Pre-Publish Scorer

Full-stack AEO scoring tool. Backend: FastAPI on port 8000. Frontend: Vite + React on port 5173.

## Architecture
- `/backend` — FastAPI SSE API (`/api/v1/fetch`, `/api/v1/analyze`, `/api/v1/chat`)
- `/frontend` — Vite + React UI

## Key design decisions
- Hero metric: gap between Content Score and Query Match Score
- Query Match uses deterministic retrieval plus OpenRouter judge panel (Qwen + Nemotron + GPT-OSS)
- Competitive citation gap compares the user's top chunk against grounded competitor chunks
- Research-backed pre-publish evaluation scores AI-feature eligibility, RAG fan-out, GEO method coverage, structured-data integrity, and competitive pressure
- Jina fetch streams live to UI via SSE
- Tavily grounds SERP discovery; Exa extracts competitor full text
- All loading states have animations
