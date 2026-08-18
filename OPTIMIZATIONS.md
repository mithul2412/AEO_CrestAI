# Crest AI — Optimization Roadmap

A prioritized, research-backed plan to take Crest from "working prototype" to "demonstrably better than every commercial AEO tool." Each item is tagged with **evidence strength** (proven / supported / heuristic), **impact**, and **cost to implement**.

---

## The Honest Diagnosis

What the current system does well:
- Full 7-step pipeline runs end-to-end on free infra
- Six-dimension scoring with weighted output
- Generates real rewrites, not just suggestions

What's actually weak (be honest):
1. **Scoring is unfalsifiable.** Six dimensions × LLM judgment ≠ ground truth. We never check if AI engines actually cite the page.
2. **Single-shot LLM calls.** No self-consistency, no panel-of-judges, no verification — free models are noisy and one bad sample tanks a dimension.
3. **Heuristic claim extraction.** We tag claims `specific/vague` based on regex hints. FActScore-style atomic decomposition is better and more defensible.
4. **Competitor research hallucinates URLs.** LLM-discovered competitor pages are stale or fictional ~30% of the time. No external SERP grounding.
5. **No retrieval simulation.** AI engines retrieve passages via dense embeddings + rerank. We don't model this at all.
6. **No real engine measurement.** We never query Perplexity/Gemini/ChatGPT to see citation reality. This is the only honest signal.
7. **No closed loop.** We never learn whether our rewrites actually drove citations post-publish.

The optimizations below address each, in order of impact/cost ratio.

---

## Tier 1 — Highest Impact, Low Cost (do these first)

### 1.1 Self-consistency + panel-of-judges scoring
**Evidence**: Wang et al. 2022 (self-consistency), Liu et al. 2023 (G-Eval), Zheng et al. 2023 (LLM-as-judge bias). Self-consistency adds +5–15 points on reasoning benchmarks. Panel-of-judges removes single-model bias.
**Impact**: Biggest reliability gain available without changing infra.
**Cost**: 3–5× LLM calls on the scorer step only (~30 sec extra wall-clock).

**Implementation**:
- Run `scorer.run()` with n=3 samples, take median per dimension
- Run with both available models (`gpt-oss-120b` AND `nemotron-3-super`), average across models
- Force structured rubric in the prompt to reduce verbosity bias

```python
# pipeline/scorer.py
def run(...):
    samples = []
    for model_tier in ["nemotron", "rewrite"]:
        for _ in range(3):
            r = call(_SYSTEM, user, tier=model_tier, ...)
            if r and "dimensions" in r: samples.append(r)
    return _aggregate_median(samples)
```

### 1.2 Chain-of-Verification on claim extraction
**Evidence**: Dhuliawala et al. 2023 (Meta CoVe). Reduces factuality hallucinations 20–30% on long-form generation.
**Impact**: Catches fabricated claims the decomposer invents that aren't actually on the page.
**Cost**: 1 extra LLM call per page in step 2.

**Implementation** in `decompose.py`:
1. First pass: extract claims as today
2. Generate 5 verification questions ("Does the page literally contain claim X?")
3. Second pass: answer each verification question against the raw page content
4. Drop or downgrade claims that fail verification

### 1.3 Atomic proposition decomposition (replace claim extraction)
**Evidence**: Min et al. 2023 (FActScore) — atomic decomposition correlates r≈0.8 with human factuality, vs r≈0.4–0.5 for claim-level. Chen et al. 2023 (Dense X Retrieval) — propositions retrieve 5–15 points better than passages.
**Impact**: Better specificity scoring AND better query generation (each proposition → testable query).
**Cost**: Moderate — replace current claim regex with LLM-based atomic decomposition.

**Schema**:
```json
{
  "propositions": [
    {"text": "Gorgias reduces response time by 40%",
     "subject": "Gorgias", "predicate": "reduces", "object": "response time by 40%",
     "verifiable": true, "has_number": true, "supports": "value_prop"}
  ]
}
```

### 1.4 Brave Search API for competitor URL grounding
**Evidence**: Free tier 2000 queries/month. Real SERP results, not hallucinated.
**Impact**: Replace the ~30% hallucinated competitor URLs. Anchors all downstream pattern analysis in reality.
**Cost**: One free API key. 5 SERP calls per pipeline run.

**Implementation** in `providers/`:
- Add `brave.py` — search top 10 results per "best [category]" query
- In `tavily.py`, prefer Brave URLs over LLM-suggested URLs
- Fall back to LLM only if Brave returns nothing useful

---

## Tier 2 — Game-Changing, Moderate Cost (the actual moat)

