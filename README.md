# Crest.Ai FastAPI v2 Prototype

> **Prototype status:** This branch is an experimental FastAPI/Python evolution of Crest.Ai. The supported portfolio release remains on [`main`](https://github.com/mithul2412/AEO_CrestAI/tree/main). This snapshot is published for architecture review and continued development; its live provider integrations require your own API credentials.

Pre-publish analysis for teams that want to know whether a live page is ready for answer engines before it ships.

## What This Product Does

The AEO Pre-Publish Scorer helps teams evaluate whether a webpage is:

- structurally reusable by answer engines
- strong enough on content quality and extractability
- aligned to a specific high-value query
- ready for rewriting, optimization, or launch

Instead of waiting for rankings or traffic signals after publication, the product gives teams a pre-publish decision layer.

## Why It Matters

Search is shifting from links to answers. That means high-value pages need to be:

- easier for AI systems to extract
- easier to trust and cite
- more direct for query-specific answers
- easier for content teams to improve quickly

Traditional SEO tools are strong at rankings, keywords, and backlinks. This product focuses on a different problem: whether a page is usable by answer engines before it goes live.

## Who It Is For

- SEO teams working on money pages
- content strategists responsible for launch readiness
- growth teams improving landing pages
- agencies running AI-search or AEO audits
- product marketing teams shipping pricing, comparison, and FAQ content

## Core Workflow

1. Paste a live URL.
2. Fetch the page as normalized markdown through Jina.
3. Run baseline scoring:
   Content Score, GEU Score, and citation readiness.
4. Surface technical opportunities like schema and `llms.txt`.
5. Enter a target query to test direct-answer quality.
6. Compare user and competitor answer chunks, identify the top gap, and see the highest-impact fix.
7. Continue the workflow in Ask The Expert to turn findings into rewrite guidance.

## Product Capabilities

### 1. Live Page Fetch

- Pulls live page content through Jina
- Streams progress into the UI with SSE
- Normalizes URL inputs
- Probes `llms.txt` and `llms-full.txt`

### 2. Baseline Readiness Scoring

- **Content Score**
  checks FAQ structure, numbers, citations, schema, comparison framing, fluency, and `llms.txt`
- **GEU Score**
  checks answer front-loading, standalone sentences, sourced claims, and coherence
- **Citation Readiness**
  combines access, extraction, hybrid retrieval, answer extraction, evidence, structure, freshness, and competitive gap signals
- **Research-Backed Pre-Publish Evaluation**
  adds AI feature eligibility, RAG-style fan-out coverage, GEO method coverage, structured-data integrity, and competitive pressure

### 3. Query-Specific Scoring

- Tests whether the page answers a specific query directly
- Produces a Query Match score
- Calculates `Content Score - Query Match Score` as the gap
- Uses Qwen, Nemotron, and GPT-OSS via OpenRouter for model judgment
- Compares your top retrieved chunk against readable competitor chunks from Tavily/Exa/Jina
- Returns weak query variants and ranked priority actions for pre-publish optimization

### 4. Rewrite Assistance

- Lets users send a suggested fix straight into Ask The Expert
- Preserves the page context inside chat
- Supports Qwen, Nemotron, and GPT-OSS responses for rewrite guidance

## Product View

### What Makes It Useful

- It is a decision tool, not just a reporting dashboard.
- It combines explainable rule-based checks with model judgment.
- It helps teams move from diagnosis to action in one flow.
- It is especially useful for launch reviews, page refreshes, and content audits.

### What It Can Help Teams Decide

- Is this page structurally ready for AI answers?
- Does this page answer the exact user question clearly enough?
- What should we fix first?
- Should this page be launched as-is, revised, or rewritten?

## System Architecture

The active system is intentionally lightweight:

- **Frontend**
  React + Vite single-page application
- **Backend**
  FastAPI SSE API with a 7-step backend AEO pipeline
- **External Services**
  Jina for page-to-markdown fetch, query/passage embeddings, and reranking; Tavily for grounded SERP discovery; Exa for competitor full text; OpenRouter for Qwen/Nemotron/GPT-OSS judging and rewriting

Docs:

- [AEO Method](docs/aeo-method.md)
- [Research Basis](docs/research-basis.md)
- [API Reference](docs/api.md)
- [Operations](docs/operations.md)
- [System Architecture](docs/system-architecture.md)

## Repository Structure

```text
backend/
  main.py
  routers/analyze.py
  providers/
    jina.py
    tavily.py
    exa.py
    openrouter.py
  pipeline/
    original_aeo.py
    access_intelligence.py
    retrieval.py
    citation_intelligence.py
    competitive_gap.py
    competitor_grounding.py
    prepublish_evaluation.py
    query_match.py
    optimization.py
    aeo_pipeline.py

frontend/
  src/
    components/
      UrlInput.jsx
      ScoreDisplay.jsx
      Verdicts.jsx
      Chat.jsx
      InfoTip.jsx
    App.jsx
    index.css
```

## Tech Stack

- React
- Vite
- FastAPI
- Node.js
- Server-Sent Events
- Tavily API
- Exa API
- OpenRouter API
- Jina AI
- Python unittest

## Local Development

Copy `backend/.env.example` to `backend/.env` and add your own credentials before using live integrations. The automated test suite does not require live provider calls.

### Backend

```bash
cd backend
.venv/bin/uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Backend runs on `http://localhost:8000` and frontend runs on `http://localhost:5173`.

## Environment Variables

Backend expects:

```bash
OPENROUTER_API_KEY=...
JINA_API_KEY=...
JINA_EMBEDDING_MODEL=jina-embeddings-v3
JINA_RERANKER_MODEL=jina-reranker-v3
TAVILY_API_KEY=...
EXA_API_KEY=...
GROQ_API_KEY=... # optional legacy Llama panel
```

## Current Product Positioning

This product is best understood as:

**A pre-publish AEO review tool for high-value pages**

It is strongest when used for:

- pricing pages
- comparison pages
- FAQ pages
- product landing pages
- service pages with commercial intent

## Roadmap Direction

- saved analyses and history
- before/after comparisons
- multi-page batch analysis
- shareable reports
- CMS integrations
- query sets per page
- collaboration workflows for content teams

## Notes

- The scoring system is intentionally explainable and transparent.
- Some scores are deterministic and rule-based; others come from model judgment.
- The product is designed to support content review, not replace editorial judgment.
