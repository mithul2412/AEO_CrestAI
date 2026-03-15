# AEO Pre-Publish Scorer

Full-stack AEO scoring tool. Backend: Express ESM on port 3001. Frontend: Vite + React on port 5173.

## Architecture
- `/backend` — Express API (fetch, analyze, chat routes)
- `/frontend` — Vite + React UI

## Key design decisions
- Hero metric: gap between Content Score and Query Match Score
- Chat uses BOTH Llama 3.3 + Nemotron 120B simultaneously
- Jina fetch streams live to UI via SSE
- All loading states have animations