### 2.1 Real AI engine measurement (Perplexity Sonar + Gemini grounding)
**Evidence**: Only first-party APIs that expose citations cleanly. This is the only ground-truth signal that exists.
**Impact**: Transforms Crest from "heuristic scorer" to "actually-measured platform." Defensibly better than every competitor, because most use simulated scoring too.
**Cost**: Perplexity Sonar is paid (~$5/1M tokens, ~$0.01/run); Gemini API has a free tier (15 RPM). OpenAI Responses API with `web_search` for ChatGPT-search measurement.

**The flow that wins**:
1. Generate 22 queries (current step 3)
2. For each query: call Perplexity Sonar, Gemini-grounded, OpenAI web_search
3. Parse citations from each response
4. Compute **share of voice** = (queries where target URL appears in citations) / (total queries)
5. Compute **competitor share of voice** for each named competitor
6. **This becomes the headline metric.** Six-dimension scoring becomes the diagnostic that explains *why* SoV is low.

**Pre-publish flow**: measure competitor SoV today → diagnose what they have that you don't → rewrite → re-measure post-publish.

This is the single biggest differentiator vs Profound/AthenaHQ/Otterly. They all measure SoV post-publish. We measure pre-publish by running the same queries against the *current* SERP and showing what the user is missing before they ship.

### 2.2 Retrieval simulation with embeddings
**Evidence**: BGE-M3 (BAAI), nomic-embed-text-v2 — both top-tier free embedding models on MTEB 2026. Real AI engines (Perplexity, Phind) use dense retrieval over 300–500 token chunks with header context.
**Impact**: For each of the 22 queries, simulate which passages an AI engine would retrieve from the page. If the answer-shaped passage doesn't appear in top-k, the page won't get cited regardless of overall quality.
**Cost**: 1 embedding call per chunk + 22 query embeddings. ~$0.001/page on hosted, free if self-hosted.

**Implementation**:
1. Chunk page using recursive structural splitter (markdown headers preserved as context prefix), 400 tokens with 50 overlap
2. Embed all chunks with `nomic-embed-text-v2` (free via Nomic API or local)
3. For each generated query, embed and find top-5 chunks via cosine similarity
4. **New scoring dimension: "Retrievability per query"** — for each query, is there a chunk whose top-1 retrieval rank is below 3?
5. Identify "blind spots" — queries with no high-similarity chunk → these are FAQ candidates

### 2.3 Princeton GEO tactics — bake into rewriter
**Evidence**: Aggarwal et al. 2023 (NeurIPS 2024), GEO-bench dataset. Three tactics with measured +30–40% visibility lift:
- **Cite Sources** — add inline citations to authoritative sources
- **Add Quotations** — direct quotes from named experts
- **Add Statistics** — replace qualitative claims with numbers

**Impact**: This is the only well-validated set of GEO tactics. Currently we generate FAQs and CTAs but don't enforce these three patterns.
**Cost**: Prompt engineering only.

**Implementation** in `rewriter.py` — add to system prompt:
> Every paragraph you rewrite must contain ONE of: (a) a specific number or percentage, (b) a direct quoted statement attributed to a named source, or (c) an inline citation to a credible URL. Mark each instance with [STAT], [QUOTE], or [CITE].

Then in scoring, count occurrences as a derived metric.

---

## Tier 3 — Defensible Long-Term Moat (Phase 2)

### 3.1 Closed-loop learning database
**Evidence**: Standard ML practice — no public AEO tool does this yet because they all started post-publish.
**Impact**: Long-term, this is the *only* compounding moat. After 6 months we know which rewrite patterns actually drove citations vs which didn't.
**Cost**: SQLite + cron job that re-measures published pages weekly.

**Schema**:
```sql
CREATE TABLE runs (id, url, run_at, scorecard_json, rewrite_json);
CREATE TABLE measurements (run_id, query, engine, target_cited, competitors_cited_json, measured_at);
CREATE TABLE rewrite_outcomes (run_id, days_post_publish, sov_delta, dimension_deltas_json);
```

After 100 runs, query: "which dimensions, when improved by ≥20 points, correlate with ≥10pp SoV gain in 30 days?" That's a derived ranking of which scoring dimensions actually matter — feed back into the weighting.

### 3.2 Knowledge graph layer
**Evidence**: Entity-centric retrieval is well-established (TREC, MS MARCO entity tracks). Not yet validated specifically for AEO.
**Impact**: Catches cross-page entity gaps competitors cover that we don't. E.g., "competitors all mention Klaviyo integration; we don't."
**Cost**: Moderate — entity extraction LLM call per page + simple SQLite edge tables.

**Schema**:
```
nodes: (id, type [product|feature|integration|customer|metric], name)
edges: (src, dst, relation, source_url)
```

For each pipeline run, extract entities, store. Then for each new page: query "which integration/feature entities appear in ≥3 competitor pages but not in this draft?" → that's the gap.

