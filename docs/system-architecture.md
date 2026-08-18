# System Architecture

## Overview

The active app is:

- **Backend:** FastAPI under `backend/`
- **Frontend:** Vite + React under `frontend/`
- **Primary endpoint:** `POST /api/v1/analyze`
- **Fetch endpoint:** `GET /api/v1/fetch`
- **Rewrite help endpoint:** `POST /api/v1/chat`

The backend is the source of truth for all AEO scoring and optimization logic. The frontend renders the MotionViz workflow and adapts backend results into score, diagnostics, competitor, and rewrite-help panels.

## Backend Modules

```text
backend/
  main.py
  routers/
    analyze.py
    fetch.py
    chat.py
  providers/
    jina.py
    tavily.py
    exa.py
    openrouter.py
  pipeline/
    aeo_pipeline.py
    original_aeo.py
    access_intelligence.py
    retrieval.py
    citation_intelligence.py
    competitor_grounding.py
    competitive_gap.py
    prepublish_evaluation.py
    query_match.py
    optimization.py
```

## Provider Roles

| Provider | Purpose |
| --- | --- |
| Jina | URL-to-markdown, embeddings, reranking |
| Tavily | SERP/competitor discovery |
| Exa | Full-text extraction for known URLs |
| OpenRouter | Qwen, Nemotron, GPT-OSS judging and rewrite help |

## Data Flow

```text
URL or draft content
  -> content fetch / validation
  -> access + extraction intelligence
  -> original AEO scores
  -> query generation
  -> competitor discovery + competitor chunks
  -> user retrieval simulation
  -> user-vs-competitor chunk gap
  -> pre-publish research evaluation
  -> query match judge panel
  -> optimization plan
  -> SSE result to frontend
```

## Frontend Flow

The frontend uses the teammate MotionViz UI pattern:

1. Gate 1: fetch a live page
2. Gate 2: baseline readiness
3. Gate 3: target query test
4. Diagnostics: access, readability, retrieval, answer quality, competitor gap, fix first
5. Rewrite Help: Qwen, Nemotron, GPT-OSS chat responses

## Why SSE

`/api/v1/analyze` streams progress because live fetch, competitor grounding, embeddings, reranking, and LLM judging can take time.

Final result arrives as a `result` SSE event.

## Scoring Boundaries

The system has three important score families:

- **Original deterministic scores:** Content Score and GEU Score.
- **Query scores:** Query Match and Content-Query gap.
- **Research-backed readiness:** citation readiness and pre-publish evaluation.

The original scores are intentionally preserved so changes to advanced scoring do not rewrite the base method.

