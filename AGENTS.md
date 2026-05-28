# AGENTS.md

Guidance for AI coding agents (and human contributors) working in this repository.

## Project overview

Crest.AI is a full-stack **AEO (Answer Engine Optimization) pre-publish scorer**. It evaluates whether a web page is structured, grounded, and specific enough for AI answer engines to retrieve, trust, and cite — before the page is published.

## Architecture

Two services, run independently in local development:

| Service | Stack | Port |
|---|---|---|
| Backend | Node.js + Express (ESM) | `3001` |
| Frontend | React 18 + Vite | `5173` |

```text
backend/
  agentic/    profile, validation, storage, and artifact workflows
  routes/     fetch, analyze, chat, and agentic API routes
  services/   retrieval, competitor mapping, scoring, provider adapters
  utils/      deterministic scoring (geoScorer, geuScorer, contentSignals)
  tests/      unit and integration tests
frontend/
  src/routes/     Overview, Source, Diagnostics, Rewrite, Agentic views
  src/components/ reusable product and data-visualization components
docs/             architecture, API contracts, and design/engineering history
```

See [`docs/system-architecture.md`](docs/system-architecture.md) for the full request-flow diagram and [`docs/current-contracts.md`](docs/current-contracts.md) for exact API request/response shapes.

## Key design decisions

- **Hero metric** is the gap between Content Score and Query Match Score (`Content Score − Query Match Score`) — this is what a user sees as the headline result.
- **Three-model panel**: baseline, query-match, and chat judgments run through OpenRouter across Qwen 3.6 Plus, Nemotron 120B, and GPT OSS 120B, so results reflect more than one model's opinion.
- **Deterministic scoring first**: Content Score and GEU (Generative Engine Usability) Score are rule-based (`backend/utils/geoScorer.js`, `backend/utils/geuScorer.js`) and don't depend on a live model call — LLM scoring is layered on top, not a replacement.
- **Query is optional**: a page can be scored content-only (no target query); Query Match Score, gap, and verdicts only appear once a query is supplied.
- **Fetch streams live**: page content from Jina is streamed to the UI over Server-Sent Events rather than returned as one blocking response.
- **Loading states are always animated** — no bare spinners or blank waits.

## Dev commands

```bash
# Backend
cd backend
npm ci
cp .env.example .env   # only needed for live provider calls
npm run dev             # starts on :3001
npm test                 # jest, --runInBand

# Frontend (separate terminal)
cd frontend
npm ci
npm run dev              # starts on :5173
npm test                  # vitest run
npm run build
```

Tests are designed to run without real provider credentials — mock network boundaries rather than depending on live API keys.

## Environment variables

Set in `backend/.env` (copy from `backend/.env.example`):

| Variable | Required | Purpose |
|---|---:|---|
| `OPENROUTER_API_KEY` | For model analysis | Primary model-panel credential |
| `OPENROUTER_API_KEY_UW_MAIL` / `OPENROUTER_API_KEY_PERSONAL` | No | Optional fallback OpenRouter keys |
| `JINA_API_KEY` | No | Enhanced page reading and retrieval |
| `TAVILY_API_KEY` | No | Search presence and competitor evidence |
| `ENABLE_AGENTIC_LAYER` | No | Enables `/agentic` and `/agent` routes and UI |
| `AGENTIC_PROFILE_STORAGE` | No | `memory` (default) or `file` — see [`docs/AGENTIC_LAYER.md`](docs/AGENTIC_LAYER.md) |
| `AGENTIC_PROFILE_BASE_URL` | No | Base URL used when generating hosted profile links |
| `PORT` | No | Backend port, defaults to `3001` |

## Conventions for agents and contributors

- Branch names use a `feature/`, `fix/`, `docs/`, or `chore/` prefix.
- Commit subjects are imperative ("Fix chat visibility bug", not "Fixed").
- Add or update deterministic tests for any behavior change; keep live/provider-dependent behavior out of the default test path.
- Never commit `.env` files, provider credentials, or generated agentic profile/benchmark output — see [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full policy.
- Before opening a PR, run: backend tests, frontend tests, and the frontend production build (see Dev commands above).
- Full contributing workflow, credits, and security policy live together in [`CONTRIBUTING.md`](CONTRIBUTING.md).
