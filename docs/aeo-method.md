# AEO Method

This backend is a pre-publish AEO scorer. It answers one practical question:

> If this page went live today, would answer engines be able to find, extract, trust, and cite the right answer?

The active method intentionally combines deterministic scoring, retrieval simulation, grounded competitor research, and optional LLM judging. LLMs help interpret evidence, but they are not the sole source of truth.

## Pipeline

1. **Fetch content**
   - Use Jina Reader first for URL-to-markdown.
   - Fall back to Exa full text when Jina cannot return usable content.
   - Draft content can be supplied directly with `draft_content`.

2. **Original AEO scoring**
   - Content Score is deterministic and remains the original hero baseline.
   - GEU Score measures answer-engine usability signals.
   - Access and extraction checks inspect robots, noindex, nosnippet, schema, headings, word count, and extraction warnings.

3. **Query generation**
   - Generate target-customer query variants for product, pricing, comparison, FAQ, service, and landing pages.
   - If the user supplies `target_query`, it is inserted as the first query.

4. **Grounded competitor research**
   - Tavily discovers likely SERP competitors.
   - Exa and Jina fetch readable competitor content.
   - Competitor pages are chunked and annotated with source IDs.

5. **Retrieval simulation and citation readiness**
   - Chunk the page into answer-sized markdown blocks.
   - Rank chunks with lexical similarity, Jina embeddings, and Jina reranking when available.
   - Score direct answer quality, evidence, specificity, self-containedness, and position.
   - Compare the user's best chunk against the best competitor chunk.
   - Run a research-backed pre-publish evaluation layer.

6. **Query Match and gap**
   - Query Match Score combines deterministic retrieval signals with Qwen, Nemotron, and GPT-OSS judge readouts.
   - Hero gap is always:

```text
Content Score - Query Match Score
```

7. **Optimization output**
   - Produce the highest-impact fix.
   - Generate answer-first copy, FAQ suggestions, citation/stat placeholders, JSON-LD, `llms.txt`, research-backed priorities, and query portfolio diagnostics.

## Original AEO Scores

### Content Score

The Content Score is deterministic and sums to 100:

| Signal | Weight |
| --- | ---: |
| FAQ | 20 |
| Stats/numbers | 15 |
| Citations/sources | 20 |
| Schema | 15 |
| Comparison | 10 |
| Fluency | 10 |
| `llms.txt` | 10 |

### GEU Score

The GEU Score is deterministic and sums to 100:

| Signal | Weight |
| --- | ---: |
| Standalone answer sentences | 30 |
| Front-loaded answer | 25 |
| Sourced claims | 25 |
| Coherent opening | 20 |

## Citation Readiness

Citation readiness is query-aware when a target query exists.

| Signal | Query Weight |
| --- | ---: |
| Access | 10% |
| Extraction | 10% |
| Retrieval | 20% |
| Answer extraction | 20% |
| Evidence | 15% |
| Structure | 10% |
| Freshness | 5% |
| Competitive gap | 10% |

Without a target query, readiness uses only access, extraction, evidence, structure, and freshness.

## Competitive Citation Gap

The competitive gap compares the user's top retrieved chunk with the strongest retrieved competitor chunk.

It returns:

- `winner`
- `winningCompetitor`
- `userTopChunk`
- `competitorTopChunk`
- `scoreDelta`
- `failureMode`
- `missingAttributes`
- `whyCompetitorWon`
- `competitorGapScore`

Failure modes are:

- `Answer Failure`
- `Evidence Failure`
- `Retrieval Failure`
- `Specificity Failure`
- `Structure Failure`
- `Competitor Structure Advantage`

## Research-Backed Pre-Publish Evaluation

The new evaluation layer lives in `backend/pipeline/prepublish_evaluation.py`.

It produces:

- `aiFeatureEligibility`: indexability, snippet controls, robots, reader visibility
- `ragSimulation`: query fan-out retrieval and answerability metrics
- `geoMethodCoverage`: citations, statistics, authority, quotes, fluency, comparison
- `structuredDataIntegrity`: schema presence and visible-content alignment checks
- `competitivePressure`: user-vs-competitor answer strength
- `priorityActions`: ranked actions to improve the page before publishing

This layer does not replace the original AEO score. It adds a research-backed decision layer for optimization.
