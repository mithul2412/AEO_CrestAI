"""Citation readiness scoring built from access, extraction, retrieval, and evidence."""
from __future__ import annotations

import copy
import re
from typing import Any

from pipeline.content_signals import (
    clamp_score,
    get_citation_signals,
    get_headings,
    get_numeric_signals,
    has_comparison_signal,
    has_structured_data_signal,
)
from pipeline.retrieval import analyze_retrieval, chunk_markdown, score_answer_extraction


def score_access(access: dict[str, Any] | None = None) -> int:
    access = access or {}
    score = 100
    warnings = access.get("warnings", [])
    robots = access.get("robots", {})
    status_code = access.get("statusCode")
    reader_ok = bool(access.get("contentAccessibleViaReader"))

    if not status_code:
        score -= 15 if reader_ok else 35
    elif status_code >= 400:
        score -= 45
    elif status_code >= 300:
        score -= 12
    if access.get("indexable") is False:
        score -= 35

    blocked = len([status for status in robots.values() if status == "blocked"])
    unknown = len([status for status in robots.values() if status == "unknown"])
    score -= blocked * 12
    score -= unknown * (2 if reader_ok else 4)
    score -= min(len(warnings), 4) * (2 if reader_ok else 4)
    return clamp_score(score)


def score_extraction(extraction: dict[str, Any] | None = None) -> int:
    extraction = extraction or {}
    score = 100
    if not extraction.get("title"):
        score -= 10
    if not extraction.get("h1"):
        score -= 16
    if len(extraction.get("headings", [])) < 2:
        score -= 12
    if extraction.get("wordCount", 0) < 250:
        score -= 25
    if len(extraction.get("schemaTypes", [])) == 0:
        score -= 8
    score -= min(len(extraction.get("warnings", [])), 5) * 7
    return clamp_score(score)


def score_evidence(markdown: str) -> int:
    citations = get_citation_signals(markdown)
    numeric = get_numeric_signals(markdown)
    dated = bool(re.search(r"\b20(?:2[4-9]|3[0-9])\b", markdown))
    return clamp_score(min(citations["total"], 5) * 13 + min(len(numeric), 6) * 6 + (15 if dated else 0))


def score_structure(markdown: str, extraction: dict[str, Any] | None = None) -> int:
    extraction = extraction or {}
    headings = get_headings(markdown)
    schema = has_structured_data_signal(markdown) or len(extraction.get("schemaTypes", [])) > 0
    comparison = has_comparison_signal(markdown)
    faq = bool(re.search(r"\bfaq\b|frequently asked questions|\?", markdown, re.IGNORECASE))
    table = bool(re.search(r"\|.+\||<table", markdown, re.IGNORECASE)) or extraction.get("tableCount", 0) > 0
    return clamp_score(
        min(len(headings), 6) * 8
        + (18 if schema else 0)
        + (12 if comparison else 0)
        + (12 if faq else 0)
        + (10 if table else 0)
    )


def score_freshness(markdown: str, extraction: dict[str, Any] | None = None) -> int:
    extraction = extraction or {}
    text = f"{markdown}\n{extraction.get('title', '')}\n{extraction.get('metaDescription', '')}"
    if re.search(r"\b2026\b", text):
        return 100
    if re.search(r"\b2025\b", text):
        return 85
    if re.search(r"\b2024\b", text):
        return 65
    if re.search(r"\bupdated|reviewed|current|latest|new\b", text, re.IGNORECASE):
        return 50
    return 30


def _summary(scores: dict[str, int]) -> str:
    weak = []
    if scores["accessScore"] < 70:
        weak.append("access risk")
    if scores["extractionScore"] < 70:
        weak.append("extraction weakness")
    if scores.get("retrievalScore", 100) < 70:
        weak.append("retrieval fit")
    if scores.get("answerScore", 100) < 70:
        weak.append("direct answer clarity")
    if scores["evidenceScore"] < 55:
        weak.append("evidence")
    if not weak:
        return "Strong access, extraction, retrieval, answer clarity, and evidence signals."
    return f"Strongest opportunity: improve {' and '.join(weak[:2])}."


