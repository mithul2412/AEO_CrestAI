# Crest AI — Debugging Log

## Session 1 (2026-04-26) — Pipeline Build & Debug

### What was built

Full 7-step AEO pipeline from scratch:
1. Jina URL fetcher
2. Page decomposer (claims, trust signals, headings)
3. Query generator (22 queries, 6 intent types)
4. Competitor researcher (LLM URL discovery + Jina fetch)
5. Pattern analyzer (benchmark extraction)
6. 6-dimension AEO scorer
7. Content rewriter (FAQ, headings, comparison, CTAs)

FastAPI backend with SSE streaming, Python 3.9.6 venv.

---

### Errors Encountered and Fixed

#### 1. `lxml.html.clean module` ImportError
```
ImportError: lxml.html.clean module is now a separate project lxml_html_clean
```
**Fix**: `pip install lxml_html_clean==0.4.1` — added to `requirements.txt`

---

#### 2. `cannot import name 'call_groq'`
```
ImportError: cannot import name 'call_groq' from 'providers.openrouter'
```
`decompose.py` and `queries.py` had leftover `call_groq` imports from an earlier design.
**Fix**: Changed all `call_groq(...)` calls to `call(..., tier="fallback")` in both files.

---

#### 3. OpenRouter returning `None` silently in test scripts
All pipeline steps returning None in standalone tests.
Root cause: `.env` not loaded before provider imports in test scripts.
**Fix**: Add `load_dotenv('.env')` before any pipeline calls in test scripts:
```python
from dotenv import load_dotenv
load_dotenv('.env')
```

---

#### 4. Nemotron thinking blocks breaking JSON parse
Nemotron model outputs `<think>...</think>` XML blocks before the JSON response, causing `json.loads()` to fail.
**Fix** in `providers/openrouter.py → _parse_response()`:
```python
import re as _re
text = _re.sub(r"<think>.*?</think>", "", text, flags=_re.DOTALL).strip()
```

---

#### 5. `AttributeError: 'str' object has no attribute 'get'` in scorer
Step 6 dimension iteration crashed because Nemotron returned dimension values as strings instead of dicts.
**Fix** in `pipeline/scorer.py → run()`:
```python
clean_dims: dict[str, Any] = {}
for k, v in raw_dims.items():
    if isinstance(v, dict):
        clean_dims[k] = v
    elif isinstance(v, (int, float)):
        clean_dims[k] = {"score": int(v)}
    else:
        clean_dims[k] = {"score": 0, "evidence": str(v)[:100], "gap": ""}
result["dimensions"] = clean_dims
```

---

#### 6. Scorer returning all-zero dimension scores
After the sanitization fix, all scores came back as 0.
Root cause: Overly long/complex system prompt caused the model to not engage with the scoring rubric.
**Fix**: Simplified `scorer._SYSTEM` to a compact JSON schema with scoring guide. Removed verbose explanations. Moved all context to the user prompt via `_build_scoring_prompt()`.

Also simplified `_build_scoring_prompt()` to send only essential facts:
- Claim counts (not raw claim texts)
- FAQ presence (boolean + count)
- Benchmark averages only (not raw competitor data)
- Sample queries (not all 22)

---

#### 7. Rewriter returning empty `faq_block: []`
Step 7 rewriter returned all empty fields despite FAQ queries being available.
Root cause: Page content sent at `content[:3000]` was too long, causing the model to fill its token budget on the content instead of generating the structured output.
**Fix**: Reduced to `content[:1500]` in `pipeline/rewriter.py → _build_rewrite_prompt()`.

---

### Free Model Availability (tested 2026-04-26)

| Model | Status |
|-------|--------|
| `openai/gpt-oss-120b:free` | ✅ Working reliably |
| `nvidia/nemotron-3-super-120b-a12b:free` | ✅ Working (outputs think blocks — strip them) |
| `qwen/qwen3-coder:free` | ❌ Rate limited |
| `meta-llama/llama-3.3-70b-instruct:free` | ❌ Rate limited |
| `google/gemma-3-27b-it:free` | ❌ Rate limited |

**Current config**: All 4 model tiers in `.env` point to one of the two working models.

---

### End-to-End Test Results (Gorgias.com)

Test command:
```bash
cd backend
PYTHONPATH=. .venv/bin/python -c "
from dotenv import load_dotenv; load_dotenv('.env')
from pipeline.aeo_pipeline import AnalyzeRequest, run
req = AnalyzeRequest(
    url='https://www.gorgias.com',
    page_type='product', target_customer='ecommerce brands',
    primary_action='book demo',
    competitors=['Zendesk', 'Freshdesk'],
    category='ecommerce customer support software',
)
for event in run(req):
    print(f'[{event.status}] Step {event.step}: {event.label}')
"
```

All 7 steps complete. Final rewrite output (after 1500-char fix):
- FAQ: 10 questions generated ✅
- Trust placeholders: 3 ✅
- H2 headings: 0 (under investigation — may be gorgias homepage h2s not extracted)
- Intro: needs re-check

---

### Confirmed Pipeline Status (2026-04-26)

Full end-to-end run on `https://www.gorgias.com` — all 7 steps working:

| Step | Status | Output |
|------|--------|--------|
| 1 Fetch | ✅ | 44,665 chars from Jina |
| 2 Decompose | ✅ | Claims extracted (note: Gorgias homepage is JS-heavy, minimal H2s in markdown) |
| 3 Queries | ✅ | 22 queries across 6 intent types |
| 4 Search | ✅ | Competitor pages fetched |
| 5 Patterns | ✅ | Benchmark computed |
| 6 Score | ✅ | 6-dimension scorecard |
| 7 Rewrite | ✅ | 4 H2s, 9 FAQs, intro (603 chars), comparison (434 chars), 3 trust placeholders |

Note on H2 headings from decomposer being `[]`: Gorgias homepage uses JS-rendered page structure — the markdown Jina returns has no `##` headings. This is correct behavior. The rewriter generates new answer-shaped H2 suggestions regardless.

---

### Next Steps

1. Run on 5-10 more real sites (B2B SaaS, agency, ecommerce tool pages)
2. Document before/after AEO scores to show meaningful impact
3. Consider Brave Search API (free tier, 2000/month) to improve competitor URL discovery
4. Phase 2: Knowledge graph — SQLite cache of competitor intelligence per category
