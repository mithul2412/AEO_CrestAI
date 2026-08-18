# Crest AI — Implementation Reference

## What This Is

Pre-publish AEO (Answer Engine Optimization) platform. Before a business publishes a page, Crest runs it through a 7-step pipeline that checks whether AI engines (ChatGPT, Claude, Perplexity, Gemini) can understand, trust, cite, compare, and guide users to action on that page. It then generates specific, grounded rewrites.

**Key differentiator**: Pre-publish vs post-publish. Existing tools (Semrush, Ahrefs) tell you how a page is performing *after* it's live. Crest tells you what's wrong *before* you publish.

---

## Architecture

```
backend/
  main.py                    # FastAPI app entry point
  .env                       # API keys (never commit)
  requirements.txt           # Python deps
  .venv/                     # Python 3.9.6 venv
  providers/
    openrouter.py            # Central LLM client (free model routing)
    jina.py                  # Jina Reader, embeddings, and reranker API wrappers
    tavily.py                # Tavily SERP discovery + Jina/Exa-backed page fetch
    exa.py                   # Exa full-text extraction for competitor pages
  pipeline/
    aeo_pipeline.py          # Main orchestrator — yields PipelineEvent for SSE
    decompose.py             # Step 2: Extract claims, trust signals, headings
    queries.py               # Step 3: Generate 22 real user queries
    search.py                # Step 4: Competitor research
    patterns.py              # Step 5: Benchmark + pattern extraction
    scorer.py                # Step 6: 6-dimension AEO scoring
    rewriter.py              # Step 7: Generate improved content
  routers/
    analyze.py               # POST /analyze SSE endpoint

frontend/
  index.html                 # Entry point (no npm installed — static preview only)
  src/
    App.jsx, main.jsx
    components/
      InputForm.jsx, Progress.jsx, Results.jsx, ScoreRing.jsx
```

---

## The 7-Step Pipeline

### Step 1 — Fetch Content
- Input: URL or `draft_content` string
- Uses `jina.fetch_markdown(url)` — Jina Reader API converts any page to clean markdown
- Falls back to direct httpx fetch + trafilatura if Jina fails

### Step 2 — Page Decomposition (`decompose.py`)
- Model: Qwen tier → fallback
- Extracts: `value_prop`, `claims` (specific/semi_specific/vague), `trust_signals`, `h2_headings`, `cta_texts`, `faq_present`, `questions_answered`, `specificity_score`
- `specificity_score` formula: `+7` per specific claim, `+4` per semi_specific, `-2` per vague, `+5` per named customer

### Step 3 — Query Generation (`queries.py`)
- Model: Qwen tier → fallback
- Generates exactly 22 queries across 6 intent types:
  - `informational` — what is, how does
  - `comparison` — X vs Y, alternatives to
  - `commercial` — best X for Y, top tools
  - `action` — pricing, demo, trial, signup
  - `trust` — reviews, case studies, worth it
  - `problem_first` — how to solve [problem the product solves]

### Step 4 — Competitor Research (`competitor_grounding.py` + providers)
- Tavily is the first-pass live SERP source.
- Exa fetches clean full-text page content for discovered URLs.
- Jina remains the markdown fallback.
- OpenRouter URL discovery is only the last fallback when live sources return nothing.
- Signal extractors in `search.py` are imported by `tavily.py` to avoid duplication

### Step 5 — Retrieval + Citation Intelligence (`retrieval.py`, `citation_intelligence.py`)
- Chunks markdown into answer-sized sections.
- Default offline mode uses lexical overlap, direct-answer detection, chunk position, specificity, evidence, and self-containedness.
- Live query mode adds Jina `retrieval.query` / `retrieval.passage` embeddings and reranks the top candidates with Jina Reranker.
- Returns `method`, `used_embeddings`, `used_reranker`, top retrieved chunks, direct-answer score, and citation readiness.

### Step 6 — AEO Scoring (`original_aeo.py`, `query_match.py`, `scorer.py`)
- Model: Nemotron tier (strong reasoning)
- 6 dimensions with weights:
  - Specificity (25%) — specific vs. vague claims
  - Query Coverage (20%) — how many of the 22 queries the page answers
  - Extractability (20%) — can AI pull a clean answer from each section
  - Competitor Gap (15%) — how draft stacks up against benchmark
  - Trust Density (10%) — social proof vs. competitor benchmark
  - Action Clarity (10%) — CTA quality and placement
- Overall score = weighted sum, 0-100
- Recomputes overall from dimension scores to ensure accuracy (don't trust model's arithmetic)

### Step 7 — Content Rewrite (`rewriter.py`)
- Model: GPT-OSS-120b (rewrite tier)
- Generates:
  - `rewritten_intro` — 2 paragraphs, customer-first, specific
  - `rewritten_h2_headings` — answer-shaped headings
  - `faq_block` — 10-12 Q&As grounded in unanswered queries
  - `comparison_section` — factual competitor comparison
  - `cta_rewrite` — specific, action-forward CTA
  - `trust_placeholders` — templates with [PLACEHOLDER] for real data
  - `before_after_summary` — 2-sentence summary

---

## Free Model Tiers (OpenRouter)

| Tier | Model | Context | Best For |
|------|-------|---------|----------|
| `qwen` | `openai/gpt-oss-120b:free` | 131K | Structured extraction |
| `nemotron` | `nvidia/nemotron-3-super-120b-a12b:free` | 262K | Reasoning, scoring |
| `rewrite` | `openai/gpt-oss-120b:free` | 131K | Content generation |
| `fallback` | `openai/gpt-oss-120b:free` | 131K | Reliable fallback |

