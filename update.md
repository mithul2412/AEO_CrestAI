# AEO Scorer — Update: Content-Only LLM Score + Optional Query Flow

## Summary

Add an **LLM-based score (0–100)** that runs immediately after Jina fetches content, shown alongside rule-based Content and GEU scores. Query Match Score remains optional — it appears when the user enters a target query.

---

## No-Query Behavior (Content-Only Scoring)

**When the user does NOT provide a query**, the app shows scores based on:

1. **Scoring algorithm** — Rule-based checks (Princeton KDD + AutoGEO):
   - Content Score (0–100): FAQ, statistics, citations, schema, comparison, fluency, llms.txt
   - GEU Score (0–100): Standalone sentences, front-loaded answer, sourced claims, coherent opening

2. **What the LLM thinks** — AI assessment of the content:
   - LLM Content Score (0–100): Each model (Llama, Nemotron) rates GEO readiness from the raw content
   - Model readout: Per-model scores and brief reasons

No Query Match, Gap, or verdicts — those require a target query.

---

## Research Brief — Scoring Model (Sources)

### DIMENSION 1: CONTENT SCORE (0–100) — Rule-based
**Source:** Princeton KDD 2024 — [GEO: Generative Engine Optimization](https://arxiv.org/abs/2311.09735)

| Check | Weight | Research lift |
|-------|--------|---------------|
| FAQ / Q&A structure present | 20pts | +11% |
| Statistics/numbers in content | 15pts | +40% |
| External citations present | 20pts | +115% |
| Structured data / schema | 15pts | directional |
| Comparison framing present | 10pts | directional |
| Fluency / reading level | 10pts | +22% |
| llms.txt present | 10pts | directional |

**Weights sum = 100.** Already implemented in `geoScorer.js`.

---

### DIMENSION 2: QUERY MATCH SCORE (0–100) — AI-computed
**Source:** E-GEO 2025 + AutoGEO 2025

- Computed by AI models (Llama, Nemotron) when user provides a query
- Each model scores 0–100: *does this markdown answer [query]?*
- Final score = average of fulfilled model scores
- **Optional** — only shown when user enters a target query

---

### DIMENSION 3: GEU SCORE (0–100) — Rule-based
**Source:** AutoGEO CMU 2025 — [What Generative Search Engines Like](https://arxiv.org/pdf/2510.11438)

| Check | Weight |
|-------|--------|
| Key facts extractable as standalone sentences | 30pts |
| Answers in first sentence (not buried) | 25pts |
| Claims backed by numbers or named sources | 25pts |
| Sentences coherent when lifted out of context | 20pts |

**Weights sum = 100.** Already implemented in `geuScorer.js`.

---

### NEW: LLM CONTENT SCORE (0–100) — AI-computed (content-only)
**Purpose:** Holistic GEO readiness assessment from an LLM, without requiring a query.

- Runs **immediately after Jina fetch**
- LLM reads the markdown and outputs a single 0–100 score
- Represents: *How GEO-ready is this content overall?*
- Shown alongside rule-based Content and GEU scores
- Provides a model-specific perspective (e.g., Llama vs Nemotron) — can average or show both

---

## New Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           AEO SCORER — UPDATED FLOW                              │
└─────────────────────────────────────────────────────────────────────────────────┘

  User pastes URL
        │
        ▼
  ┌─────────────┐
  │ Fetch Page  │
  └──────┬──────┘
         │
         ▼
  Jina AI Reader fetches markdown (SSE stream)
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  IMMEDIATE (no query required)                                                │
  │                                                                                │
  │  1. Rule-based Content Score (geoScorer)     → 0–100                          │
  │  2. Rule-based GEU Score (geuScorer)         → 0–100                           │
  │  3. LLM Content Score (NEW)                  → 0–100  ← call Groq + OpenRouter │
  │     • Prompt: "Rate this content 0–100 for GEO readiness"                      │
  │     • Returns: { llmContentScore: 72 } or per-model scores                     │
  └──────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  DISPLAY: Content Score | GEU Score | LLM Score                                │
  │           (Gap box: N/A until query is entered)                                 │
  └──────────────────────────────────────────────────────────────────────────────┘
         │
         │  User optionally enters target query
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  ON "Re-Score" (with query)                                                    │
  │                                                                                │
  │  4. Query Match Score (AI)                    → 0–100  ← Groq + OpenRouter      │
  │  5. Model verdicts (verdict, topGap, suggestedFix)                              │
  │  GAP = Content Score − Query Match Score                                       │
  └──────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  DISPLAY: Content | Gap | Query Match | GEU | LLM Score | Verdicts            │
  └──────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Checklist

| Task | Location | Description |
|------|----------|-------------|
| 1 | `backend/routes/` | New route or extend existing: `POST /analyze-content` or call from `/fetch` completion |
| 2 | `backend/models.js` | New prompt: `LLM_CONTENT_SCORE_PROMPT` — ask LLM to return `{ llmContentScore: number }` |
| 3 | `backend/routes/` | Call Groq + OpenRouter with content-only prompt (no query) |
| 4 | `frontend/App.jsx` | After fetch complete → call new endpoint for content-only analysis |
| 5 | `frontend/ScoreDisplay.jsx` | Add LLM Score card/ring to the score grid |
| 6 | `frontend/` | Update UI: show Content + GEU + LLM immediately; Query Match + Gap when query provided |

---

## LLM Prompt (Draft)

```text
You are an AEO (Answer Engine Optimization) expert.
Given a webpage's markdown content, rate its overall GEO readiness from 0–100.
Consider: structure, citations, statistics, clarity, extractability, and alignment with AI answer engine preferences.

Return ONLY valid JSON with no extra text:
{
  "llmContentScore": <integer 0-100>,
  "briefReason": "<1 sentence: why this score>"
}

Score guide: 0-30=not GEO-ready; 31-50=some signals; 51-70=moderately ready; 71-100=strong GEO-ready content.
```

---

## API Changes

### Option A: New endpoint `POST /analyze-content`
- **Body:** `{ markdown }`
- **Response:** `{ contentScore, geuScore, llmContentScore, briefReason, checks, geuChecks }`
- **When:** Frontend calls this when `onFetchComplete` fires

### Option B: Extend `/analyze` to support query-less mode
- **Body:** `{ markdown, query?: string }`
- **When:** `query` omitted → return only Content + GEU + LLM score
- **When:** `query` present → return full analysis including Query Match + verdicts

---

## File Changes Summary

| File | Change |
|------|--------|
| `backend/models.js` | Add `LLM_CONTENT_SCORE_PROMPT` |
| `backend/routes/analyze.js` | Add content-only path; call LLM for `llmContentScore` |
| `frontend/App.jsx` | Call analyze (no query) after fetch; store `llmContentScore` |
| `frontend/ScoreDisplay.jsx` | Render LLM Score ring; handle optional Query Match / Gap |
| `frontend/index.css` | Optional: styles for LLM score card |
