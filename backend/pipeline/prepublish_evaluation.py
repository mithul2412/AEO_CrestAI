"""Research-backed pre-publish AEO evaluation.

This layer turns the academic/official guidance into deterministic checks:
- Google AI features: indexed, snippet-eligible, crawlable, visible textual content.
- RAGAS-style evaluation: retrieval context, answerability, and grounded answer proxy.
- GEO methods: citations, statistics, authoritative phrasing, fluency, and quotation-ready copy.
- BEIR/Lost-in-the-Middle implications: hybrid retrieval plus front-loaded answer chunks.
"""
from __future__ import annotations

import re
from typing import Any

from pipeline.content_signals import (
    clamp_score,
    get_average_sentence_length,
    get_citation_signals,
    get_headings,
    get_numeric_signals,
    has_answer_like_opening,
    has_comparison_signal,
)


def _avg(values: list[int | float]) -> int:
    return clamp_score(sum(values) / len(values)) if values else 0


def _pct(count: int, total: int) -> int:
    return clamp_score((count / total) * 100) if total else 0


def _ai_feature_eligibility(page_intelligence: dict[str, Any]) -> dict[str, Any]:
    access = page_intelligence.get("access", {}) or {}
    extraction = page_intelligence.get("extraction", {}) or {}
    robots = access.get("robots", {}) or {}
    robots_meta = extraction.get("robotsMeta", {}) or {}
    blockers: list[str] = []
    warnings: list[str] = []
    score = 100

    status_code = access.get("statusCode")
    if status_code and status_code >= 400:
        score -= 50
        blockers.append(f"HTTP {status_code} blocks reliable crawling.")
    if access.get("indexable") is False:
        score -= 45
        blockers.append("The page is not indexable.")
    if robots.get("googlebot") == "blocked":
        score -= 45
        blockers.append("robots.txt blocks Googlebot.")
    for crawler in ("oaiSearchBot", "gptBot", "perplexityBot"):
        if robots.get(crawler) == "blocked":
            score -= 8
            warnings.append(f"robots.txt blocks {crawler}.")
    if robots_meta.get("noindex"):
        score -= 45
        blockers.append("robots meta noindex blocks eligibility.")
    if robots_meta.get("nosnippet"):
        score -= 30
        blockers.append("robots meta nosnippet blocks answer preview/citation reuse.")
    if robots_meta.get("maxSnippet"):
        score -= 10
        warnings.append(f"robots meta {robots_meta['maxSnippet']} may limit reusable answer text.")
    if not access.get("contentAccessibleViaReader") and status_code:
        score -= 20
        warnings.append("Reader extraction did not confirm enough AI-visible content.")
    if extraction.get("wordCount", 0) < 250:
        score -= 18
        warnings.append("AI-visible text is thin for answer generation.")

    final_score = clamp_score(score)
    return {
        "score": final_score,
        "eligible": final_score >= 70 and not blockers,
        "blockers": blockers,
        "warnings": warnings,
        "principle": "Eligible for AI search features requires indexability, snippet eligibility, crawlability, and visible text.",
    }


def _rag_simulation(
    benchmark_queries: list[dict[str, Any]],
    citation_intelligence: dict[str, Any],
) -> dict[str, Any]:
    rows = benchmark_queries or []
    if not rows and citation_intelligence.get("retrieval"):
        retrieval = citation_intelligence.get("retrieval", {})
        answer = citation_intelligence.get("answerExtraction", {})
        top = (retrieval.get("top_chunks") or [{}])[0]
        rows = [{
            "query": retrieval.get("query", ""),
            "intent": "target",
            "retrieval_score": retrieval.get("retrieval_score", 0),
            "answer_score": answer.get("answer_score", 0),
            "direct_answer": answer.get("direct_answer_found", False),
            "top_chunk_position": top.get("position"),
            "diagnosis": retrieval.get("diagnosis", ""),
        }]

    retrieval_scores = [row.get("retrieval_score", 0) for row in rows]
    answer_scores = [row.get("answer_score", 0) for row in rows]
    direct = [row for row in rows if row.get("direct_answer")]
    early = [
        row
        for row in rows
        if isinstance(row.get("top_chunk_position"), (int, float)) and row.get("top_chunk_position") <= 0.25
    ]
    strong = [
        row
        for row in rows
        if row.get("retrieval_score", 0) >= 65 and row.get("answer_score", 0) >= 60
    ]
    weak = [
        {
            "query": row.get("query", ""),
            "intent": row.get("intent", ""),
            "retrievalScore": row.get("retrieval_score", 0),
            "answerScore": row.get("answer_score", 0),
            "diagnosis": row.get("diagnosis", ""),
        }
        for row in rows
        if row.get("retrieval_score", 0) < 65 or row.get("answer_score", 0) < 60
    ][:6]
    score = clamp_score(
        _avg(retrieval_scores) * 0.35
        + _avg(answer_scores) * 0.30
        + _pct(len(direct), len(rows)) * 0.20
        + _pct(len(early), len(rows)) * 0.15
    )
    return {
        "score": score,
        "queriesTested": len(rows),
        "contextRelevance": _avg(retrieval_scores),
        "answerability": _avg(answer_scores),
        "directAnswerRate": _pct(len(direct), len(rows)),
        "earlyAnswerRate": _pct(len(early), len(rows)),
        "fanoutCoverage": _pct(len(strong), len(rows)),
        "weakQueries": weak,
        "principle": "AEO should be tested as a RAG problem: can the system retrieve focused context and quote a faithful answer?",
    }