**Important**: Nemotron outputs `<think>...</think>` blocks before JSON. The `_parse_response()` function in `openrouter.py` strips these with regex before parsing.

`response_format: json_object` is only sent for nemotron, rewrite, fallback tiers (not qwen — causes issues).

---

## API Keys Required

| Service | Used For | Free Tier |
|---------|----------|-----------|
| OpenRouter | Qwen/Nemotron/GPT-OSS scoring and rewrites | Yes — free models/router |
| Jina Reader / Embeddings / Reranker | URL → markdown, semantic retrieval, top-chunk reranking | Free trial/token tier |
| Tavily | Grounded SERP discovery | User-provided API key |
| Exa | Full-text competitor extraction | User-provided API key |

Keys live in `backend/.env`. Do not commit real keys.

### Optional Enhancement (not implemented)
Brave Search API has a free tier (2000 searches/month) and could supplement the LLM-based URL discovery for better competitor discovery on niche topics.

---

## Running the Backend

```bash
cd backend
.venv/bin/uvicorn main:app --reload --port 8000
```

SSE endpoint: `POST http://localhost:8000/analyze`

Health check: `GET http://localhost:8000/analyze/health`

### Optional live pipeline check

This check contacts external services and requires local credentials. It is not part of the offline automated test suite.

```bash
cd backend
PYTHONPATH=. .venv/bin/python -c "
from dotenv import load_dotenv
load_dotenv('.env')
from pipeline.aeo_pipeline import AnalyzeRequest, run
req = AnalyzeRequest(
    url='https://www.gorgias.com',
    page_type='product',
    target_customer='ecommerce brands',
    primary_action='book demo',
    competitors=['Zendesk', 'Freshdesk'],
    category='ecommerce customer support software',
)
for event in run(req):
    print(f'[{event.status}] Step {event.step}: {event.label}')
"
```

---

## Known Issues and Fixes

### lxml import error in trafilatura
```
lxml.html.clean module is now a separate project lxml_html_clean
```
Fix: `pip install lxml_html_clean` — already in `requirements.txt`

### Nemotron thinking blocks break JSON parse
Nemotron outputs `<think>...</think>` before JSON responses.
Fix: `_parse_response()` in `openrouter.py` strips these with `re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)`

### Scorer returning all-zero dimensions
Root cause: Overly complex/long system prompt causes model to return string values instead of dicts.
Fix: Simplified `scorer._SYSTEM` to compact JSON schema. Added dimension sanitization loop that coerces all values to dicts with a `score` key.

### Rewriter returning empty FAQ
Root cause: Page content truncation was 3000 chars — too long, causing model to drop structured sections.
Fix: Reduced to `content[:1500]` in `_build_rewrite_prompt()`.

### Free model availability
At time of testing (2026-04-26), rate-limited/unavailable: `qwen/qwen3-coder:free`, `meta-llama/llama-3.3-70b-instruct:free`.
Working reliably: `openai/gpt-oss-120b:free`, `nvidia/nemotron-3-super-120b-a12b:free`.
All model tiers configured to these two in `.env`.

---

## SSE Event Format

Events are yielded as `PipelineEvent` objects serialized to Server-Sent Events:

```json
{
  "step": 3,
  "total_steps": 7,
  "label": "Query variants ready",
  "status": "done",
  "data": {
    "query_count": 22,
    "intents": {"informational": 4, "comparison": 3, ...},
    "sample_queries": ["how does gorgias integrate with shopify", ...]
  }
}
```

The final event (`step == total_steps`, `label == "Analysis complete"`) contains the full result in `data.result`.

---

## Phase 2: Knowledge Graph (Not Yet Implemented)

Plan: SQLite-based cache of competitor intelligence per category.
- After each pipeline run, persist competitor page signals (headings, FAQ patterns, benchmarks)
- On subsequent runs for the same category, use cached competitor data (skip live fetch)
- Build entity graph: product → features → competitors → customer types
- Would improve: benchmark accuracy, pattern detection, cross-run learning

---

## Scoring Dimensions — Deep Dive

### Specificity (25%)
Single most predictive AEO signal. Counts specific/verifiable claims vs. vague superlatives.
- Specific: "reduces response time by 40%", "used by 10,000+ Shopify stores"
- Vague: "best platform", "industry-leading", "boost performance"

### Query Coverage (20%)
Of 22 generated real-user queries, how many does the page directly answer?
Unanswered queries become the FAQ generation brief in Step 7.

### Extractability (20%)
Can an AI engine pull a clean 1-2 sentence answer from each H2 section?
Weak sections: ones that open with marketing preamble instead of a direct answer statement.

### Competitor Gap (15%)
Compares draft against benchmark (avg across competitor pages):
- Specific claims count vs. avg
- FAQ question count vs. avg
- Trust signals vs. avg
- Whether comparison block exists (% of competitors have one)

### Trust Density (10%)
Social proof quality and quantity:
- Named customers (with attribution)
- Testimonials with specific outcomes
- Case study metrics ("reduced tickets by 30%")

### Action Clarity (10%)
CTA quality and placement:
- Specificity of CTA text ("Start 7-day free trial" vs. "Get started")
- Whether CTA appears above the fold
- Whether CTA matches buyer stage (trial for evaluation, demo for enterprise)
