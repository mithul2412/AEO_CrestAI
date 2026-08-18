"""Chunk-level competitive citation gap analysis.

This ports the teammate Express app's competitor gap idea into the active
Python pipeline, but uses the current retrieval stack so Jina embeddings and
reranking can participate when configured.
"""
from __future__ import annotations

from typing import Any

from pipeline.retrieval import analyze_retrieval
from pipeline.content_signals import clamp_score


def _chunk_score(chunk: dict[str, Any] | None) -> int:
    if not chunk:
        return 0
    score = chunk.get("retrieval_score")
    if isinstance(score, (int, float)):
        return clamp_score(score)
    similarity = chunk.get("similarity", 0)
    return clamp_score(float(similarity or 0) * 100)


def _collect_missing_attributes(user_top: dict[str, Any], competitor_top: dict[str, Any]) -> list[str]:
    missing: list[str] = []
    if not user_top.get("direct_answer") and competitor_top.get("direct_answer"):
        missing.append("direct answer")
    if (user_top.get("evidence_score") or 0) + 8 < (competitor_top.get("evidence_score") or 0):
        missing.append("stronger evidence")
    if (user_top.get("position") or 1) > (competitor_top.get("position") or 1) + 0.15:
        missing.append("answer appears earlier")
    if (user_top.get("specificity_score") or 0) + 10 < (competitor_top.get("specificity_score") or 0):
        missing.append("more specific entities and numbers")
    if (user_top.get("self_contained_score") or 0) + 10 < (competitor_top.get("self_contained_score") or 0):
        missing.append("self-contained answer")
    return missing


def _classify_gap(missing_attributes: list[str]) -> str:
    if "direct answer" in missing_attributes:
        return "Answer Failure"
    if "stronger evidence" in missing_attributes:
        return "Evidence Failure"
    if "answer appears earlier" in missing_attributes:
        return "Retrieval Failure"
    if "more specific entities and numbers" in missing_attributes:
        return "Specificity Failure"
    if "self-contained answer" in missing_attributes:
        return "Structure Failure"
    return "Competitor Structure Advantage"


def _summarize_gap(
    *,
    winner: str,
    failure_mode: str | None,
    missing_attributes: list[str],
    competitor_top: dict[str, Any] | None,
    user_top: dict[str, Any] | None,
) -> str:
    if winner == "user":
        return "Your top chunk is more citation-ready than the discovered competitor chunks for this query."

    competitor_section = (competitor_top or {}).get("section") or "its top section"
    user_section = (user_top or {}).get("section") or "your top section"
    missing = (
        f" Missing attributes: {', '.join(missing_attributes)}."
        if missing_attributes
        else ""
    )
    return (
        f'The competitor chunk in "{competitor_section}" is more retrieval-ready than '
        f'your "{user_section}" chunk. Main issue: {failure_mode}.{missing}'
    )


def _competitor_chunks(competitor_pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    for page in competitor_pages:
        source_id = page.get("source_id") or page.get("sourceId") or ""
        for chunk in page.get("chunks", []) or []:
            chunks.append(
                {
                    **chunk,
                    "source_id": source_id,
                    "source_type": "competitor",
                    "source_url": page.get("url", ""),
                    "source_title": page.get("title", ""),
                }
            )
    return chunks


def _winning_competitor(
    competitor_pages: list[dict[str, Any]],
    competitor_top: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not competitor_top:
        return None
    source_id = competitor_top.get("source_id") or competitor_top.get("sourceId")
    source_url = competitor_top.get("source_url") or competitor_top.get("sourceUrl")
    for page in competitor_pages:
        if source_id and source_id in {page.get("source_id"), page.get("sourceId")}:
            return {
                "title": page.get("title", ""),
                "url": page.get("url", ""),
                "sourceId": page.get("source_id") or page.get("sourceId"),
            }
        if source_url and source_url == page.get("url"):
            return {
                "title": page.get("title", ""),
                "url": page.get("url", ""),
                "sourceId": page.get("source_id") or page.get("sourceId"),
            }
    if source_url:
        return {
            "title": competitor_top.get("source_title", ""),
            "url": source_url,
            "sourceId": source_id,
        }
    return None


def compare_user_vs_competitors(
    *,
    query: str,
    user_chunks: list[dict[str, Any]],
    competitor_pages: list[dict[str, Any]],
    use_external: bool = True,
) -> dict[str, Any]:
    """Compare the user's best answer chunk against discovered competitor chunks."""
    if not query.strip():
        return {
            "status": "disabled",
            "winner": "unknown",
            "userTopChunk": None,
            "competitorTopChunk": None,
            "winningCompetitor": None,
            "scoreDelta": None,
            "failureMode": None,
            "missingAttributes": [],
            "whyCompetitorWon": "Add a target query to compare answer paths.",
            "competitorGapScore": None,
        }

    user_ranking = analyze_retrieval(user_chunks, query, use_external=use_external)
    user_top = user_ranking.get("top_chunks", [None])[0] if user_ranking.get("top_chunks") else None
    flat_competitor_chunks = _competitor_chunks(competitor_pages)
    competitor_ranking = analyze_retrieval(flat_competitor_chunks, query, use_external=use_external)
    competitor_top = (
        competitor_ranking.get("top_chunks", [None])[0]
        if competitor_ranking.get("top_chunks")
        else None
    )

    if not user_top or not competitor_top:
        return {
            "status": "insufficient_data",
            "winner": "unknown",
            "userTopChunk": user_top,
            "competitorTopChunk": competitor_top,
            "winningCompetitor": _winning_competitor(competitor_pages, competitor_top),
            "scoreDelta": None,
            "failureMode": None,
            "missingAttributes": [],
            "whyCompetitorWon": "No usable competitor chunks were available for comparison.",
            "competitorGapScore": None,
        }

    user_score = _chunk_score(user_top)
    competitor_score = _chunk_score(competitor_top)
    winner = "user" if user_score >= competitor_score else "competitor"
    missing_attributes = (
        _collect_missing_attributes(user_top, competitor_top)
        if winner == "competitor"
        else []
    )
    failure_mode = _classify_gap(missing_attributes) if winner == "competitor" else None
    score_delta = competitor_score - user_score

    return {
        "status": "ok",
        "winner": winner,
        "winningCompetitor": _winning_competitor(competitor_pages, competitor_top),
        "userTopChunk": user_top,
        "competitorTopChunk": competitor_top,
        "scoreDelta": score_delta,
        "failureMode": failure_mode,
        "missingAttributes": missing_attributes,
        "whyCompetitorWon": _summarize_gap(
            winner=winner,
            failure_mode=failure_mode,
            missing_attributes=missing_attributes,
            competitor_top=competitor_top,
            user_top=user_top,
        ),
        "competitorGapScore": 100 if winner == "user" else clamp_score(100 - max(0, score_delta) * 1.5),
        "userRetrieval": {
            "method": user_ranking.get("method", ""),
            "retrievalScore": user_ranking.get("retrieval_score", 0),
        },
        "competitorRetrieval": {
            "method": competitor_ranking.get("method", ""),
            "retrievalScore": competitor_ranking.get("retrieval_score", 0),
        },
    }