def _geo_method_coverage(markdown: str, competitor_grounding: dict[str, Any]) -> dict[str, Any]:
    citations = get_citation_signals(markdown)
    numbers = get_numeric_signals(markdown)
    avg_sentence = get_average_sentence_length(markdown)
    has_quotes = bool(re.search(r'"[^"]{20,160}"|“[^”]{20,160}”', markdown))
    methods = [
        {
            "id": "statistics",
            "label": "Statistics Addition",
            "applied": len(numbers) >= 2,
            "fix": "Add specific, verified metrics near the answer block.",
        },
        {
            "id": "citation",
            "label": "Cite Sources",
            "applied": citations.get("total", 0) >= 2,
            "fix": "Attach credible source links or named attributions to factual claims.",
        },
        {
            "id": "authoritative",
            "label": "Authoritative Voice",
            "applied": bool(citations.get("attributions") or citations.get("source_names")),
            "fix": "Name the research source, dataset, analyst, or methodology behind key claims.",
        },
        {
            "id": "quotation",
            "label": "Quotation Addition",
            "applied": has_quotes,
            "fix": "Add attributable expert or customer quotes only when they are real and approved.",
        },
        {
            "id": "fluency",
            "label": "Fluency Optimization",
            "applied": 8 <= avg_sentence <= 28,
            "fix": "Shorten overlong sentences and remove vague marketing filler.",
        },
        {
            "id": "comparison",
            "label": "Comparison Framing",
            "applied": has_comparison_signal(markdown) or bool(competitor_grounding.get("pages")),
            "fix": "Add a comparison or buying-criteria block for commercial queries.",
        },
    ]
    applied = [method for method in methods if method["applied"]]
    missing = [method for method in methods if not method["applied"]]
    return {
        "score": _pct(len(applied), len(methods)),
        "applied": applied,
        "missing": missing,
        "citationCount": citations.get("total", 0),
        "numericSignalCount": len(numbers),
        "averageSentenceLength": round(avg_sentence, 1),
        "principle": "GEO-style content changes are most defensible when they add real citations, statistics, quotes, fluency, and authority.",
    }


def _structured_data_integrity(markdown: str, page_intelligence: dict[str, Any]) -> dict[str, Any]:
    extraction = page_intelligence.get("extraction", {}) or {}
    schema_types = extraction.get("schemaTypes", []) or []
    warnings: list[str] = []
    score = 100

    if not schema_types:
        score -= 35
        warnings.append("No structured data was detected.")
    if "Invalid JSON-LD" in schema_types:
        score -= 35
        warnings.append("Invalid JSON-LD was detected.")
    if extraction.get("wordCount", 0) < 250:
        score -= 20
        warnings.append("Structured data should not stand in for thin visible content.")
    if schema_types and not get_headings(markdown):
        score -= 12
        warnings.append("Schema exists, but visible heading structure is weak.")
    if schema_types and not has_answer_like_opening(markdown):
        score -= 10
        warnings.append("Visible copy should clearly reflect the page entity and answer intent.")

    return {
        "score": clamp_score(score),
        "schemaTypes": schema_types,
        "warnings": warnings,
        "principle": "Structured data should be complete, current, and representative of visible page content.",
    }


def _competitive_pressure(competitive_gap: dict[str, Any] | None) -> dict[str, Any]:
    if not competitive_gap:
        return {
            "score": 70,
            "status": "not_run",
            "summary": "Competitive gap was not run.",
            "principle": "Compare against pages that answer engines can actually retrieve and cite.",
        }
    if competitive_gap.get("status") != "ok":
        return {
            "score": 60,
            "status": competitive_gap.get("status", "unknown"),
            "summary": competitive_gap.get("whyCompetitorWon", "Competitive comparison had insufficient data."),
            "principle": "Compare against pages that answer engines can actually retrieve and cite.",
        }
    score = clamp_score(competitive_gap.get("competitorGapScore", 0))
    return {
        "score": score,
        "status": "ok",
        "winner": competitive_gap.get("winner"),
        "failureMode": competitive_gap.get("failureMode"),
        "summary": competitive_gap.get("whyCompetitorWon", ""),
        "principle": "Compare against pages that answer engines can actually retrieve and cite.",
    }


