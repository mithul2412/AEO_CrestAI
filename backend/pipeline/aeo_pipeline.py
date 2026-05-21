"""
SOTA Pre-publish AEO Pipeline — main orchestrator.

Runs 7 steps in sequence, yielding progress events for SSE streaming.
Each step is isolated in its own module for testability.

Usage:
    async for event in run_pipeline(request):
        yield event  # SSE to frontend
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Generator

from providers import exa, jina
from pipeline import (
    access_intelligence,
    citation_intelligence,
    competitive_gap,
    competitor_grounding,
    decompose,
    optimization,
    original_aeo,
    patterns,
    prepublish_evaluation,
    queries,
    query_match,
    rewriter,
    scorer,
)
from pipeline import retrieval as retrieval_sim


@dataclass
class AnalyzeRequest:
    url: str = ""
    draft_content: str = ""
    page_type: str = "product"
    target_customer: str = ""
    primary_action: str = "book demo"
    competitors: list[str] = field(default_factory=list)
    category: str = ""
    target_query: str = ""
    run_legacy_llm_scorecard: bool = True
    include_llm_rewrite: bool = True
    run_competitor_grounding: bool = True


@dataclass
class PipelineEvent:
    step: int
    total_steps: int
    label: str
    status: str  # "running" | "done" | "error"
    data: dict[str, Any] = field(default_factory=dict)


def run(request: AnalyzeRequest) -> Generator[PipelineEvent, None, None]:
    """
    Runs the full 7-step pipeline, yielding a PipelineEvent after each step.
    The final event contains the complete result in data["result"].
    """
    total = 7

    # ── Step 1: Fetch / validate content ─────────────────────────────────────
    yield PipelineEvent(1, total, "Fetching page content", "running")
    try:
        content = _get_content(request)
        yield PipelineEvent(1, total, "Page content ready", "done", {
            "word_count": len(content.split()),
            "char_count": len(content),
        })
    except Exception as e:
        yield PipelineEvent(1, total, f"Fetch failed: {e}", "error")
        return

    # ── Step 2: Original AEO + access/extraction + decomposition ─────────────
    yield PipelineEvent(2, total, "Running original AEO and crawler checks", "running")
    page_intelligence = access_intelligence.run(request.url, content)
    deterministic_aeo = original_aeo.compute_original_aeo(
        content,
        source_signals=page_intelligence.get("source_signals", {}),
    )
    decomposition = decompose.run(content, url=request.url)
    category = request.category or _infer_category(decomposition)
    yield PipelineEvent(2, total, "Original AEO method complete", "done", {
        "content_score": deterministic_aeo.get("content_score", 0),
        "geu_score": deterministic_aeo.get("geu_score", 0),
        "citation_access_score": citation_intelligence.score_access(page_intelligence.get("access")),
        "extraction_warnings": len(page_intelligence.get("extraction", {}).get("warnings", [])),
        "specificity_score": decomposition.get("specificity_score", 0),
        "claims_found": len(decomposition.get("claims", [])),
        "specific_claims": sum(1 for c in decomposition.get("claims", []) if c.get("type") == "specific"),
        "faq_present": decomposition.get("faq_present", False),
        "trust_signals": decomposition.get("trust_signals", {}),
    })

    # ── Step 3: Generate queries ──────────────────────────────────────────────
    yield PipelineEvent(3, total, "Generating real user query variants", "running")
    query_list = queries.run(
        page_type=request.page_type,
        target_customer=request.target_customer,
        category=category,
        competitors=request.competitors,
        decomposition=decomposition,
    )
    if request.target_query and all(q.get("text") != request.target_query for q in query_list):
        query_list.insert(0, {"text": request.target_query, "intent": "target"})
    yield PipelineEvent(3, total, "Query variants ready", "done", {
        "query_count": len(query_list),
        "intents": _count_intents(query_list),
        "sample_queries": [q["text"] for q in query_list[:3]],
    })

    # ── Step 4: Grounded SERP / competitor research ───────────────────────────
    yield PipelineEvent(4, total, "Grounding competitor SERPs with Tavily and Exa", "running")
    grounded_competitors = (
        competitor_grounding.run(
            target_url=request.url,
            category=category,
            target_customer=request.target_customer,
            page_type=request.page_type,
            target_query=request.target_query,
            competitors=request.competitors,
        )
        if request.run_competitor_grounding
        else {
            "queries": [],
            "results": [],
            "pages": [],
            "competitors": [],
            "failures": [],
            "pages_analyzed": 0,
            "providers": {"tavily": False, "exa": False, "openrouter_fallback": False},
            "status": "disabled",
            "reason": "Competitor grounding skipped for baseline analysis.",
        }
    )
    competitor_pages = grounded_competitors.get("pages", [])
    yield PipelineEvent(4, total, "Grounded competitor research complete", "done", {
        "pages_analyzed": grounded_competitors.get("pages_analyzed", 0),
        "queries_searched": len(grounded_competitors.get("queries", [])),
        "has_live_data": len(competitor_pages) > 0,
        "providers": grounded_competitors.get("providers", {}),
    })

    # ── Step 5: Retrieval simulation + citation readiness ─────────────────────
    yield PipelineEvent(5, total, "Simulating retrieval, citation readiness, and competitor gap", "running")
    analysis_query = request.target_query or (query_list[0].get("text", "") if query_list else "")
    competitive_gap_result: dict[str, Any] | None = None
    if analysis_query:
        citation_result = citation_intelligence.build_query_intelligence(
            content,
            analysis_query,
            page_intelligence,
        )
        competitive_gap_result = competitive_gap.compare_user_vs_competitors(
            query=analysis_query,
            user_chunks=citation_result.get("chunks", []),
            competitor_pages=competitor_pages,
            use_external=True,
        )
        citation_result = citation_intelligence.apply_competitive_gap(
            citation_result,
            competitive_gap_result,
        )
        retrieval_result = citation_result.get("retrieval", {})
        answer_extraction = citation_result.get("answerExtraction", {})
    else:
        citation_result = {
            "citationReadiness": citation_intelligence.build_baseline(content, page_intelligence),
            "chunks": retrieval_sim.chunk_markdown(content),
        }
        retrieval_result = {}
        answer_extraction = {}
    benchmark_queries = retrieval_sim.benchmark_retrieval(content, query_list, limit=10)
    prepublish_result = prepublish_evaluation.evaluate(
        markdown=content,
        page_intelligence=page_intelligence,
        benchmark_queries=benchmark_queries,
        citation_intelligence=citation_result,
        competitor_grounding=grounded_competitors,
        competitive_gap=competitive_gap_result,
    )
    yield PipelineEvent(5, total, "Retrieval simulation complete", "done", {
        "retrieval_method": retrieval_result.get("method", ""),
        "retrieval_score": retrieval_result.get("retrieval_score", 0),
        "answer_score": answer_extraction.get("answer_score", 0),
        "citation_readiness": citation_result.get("citationReadiness", {}).get("score", 0),
        "competitor_gap_score": (competitive_gap_result or {}).get("competitorGapScore"),
        "competitor_gap_winner": (competitive_gap_result or {}).get("winner"),
        "prepublish_score": prepublish_result.get("score"),
        "fanout_coverage": prepublish_result.get("ragSimulation", {}).get("fanoutCoverage"),
        "benchmark_queries": len(benchmark_queries),
    })

    # ── Step 6: Pattern analysis + gap scoring ────────────────────────────────
    yield PipelineEvent(6, total, "Scoring original gap and competitor patterns", "running")
    if request.run_legacy_llm_scorecard:
        competitor_patterns = patterns.run(competitor_pages)
        scorecard = scorer.run(decomposition, query_list, competitor_patterns, content)
    else:
        competitor_patterns = _quick_patterns(competitor_pages)
        scorecard = _quick_scorecard(deterministic_aeo, citation_result)
    query_match_result = None
    gap_score = None
    if request.target_query and retrieval_result:
        query_match_result = query_match.run(
            query=request.target_query,
            content=content,
            retrieval=retrieval_result,
            answer_extraction=answer_extraction,
            citation_readiness=citation_result.get("citationReadiness", {}),
        )
        if query_match_result:
            gap_score = deterministic_aeo.get("content_score", 0) - query_match_result.get("query_match_score", 0)
    dims = scorecard.get("dimensions", {})
    bm = competitor_patterns.get("benchmark", {})
    yield PipelineEvent(6, total, "SOTA AEO scorecard complete", "done", {
        "query_match_score": query_match_result.get("query_match_score") if query_match_result else None,
        "gap_score": gap_score,
        "benchmark_specific_claims": bm.get("avg_specific_claims", 0),
        "benchmark_faq_questions": bm.get("avg_faq_questions", 0),
        "overall_score": scorecard.get("overall_score", 0),
        "dimension_scores": {k: v.get("score", 0) for k, v in dims.items()},
    })

    # ── Step 7: Optimization output ───────────────────────────────────────────
    yield PipelineEvent(7, total, "Generating evidence-based optimization plan", "running")
    optimization_plan = optimization.run(
        target_query=request.target_query,
        benchmark_queries=benchmark_queries,
        citation_intelligence=citation_result,
        page_intelligence=page_intelligence,
        competitor_grounding=grounded_competitors,
        url=request.url,
        category=category,
        query_match=query_match_result,
        competitive_gap=competitive_gap_result,
        prepublish_evaluation=prepublish_result,
    )
    if request.include_llm_rewrite:
        rewrites = rewriter.run(
            decomposition=decomposition,
            scorecard=scorecard,
            queries=query_list,
            patterns=competitor_patterns,
            competitors=request.competitors,
            content=content,
            page_type=request.page_type,
            target_customer=request.target_customer,
        )
    else:
        rewrites = {}
    faq_count = len(rewrites.get("faq_block", []))
    yield PipelineEvent(7, total, "Optimization plan ready", "done", {
        "faq_questions_generated": faq_count,
        "optimization_faqs": len(optimization_plan.get("faq_block", [])),
        "highest_impact_fix": optimization_plan.get("highest_impact_fix", {}).get("failureMode", ""),
        "h2_headings_rewritten": len(rewrites.get("rewritten_h2_headings", [])),
        "comparison_section": bool(rewrites.get("comparison_section", {}).get("text")),
    })

    # ── Final result ──────────────────────────────────────────────────────────
    yield PipelineEvent(total, total, "Analysis complete", "done", {
        "result": {
            "url": request.url,
            "page_type": request.page_type,
            "target_customer": request.target_customer,
            "category": category,
            "word_count": len(content.split()),
            "target_query": request.target_query,
            "original_aeo": deterministic_aeo,
            "query_match": query_match_result,
            "gap_score": gap_score,
            "page_intelligence": page_intelligence,
            "citation_intelligence": citation_result,
            "retrieval": retrieval_result,
            "benchmark_queries": benchmark_queries,
            "competitor_grounding": grounded_competitors,
            "competitive_gap": competitive_gap_result,
            "prepublish_evaluation": prepublish_result,
            "optimization_plan": optimization_plan,
            "decomposition": decomposition,
            "queries": query_list,
            "competitor_research": {
                "pages_analyzed": grounded_competitors.get("pages_analyzed", 0),
                "queries_searched": grounded_competitors.get("queries", []),
                "benchmark": competitor_patterns.get("benchmark", {}),
                "key_insight": competitor_patterns.get("key_insight", ""),
                "must_have_sections": competitor_patterns.get("must_have_sections", []),
                "common_questions": competitor_patterns.get("common_questions_answered", []),
            },
            "scorecard": scorecard,
            "rewrites": rewrites,
        }
    })


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_content(request: AnalyzeRequest) -> str:
    if request.draft_content and len(request.draft_content.strip()) > 100:
        return request.draft_content.strip()
    if request.url:
        errors = []
        try:
            return jina.fetch_markdown(request.url)
        except Exception as exc:
            errors.append(f"Jina: {exc}")
        exa_content = exa.contents([request.url], max_characters=30000)
        if exa_content and len(exa_content[0].get("content", "")) > 200:
            return exa_content[0]["content"]
        errors.append("Exa: no usable full-text content returned")
        raise RuntimeError(f"Could not fetch content from {request.url} ({'; '.join(errors)})")
    raise ValueError("Provide either a URL or draft_content")


def _infer_category(decomposition: dict) -> str:
    """Best-effort category from value prop and features."""
    vp = decomposition.get("value_prop", "")
    features = decomposition.get("features", [])
    combined = f"{vp} {' '.join(features[:3])}"
    # Return first 60 chars as rough category if nothing better
    return combined[:60].strip() if combined.strip() else "software"


def _count_intents(query_list: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for q in query_list:
        intent = q.get("intent", "unknown")
        counts[intent] = counts.get(intent, 0) + 1
    return counts


def _quick_patterns(competitor_pages: list[dict[str, Any]]) -> dict[str, Any]:
    if not competitor_pages:
        return {
            "must_have_sections": [],
            "benchmark": {
                "avg_specific_claims": 0,
                "avg_faq_questions": 0,
                "avg_trust_signals": 0,
                "pct_with_comparison_block": 0.0,
                "pct_with_pricing_info": 0.0,
                "avg_word_count": 0,
            },
            "common_questions_answered": [],
            "common_comparison_topics": [],
            "heading_patterns": [],
            "trust_signal_types": [],
            "cta_patterns": [],
            "key_insight": "",
        }

    def avg(values: list[int]) -> int:
        return round(sum(values) / len(values)) if values else 0

    return {
        "must_have_sections": [],
        "benchmark": {
            "avg_specific_claims": avg([p.get("specific_claims_count", 0) for p in competitor_pages]),
            "avg_faq_questions": avg([len(p.get("faq_questions", [])) for p in competitor_pages]),
            "avg_trust_signals": avg([p.get("trust_signal_count", 0) for p in competitor_pages]),
            "pct_with_comparison_block": round(
                sum(1 for p in competitor_pages if p.get("has_comparison_section")) / len(competitor_pages), 2
            ),
            "pct_with_pricing_info": round(
                sum(1 for p in competitor_pages if p.get("has_pricing_info")) / len(competitor_pages), 2
            ),
            "avg_word_count": avg([p.get("word_count", 0) for p in competitor_pages]),
        },
        "common_questions_answered": [
            q for page in competitor_pages for q in page.get("faq_questions", [])[:2]
        ][:10],
        "common_comparison_topics": [],
        "heading_patterns": [],
        "trust_signal_types": [],
        "cta_patterns": [],
        "key_insight": "Computed from grounded competitor pages without LLM pattern synthesis.",
    }


def _quick_scorecard(deterministic_aeo: dict[str, Any], citation_result: dict[str, Any]) -> dict[str, Any]:
    readiness = citation_result.get("citationReadiness", {})
    subscores = readiness.get("subscores", {})
    content_score = deterministic_aeo.get("content_score", 0)
    geu_score = deterministic_aeo.get("geu_score", 0)
    overall = round(
        content_score * 0.35
        + geu_score * 0.25
        + readiness.get("score", 0) * 0.25
        + subscores.get("evidenceScore", 0) * 0.15
    )
    return {
        "dimensions": {
            "content_signals": {"score": content_score, "evidence": "Original AEO content checks", "gap": ""},
            "geu_extractability": {"score": geu_score, "evidence": "Original GEU checks", "gap": ""},
            "citation_readiness": {"score": readiness.get("score", 0), "evidence": readiness.get("summary", ""), "gap": ""},
            "evidence_density": {"score": subscores.get("evidenceScore", 0), "evidence": "Citations, stats, and dated proof", "gap": ""},
        },
        "overall_score": overall,
        "score_rationale": "Fast benchmark score from deterministic original AEO and citation readiness signals.",
        "top_3_improvements": [],
    }