def _summary_with_competitor(scores: dict[str, int], competitive_gap: dict[str, Any]) -> str:
    base = _summary(scores)
    if competitive_gap.get("status") != "ok":
        return base
    if competitive_gap.get("winner") == "competitor":
        failure = competitive_gap.get("failureMode") or "competitive answer gap"
        return f"{base} Best discovered competitor has a stronger answer path: {failure}."
    return f"{base} Your top answer path beats the best discovered competitor chunk."


def build_baseline(markdown: str, page_intelligence: dict[str, Any]) -> dict[str, Any]:
    access_score = score_access(page_intelligence.get("access"))
    extraction_score = score_extraction(page_intelligence.get("extraction"))
    evidence_score = score_evidence(markdown)
    structure_score = score_structure(markdown, page_intelligence.get("extraction"))
    freshness_score = score_freshness(markdown, page_intelligence.get("extraction"))
    readiness_score = clamp_score(
        access_score * 0.28
        + extraction_score * 0.28
        + evidence_score * 0.22
        + structure_score * 0.15
        + freshness_score * 0.07
    )
    return {
        "score": readiness_score,
        "summary": "Baseline citation readiness uses access, extraction, evidence, structure, and freshness until a query is added.",
        "subscores": {
            "accessScore": access_score,
            "extractionScore": extraction_score,
            "evidenceScore": evidence_score,
            "structureScore": structure_score,
            "freshnessScore": freshness_score,
        },
    }


def build_query_intelligence(
    markdown: str,
    query: str,
    page_intelligence: dict[str, Any],
) -> dict[str, Any]:
    chunks = chunk_markdown(markdown)
    retrieval = analyze_retrieval(chunks, query, use_external=True)
    top_chunk = retrieval["top_chunks"][0] if retrieval["top_chunks"] else None
    answer = score_answer_extraction(top_chunk)
    access_score = score_access(page_intelligence.get("access"))
    extraction_score = score_extraction(page_intelligence.get("extraction"))
    evidence_score = score_evidence(markdown)
    structure_score = score_structure(markdown, page_intelligence.get("extraction"))
    freshness_score = score_freshness(markdown, page_intelligence.get("extraction"))
    readiness_score = clamp_score(
        access_score * 0.1
        + extraction_score * 0.1
        + retrieval["retrieval_score"] * 0.25
        + answer["answer_score"] * 0.25
        + evidence_score * 0.15
        + structure_score * 0.1
        + freshness_score * 0.05
    )
    subscores = {
        "accessScore": access_score,
        "extractionScore": extraction_score,
        "retrievalScore": retrieval["retrieval_score"],
        "answerScore": answer["answer_score"],
        "evidenceScore": evidence_score,
        "structureScore": structure_score,
        "freshnessScore": freshness_score,
    }
    return {
        "chunks": chunks,
        "retrieval": retrieval,
        "answerExtraction": answer,
        "citationReadiness": {
            "score": readiness_score,
            "summary": _summary(subscores),
            "subscores": subscores,
        },
    }


def apply_competitive_gap(
    citation_result: dict[str, Any],
    competitive_gap: dict[str, Any] | None,
) -> dict[str, Any]:
    """Fold competitor chunk comparison into query-level citation readiness."""
    if not competitive_gap or competitive_gap.get("status") != "ok":
        return citation_result
    gap_score = competitive_gap.get("competitorGapScore")
    if not isinstance(gap_score, (int, float)):
        return citation_result

    updated = copy.deepcopy(citation_result)
    readiness = updated.setdefault("citationReadiness", {})
    subscores = readiness.setdefault("subscores", {})
    subscores["competitorGapScore"] = clamp_score(gap_score)
    readiness["score"] = clamp_score(
        subscores.get("accessScore", 0) * 0.10
        + subscores.get("extractionScore", 0) * 0.10
        + subscores.get("retrievalScore", 0) * 0.20
        + subscores.get("answerScore", 0) * 0.20
        + subscores.get("evidenceScore", 0) * 0.15
        + subscores.get("structureScore", 0) * 0.10
        + subscores.get("freshnessScore", 0) * 0.05
        + subscores.get("competitorGapScore", 0) * 0.10
    )
    readiness["summary"] = _summary_with_competitor(subscores, competitive_gap)
    updated["competitiveGap"] = competitive_gap
    return updated
