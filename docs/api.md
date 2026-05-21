# API Reference

Base URL in local development:

```text
http://localhost:8000/api/v1
```
## Health

```http
GET /api/v1/analyze/health
```

Returns configured provider status without exposing keys.

```json
{
  "status": "ok",
  "openrouter": true,
  "tavily": true,
  "exa": true,
  "groq": false,
  "jina": true
}
```

## Fetch

```http
GET /api/v1/fetch?url=https://example.com&stream=1
```

Used by the MotionViz UI fetch gate.

SSE events:

- `status`
- `chunk`
- `complete`
- `failure`

`complete` returns:

```json
{
  "markdown": "...",
  "charCount": 12000,
  "sourceSignals": {
    "sourceUrl": "https://example.com",
    "origin": "https://example.com",
    "llmsTxt": {"present": false, "url": "https://example.com/llms.txt"},
    "llmsFullTxt": {"present": false, "url": "https://example.com/llms-full.txt"}
  },
  "normalizedUrl": "https://example.com",
  "intelligence": {
    "access": {},
    "extraction": {}
  }
}
```

## Analyze

```http
POST /api/v1/analyze
Content-Type: application/json
```

Request:

```json
{
  "url": "https://example.com/page",
  "draft_content": "",
  "page_type": "product",
  "target_query": "best software for ecommerce brands",
  "target_customer": "ecommerce brands",
  "primary_action": "book demo",
  "competitors": ["Competitor A", "Competitor B"],
  "category": "customer support software",
  "run_legacy_llm_scorecard": false,
  "include_llm_rewrite": false,
  "run_competitor_grounding": true
}
```

Behavior:

- If `draft_content` is longer than 100 characters, it is analyzed directly.
- Otherwise the backend fetches `url`.
- Response is SSE, not plain JSON.

SSE events:

- `progress`: step-level status
- `result`: final result
- `error`: terminal failure

Important final result fields:

```json
{
  "original_aeo": {},
  "query_match": {},
  "gap_score": 0,
  "page_intelligence": {},
  "citation_intelligence": {},
  "retrieval": {},
  "benchmark_queries": [],
  "competitor_grounding": {},
  "competitive_gap": {},
  "prepublish_evaluation": {},
  "optimization_plan": {},
  "scorecard": {},
  "rewrites": {}
}
```

## Pre-Publish Evaluation

`prepublish_evaluation` contains:

```json
{
  "score": 75,
  "aiFeatureEligibility": {},
  "ragSimulation": {},
  "geoMethodCoverage": {},
  "structuredDataIntegrity": {},
  "competitivePressure": {},
  "priorityActions": [],
  "researchBasis": []
}
```

Use this field for research-backed recommendations beyond the original AEO scores.

## Chat

```http
POST /api/v1/chat
Content-Type: application/json
```

Request:

```json
{
  "messages": [
    {"role": "user", "content": "Rewrite the intro for direct answer style."}
  ],
  "markdown": "# Page content..."
}
```

Returns model responses from OpenRouter:

```json
{
  "responses": [
    {"model": "Qwen", "response": "..."},
    {"model": "Nemotron", "response": "..."},
    {"model": "GPT-OSS", "response": "..."}
  ],
  "modelStatus": []
}
```
