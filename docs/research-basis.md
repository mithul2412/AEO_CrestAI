# Research Basis

This document explains how external research and official guidance map into the algorithm.

## Google AI Features

Source: [Google Search Central, AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)

Key takeaways applied:

- AI Overviews and AI Mode use normal Search eligibility principles.
- A page needs to be indexed and eligible to show a snippet.
- Crawlability, internal discoverability, page experience, visible text, and structured data consistency still matter.
- `nosnippet`, `data-nosnippet`, `max-snippet`, and `noindex` can limit or block AI feature reuse.

Implementation:

- `access_intelligence.py` checks robots, status code, noindex, nosnippet, max-snippet, headings, schema, and thin extraction.
- `prepublish_evaluation.py` converts these into `aiFeatureEligibility`.
- Access blockers outrank content rewrite advice because a blocked page cannot be cited reliably.

## Google Structured Data Guidelines

Source: [Google structured data general guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)

Key takeaways applied:

- Structured data pages should not be blocked.
- Structured data should be current, visible to readers, relevant, non-misleading, and complete.
- Schema is not magic markup; it must represent visible page content.

Implementation:

- `access_intelligence.py` detects schema types and invalid JSON-LD.
- `prepublish_evaluation.py` creates `structuredDataIntegrity`.
- Optimization output recommends schema only alongside visible answer content.

## GEO: Generative Engine Optimization

Source: [GEO: Generative Engine Optimization](https://arxiv.org/abs/2311.09735)

Key takeaways applied:

- Visibility can improve when content is made easier for generative engines to cite and summarize.
- Useful interventions include adding citations, statistics, authoritative wording, quotations, and fluency improvements.
- The method should be query-aware and benchmarked against generated engine behavior.

Implementation:

- Original Content Score still rewards FAQ, statistics, citations, schema, comparison, fluency, and `llms.txt`.
- `prepublish_evaluation.py` adds `geoMethodCoverage`, which checks statistics, citations, authority, quotes, fluency, and comparison framing.
- `optimization.py` emits citation/stat placeholders and ranked GEO-oriented priorities.

## RAGAS

Source: [Ragas: Automated Evaluation of Retrieval Augmented Generation](https://arxiv.org/abs/2309.15217)

Key takeaways applied:

- Evaluating retrieval-augmented generation requires multiple dimensions.
- Retrieval must find relevant focused passages.
- Generation must use those passages faithfully.
- Reference-free metrics can support fast iteration when ground truth labels are unavailable.

Implementation:

- The system treats pre-publish AEO as a RAG-readiness problem.
- `retrieval.py` measures query-to-chunk relevance and answer extraction.
- `prepublish_evaluation.py` adds `ragSimulation`, including context relevance, answerability, direct-answer rate, early-answer rate, fan-out coverage, and weak queries.

## BEIR

Source: [BEIR: A Heterogeneous Benchmark for Zero-shot Evaluation of Information Retrieval Models](https://openreview.net/forum?id=wCu6T5xFjeJ)

Key takeaways applied:

- BM25/lexical retrieval is a strong baseline.
- Reranking and late-interaction methods tend to perform well zero-shot, but cost more.
- Robust retrieval evaluation should not rely only on one dense model.

Implementation:

- `retrieval.py` keeps lexical fallback as a first-class path.
- When `JINA_API_KEY` is configured, retrieval upgrades to hybrid embedding and reranking.
- The method reports whether embeddings and reranking were used.

## Lost in the Middle

Source: [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172)

Key takeaways applied:

- Long-context models can miss relevant information in the middle of context.
- Performance is often strongest when relevant content appears at the beginning or end.
- For answer engines, the safest pre-publish pattern is to place the answer early and label it clearly.

Implementation:

- Retrieval scoring rewards early answer positions.
- `ragSimulation` measures `earlyAnswerRate`.
- Optimization recommends moving the strongest answer block near the H1 when retrieval is weak or the answer appears late.

## HyDE

Source: [Precise Zero-Shot Dense Retrieval without Relevance Labels](https://arxiv.org/abs/2212.10496)

Key takeaway:

- Hypothetical answers can help zero-shot retrieval by capturing relevance patterns before grounding back into real documents.

Current status:

- Not implemented as a default because it requires extra model calls and can add hallucinated details if used carelessly.
- Recommended future improvement: optional HyDE-style query expansion behind a feature flag, where generated hypothetical answers are used only for retrieval expansion, never as evidence.