### 3.3 Conversation/prompt corpus per persona-funnel-stage
**Evidence**: Profound's main differentiator. No academic paper, but observed industry-leading.
**Impact**: Current 22 queries are LLM-generated and generic. Real users at different funnel stages ask completely different things.
**Cost**: Build once per category, reuse forever.

**Implementation**:
- For each category, build 4 personas × 5 funnel stages × 5 queries = 100-query corpus
- Source from: Reddit search APIs, public Quora dumps, support ticket samples (when client provides)
- Score and rewrite against the full 100, not just LLM's 22 guesses

### 3.4 Sentiment + context of citation
**Evidence**: Peec.ai pioneered. Common sense — being cited as "an example of bad pricing" hurts you.
**Impact**: When measuring SoV (Tier 2.1), also classify *how* the page is cited. Negative mentions count against, not for.
**Cost**: 1 extra LLM call per cited mention.

---

## Tier 4 — Production Hardening

### 4.1 Caching layer
- Competitor research per category (TTL: 7 days) — saves 50% of pipeline cost on repeat runs
- Embeddings for stable competitor pages — saves recompute
- SQLite-backed, keyed by `(category, competitors_sorted)`

### 4.2 Async + retry with backoff
Currently synchronous. Convert to `asyncio` with proper semaphore on OpenRouter free-tier rate limits (20 RPM). Exponential backoff on 429s.

### 4.3 Schema markup generation
**Evidence**: Schema doesn't directly drive AI citations (FAQ schema deprecated by Google in 2023). BUT it improves traditional SERP ranking, and AI Overviews cite top-10 SERP results 50–65% of the time (Authoritas studies).
**Impact**: Indirect lift via SEO. Worth doing because it's free output.
**Cost**: Generate JSON-LD alongside rewrites. One extra section in `rewriter.py`.

Add to rewriter output:
```json
{
  "schema_markup": {
    "faqpage_jsonld": "...",
    "product_jsonld": "...",
    "howto_jsonld": "..."
  }
}
```

---

## What NOT to Build (keep us honest)

- **"AI Overview tracker"** — no first-party API, requires SerpAPI ($50–200/mo). Out of scope for free tier.
- **ChatGPT consumer scraping** — Playwright + residential proxies. Fragile, ToS-gray, not worth it.
- **More dimensions** — six is already a lot. Better to make six rigorous than add a seventh that's also handwavy.
- **"GEO score" as a single number** — meaningless without calibration against real SoV. Lead with SoV, use the 6-dim score as the *explanation*.
- **Heavy frontend dashboards** — user explicitly said don't care. Keep CLI/API focused.

---

## Prioritized Implementation Order

| # | Item | Tier | Days |
|---|------|------|------|
| 1 | Self-consistency + panel-of-judges in scorer | 1.1 | 1 |
| 2 | Brave Search API for competitor grounding | 1.4 | 1 |
| 3 | CoVe on claim verification | 1.2 | 1 |
| 4 | Atomic proposition decomposition | 1.3 | 2 |
| 5 | Princeton GEO tactics in rewriter | 2.3 | 1 |
| 6 | Retrieval simulation (embeddings + per-query retrievability) | 2.2 | 3 |
| 7 | Real engine measurement (Perplexity Sonar + Gemini) | 2.1 | 3 |
| 8 | Closed-loop measurement DB | 3.1 | 5 |
| 9 | Knowledge graph layer | 3.2 | 7 |
| 10 | Persona/funnel prompt corpus | 3.3 | 5 |

**Total to "demonstrably better than commercial competitors": ~15 days of focused work.**

Tier 1 alone (5 days) puts us ahead of Otterly and most "AI SEO" bolt-ons. Tier 2 (additional 7 days) puts us level with Profound/AthenaHQ. Tier 3 (additional 17 days) is the real moat — nobody else has closed-loop learning yet because they're all post-publish tools.

---

## Honest Caveats

- Princeton GEO tactic numbers (+30–40%) come from one paper, one model (GPT-3.5 + Bing), one benchmark. Real-world lift will vary.
- AI Overviews citation overlap with top-10 SERP (50–65%) is from vendor studies (BrightEdge, Authoritas) — directionally trustworthy, not bulletproof.
- FAQ schema has been deprecated by Google for non-authoritative sites since August 2023. Don't promise FAQ schema = more citations.
- LLM-as-judge with weak free models has 60–70% agreement with humans even with self-consistency. Score deltas <10 points should be treated as noise.
- "Retrieval simulation" is a proxy for what AI engines actually do. We don't know their chunkers or rerankers. Calibrate against real engine measurement (Tier 2.1) — without that, our retrieval scores are unfalsifiable.
