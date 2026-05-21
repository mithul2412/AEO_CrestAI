# Operations

## Project Location

```text
Repository root
```

## Required API Keys

Put local keys in `backend/.env`.

```bash
OPENROUTER_API_KEY=...
JINA_API_KEY=...
TAVILY_API_KEY=...
EXA_API_KEY=...
```

Optional:

```bash
GROQ_API_KEY=...
```

Groq is not required for the active Qwen, Nemotron, and GPT-OSS flow.

## Local Backend

```bash
cd backend
.venv/bin/uvicorn main:app --reload --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/api/v1/analyze/health
```

## Local Frontend

```bash
cd frontend
npm install
npm run dev
```

Default URL:

```text
http://localhost:5173
```

If the backend is on a non-default port:

```bash
VITE_API_TARGET=http://127.0.0.1:8001 npm run dev -- --port 5174
```

## Tests

Backend:

```bash
cd backend
PYTHONPATH=. .venv/bin/python -m unittest tests.test_sota_aeo
```

Frontend:

```bash
cd frontend
npm run build
npm test
```

If Python bytecode writes are blocked by macOS cache permissions in a sandbox:

```bash
PYTHONPYCACHEPREFIX=/tmp/crest-pyc .venv/bin/python -m compileall main.py routers pipeline providers tests
```

## Live Benchmarks

These benchmarks make real network and provider calls. They are optional and are not run by CI.

Run fixed benchmark sites:

```bash
cd backend
PYTHONPATH=. .venv/bin/python scripts/live_benchmark.py --limit 3
```

Fast mode:

- Uses deterministic scoring and optimization.
- Skips legacy LLM rewrite generation.

Full mode:

```bash
PYTHONPATH=. .venv/bin/python scripts/live_benchmark.py --full --limit 1
```

Use full mode sparingly because it makes more LLM calls.

## What To Watch In Results

For each page, inspect:

- `original_aeo.content_score`
- `original_aeo.geu_score`
- `query_match.query_match_score`
- `gap_score`
- `citation_intelligence.citationReadiness.score`
- `competitive_gap.competitorGapScore`
- `prepublish_evaluation.score`
- `prepublish_evaluation.priorityActions`
- `optimization_plan.highest_impact_fix`

## Common Failure Modes

### Fetch failed

Usually caused by:

- page blocks automated readers
- Jina cannot extract content
- Exa returns no full text
- network/API outage

Try:

- another URL
- direct `draft_content`
- checking page access/WAF settings

### Access Failure

Fix before rewriting content:

- robots blocks Googlebot or AI crawlers
- noindex
- nosnippet
- HTTP 401/403
- thin extracted text

### Query Fan-Out Failure

The target query may work, but related query variants fail.

Fix by adding:

- answer-first FAQ entries
- comparison blocks
- pricing or implementation answers
- buying criteria
- evidence-backed examples

### Competitive Gap

The page is being beaten by a competitor chunk.

Fix based on missing attributes:

- direct answer
- stronger evidence
- answer appears earlier
- more specific entities and numbers
- self-contained answer
