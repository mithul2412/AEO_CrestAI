# AEO Pre-Publish Scorer

Full-stack AEO scoring tool. Backend: FastAPI on port 8000. Frontend: Vite + React on port 5173.

## Architecture
- `/backend` — FastAPI SSE API (`/api/v1/analyze`)
- `/frontend` — Vite + React UI

## Key design decisions
- Hero metric: gap between Content Score and Query Match Score
- Query Match uses deterministic retrieval plus OpenRouter judge panel (Qwen + Nemotron + GPT-OSS)
- Jina fetch streams live to UI via SSE
- Tavily grounds SERP discovery; Exa extracts competitor full text
- All loading states have animations
