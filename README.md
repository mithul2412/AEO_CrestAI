# AEO Pre-Publish Scorer

Pre-publish analysis for teams that want to know whether a live page is ready for answer engines before it ships.

![AEO product overview](docs/assets/product-overview.svg)

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

![AEO workflow](docs/assets/product-workflow.svg)

1. Paste a live URL.
2. Fetch the page as normalized markdown through Jina.
3. Run baseline scoring:
   Content Score, GEU Score, LLM baseline score.
4. Surface technical opportunities like schema and `llms.txt`.
5. Enter a target query to test direct-answer quality.
6. Compare model verdicts, identify the top gap, and see the highest-impact fix.
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
- **LLM Baseline Score**
  uses Qwen 3.6 Plus, Nemotron 120B, and GPT OSS 120B through OpenRouter to estimate overall GEO readiness

### 3. Query-Specific Scoring

- Tests whether the page answers a specific query directly
- Produces a Query Match score
- Calculates `Content Score - Query Match Score` as the gap
- Returns model verdicts, the biggest weakness, and the suggested next fix

### 4. Rewrite Assistance

- Lets users send a suggested fix straight into Ask The Expert
- Preserves the page context inside chat
- Supports Qwen, Nemotron, and GPT OSS responses for rewrite guidance

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

The system is intentionally lightweight:

- **Frontend**
  React + Vite single-page application
- **Backend**
  Express API with fetch, analyze, and chat routes
- **External Services**
  Jina for page-to-markdown fetch, OpenRouter for three-model analysis, and Tavily for search/competitor evidence

For the full architecture and request flow, see [System Architecture](docs/system-architecture.md).

## Repository Structure

```text
backend/
  routes/
    fetch.js
    analyze.js
    chat.js
  utils/
    geoScorer.js
    geuScorer.js
    contentSignals.js
    truncate.js
  models.js
  index.js

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
- Express
- Node.js
- Server-Sent Events
- OpenRouter API
- Jina AI
- Tavily
- Jest
- Vitest

## Local Development

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Backend runs on `http://localhost:3001` and frontend runs on `http://localhost:5173`.

## Environment Variables

Backend expects:

```bash
OPENROUTER_API_KEY=...
JINA_API_KEY=... # optional
TAVILY_API_KEY=... # optional, enables competitor and search evidence
PORT=3001
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