def _priority_actions(
    *,
    eligibility: dict[str, Any],
    rag: dict[str, Any],
    geo: dict[str, Any],
    structured: dict[str, Any],
    competitive: dict[str, Any],
) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    if eligibility.get("blockers"):
        actions.append({
            "priority": 1,
            "type": "technical_eligibility",
            "action": "Fix crawl, indexability, or snippet blockers before content rewriting.",
            "why": eligibility["blockers"][0],
        })
    if competitive.get("winner") == "competitor":
        actions.append({
            "priority": 2,
            "type": "competitive_gap",
            "action": "Bring the top answer block up to the best competitor chunk's directness and proof level.",
            "why": competitive.get("summary", "Competitor has the stronger answer path."),
        })
    if rag.get("fanoutCoverage", 100) < 70:
        weak = rag.get("weakQueries", [])
        actions.append({
            "priority": 3,
            "type": "query_fanout",
            "action": "Add answer-first sections for the weak query fan-out set.",
            "why": f"{rag.get('fanoutCoverage', 0)}% of tested query variants have strong retrieval + answer scores.",
            "queries": [item.get("query", "") for item in weak[:4]],
        })
    if rag.get("directAnswerRate", 100) < 70:
        actions.append({
            "priority": 4,
            "type": "answer_first",
            "action": "Rewrite important sections so the first sentence is a standalone answer.",
            "why": f"Only {rag.get('directAnswerRate', 0)}% of tested queries retrieve a direct-answer chunk.",
        })
    if geo.get("score", 100) < 70:
        missing = geo.get("missing", [])
        actions.append({
            "priority": 5,
            "type": "geo_methods",
            "action": missing[0]["fix"] if missing else "Add real citations, statistics, and authoritative signals.",
            "why": "GEO method coverage is below the target threshold.",
        })
    if structured.get("score", 100) < 75:
        actions.append({
            "priority": 6,
            "type": "structured_data",
            "action": "Make structured data complete and aligned with visible page content.",
            "why": (structured.get("warnings") or ["Structured data integrity score is low."])[0],
        })
    return sorted(actions, key=lambda item: item["priority"])[:6]


def evaluate(
    *,
    markdown: str,
    page_intelligence: dict[str, Any],
    benchmark_queries: list[dict[str, Any]],
    citation_intelligence: dict[str, Any],
    competitor_grounding: dict[str, Any],
    competitive_gap: dict[str, Any] | None,
) -> dict[str, Any]:
    eligibility = _ai_feature_eligibility(page_intelligence)
    rag = _rag_simulation(benchmark_queries, citation_intelligence)
    geo = _geo_method_coverage(markdown, competitor_grounding)
    structured = _structured_data_integrity(markdown, page_intelligence)
    competitive = _competitive_pressure(competitive_gap)
    score = clamp_score(
        eligibility["score"] * 0.25
        + rag["score"] * 0.35
        + geo["score"] * 0.20
        + structured["score"] * 0.10
        + competitive["score"] * 0.10
    )
    return {
        "score": score,
        "summary": (
            "Research-backed pre-publish readiness across eligibility, RAG simulation, "
            "GEO content methods, structured data integrity, and competitive pressure."
        ),
        "aiFeatureEligibility": eligibility,
        "ragSimulation": rag,
        "geoMethodCoverage": geo,
        "structuredDataIntegrity": structured,
        "competitivePressure": competitive,
        "priorityActions": _priority_actions(
            eligibility=eligibility,
            rag=rag,
            geo=geo,
            structured=structured,
            competitive=competitive,
        ),
        "researchBasis": [
            {
                "source": "Google Search Central AI features",
                "appliedAs": "Indexability, snippet eligibility, crawlability, and visible text checks.",
            },
            {
                "source": "GEO: Generative Engine Optimization",
                "appliedAs": "Citation, statistic, authoritative, quotation, fluency, and comparison coverage.",
            },
            {
                "source": "Ragas",
                "appliedAs": "Reference-free retrieval/answer quality proxies for query fan-out.",
            },
            {
                "source": "BEIR",
                "appliedAs": "Hybrid lexical/dense/rerank retrieval retained as the default simulation strategy.",
            },
            {
                "source": "Lost in the Middle",
                "appliedAs": "Front-loaded answer position is measured across benchmark queries.",
            },
        ],
    }
