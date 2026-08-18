# AEO Scorer — Flow Analysis

## No-Query Mode (Content-Only Scoring)

**When the user does NOT provide a query**, the app shows scores based on:

1. **Scoring algorithm** — Rule-based checks:
   - Content Score (Princeton KDD): FAQ, statistics, citations, schema, comparison, fluency, llms.txt
   - GEU Score (AutoGEO): Standalone sentences, front-loaded answer, sourced claims, coherent opening

2. **What the LLM thinks** — AI assessment of the content:
   - LLM Content Score: Llama and Nemotron rate GEO readiness from the raw content
   - Model readout: Per-model scores and brief reasons

No Query Match, Gap, or verdicts — those require a target query.

---

## Current Flow (As Implemented)

```
1. User pastes URL → Click "Fetch Page"
2. Jina fetches markdown (SSE stream) → onFetchComplete(markdown)
3. handleFetchComplete:
   - setMarkdown(md)
   - setQuery('')
   - setBaselineResults(null)
   - setResults(null)
   - setFetchStreaming(false)
   - void handleBaselineAnalyze(md)  ← fire-and-forget
4. handleBaselineAnalyze:
   - POST /analyze { markdown }  (no query)
   - Backend: Content + GEU (rule-based) + LLM Content (Groq + OpenRouter)
   - setBaselineResults(data)
5. UI shows: Baseline Score (Content, GEU, LLM scores)
6. User optionally enters query → Click "Re-Score with Query"
7. handleAnalyze:
   - POST /analyze { markdown, query }
   - Backend: Query Match + verdicts (Groq + OpenRouter)
   - setResults({ ...data, llmContentScore: baselineResults?.llmContentScore, ... })
8. UI shows: Query Results (Verdicts), Chat
```

---

## Issues Found

### 1. Chat is hidden until Re-Score (main flow bug)

**Current:** Chat section only renders when `results` exists:
```jsx
{results && (
  <div className="section">
    <Chat markdown={markdown} stage={chatStage} query={query.trim()} />
  </div>
)}
```

**Problem:** `results` is only set after the user runs Re-Score with a query. So:
- User fetches URL → sees Baseline Score
- User never enters a query
- **Chat never appears**

The Chat component has `post-fetch` stage suggestions (e.g. "Summarize this page in 5 answer-engine takeaways", "What GEO/GEU signals are missing?") but users never see them because Chat is gated behind Re-Score.

**Fix:** Show Chat when we have content to discuss (markdown), not only when we have query results:
```jsx
{markdown && (
  <div className="section">
    <Chat markdown={markdown} stage={chatStage} query={query.trim()} />
  </div>
)}
```

---

### 2. chatStage when Chat shows with only markdown

**Current logic:**
```js
const chatStage = results?.verdicts?.length
  ? 'post-verdict'
  : query.trim()
    ? 'post-query'
    : 'post-fetch'
```

When `results` is null (user hasn't run Re-Score):
- `results?.verdicts?.length` → falsy
- `query.trim()` → likely '' (user hasn't entered query)
- → `chatStage = 'post-fetch'` ✓

So the stage logic is fine. Once we show Chat when `markdown` exists, `post-fetch` will be used correctly.

---

### 3. Journey bar semantics

**Current:**
- `jFetch = 'done'` when: `hasBaseline || queryAnalyzing || hasQueryResults`
- So "Fetch" is considered done only after baseline analysis returns (Content + GEU + LLM scores).

**Implication:** The Fetch step effectively means "Jina fetch + baseline analyze". If the user expects "Fetch" = "Jina fetch only", there could be confusion. The current design treats the whole initial analysis as one step, which is reasonable.

---

### 4. Query input visibility

**Current:** Query input shows when `hasBaseline` (baseline results have returned).

**Implication:** User must wait for baseline (including LLM calls) before they can even see the query field. They could type a query while baseline loads, but that would require showing the query input when `hasFetched` instead. Trade-off: simpler to keep current behavior (avoids merging baseline into results if it arrives after query results).

---

## Summary of Recommended Fix

| Issue | Fix |
|-------|-----|
| Chat hidden until Re-Score | Change `{results && (` to `{markdown && (` for the Chat section in App.jsx |

---

## Corrected Flow (After Fix)

```
1. Fetch URL → Jina returns markdown
2. Baseline analyze runs automatically → Content + GEU + LLM scores
3. User sees: Baseline Score, Query Input
4. User sees: Chat (with post-fetch suggestions)  ← FIX: was hidden before
5. User optionally enters query → Re-Score
6. User sees: Query Results (Verdicts), Chat (now post-verdict/post-query)
```
