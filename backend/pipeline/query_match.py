"""Query Match scoring with deterministic retrieval core and OpenRouter judge panel."""
from __future__ import annotations

from typing import Any
import concurrent.futures

from providers.openrouter import call
from pipeline.content_signals import clamp_score

_SYSTEM = """You are an AEO query-match judge.
Evaluate whether the page content answers the target query in a way an AI answer engine could cite.
Return ONLY valid JSON:
{
  "verdict": "<1-2 sentence citation likelihood>",
  "queryMatchScore": <integer 0-100>,
  "topGap": "<single most important missing answer/evidence/structure element>",
  "suggestedFix": "<single highest-impact content fix>"
}
Score guide:
0-30 = does not answer the query.
31-60 = related but weak direct answer.
61-80 = answers but extractability/evidence is limited.
81-100 = direct, well-structured, citation-friendly answer."""


def _normalize_model_result(model: str, result: Any) -> dict[str, Any] | None:
    if not isinstance(result, dict):
        return None
    score = clamp_score(result.get("queryMatchScore"))
    return {
        "model": model,
        "queryMatchScore": score,
        "verdict": str(result.get("verdict", "")).strip(),
        "topGap": str(result.get("topGap", "")).strip(),
        "suggestedFix": str(result.get("suggestedFix", "")).strip(),
    }


def _deterministic_score(
    *,
    retrieval: dict[str, Any],
    answer_extraction: dict[str, Any],
    citation_readiness: dict[str, Any],
) -> int:
    subscores = citation_readiness.get("subscores", {})
    return clamp_score(
        retrieval.get("retrieval_score", 0) * 0.42
        + answer_extraction.get("answer_score", 0) * 0.28
        + subscores.get("evidenceScore", 0) * 0.15
        + subscores.get("structureScore", 0) * 0.1
        + subscores.get("freshnessScore", 0) * 0.05
    )


def _judge_prompt(
    *,
    query: str,
    content: str,
    retrieval: dict[str, Any],
    answer_extraction: dict[str, Any],
    citation_readiness: dict[str, Any],
) -> str:
    top = retrieval.get("top_chunks", [{}])[0] if retrieval.get("top_chunks") else {}
    return f"""TARGET QUERY:
{query}

DETERMINISTIC RETRIEVAL SIGNALS:
Retrieval score: {retrieval.get('retrieval_score', 0)}
Retrieval diagnosis: {retrieval.get('diagnosis', '')}
Answer score: {answer_extraction.get('answer_score', 0)}
Answer diagnosis: {answer_extraction.get('diagnosis', '')}
Citation readiness: {citation_readiness.get('score', 0)}
Subscores: {citation_readiness.get('subscores', {})}

TOP RETRIEVED CHUNK:
Section: {top.get('section', '')}
Text:
{str(top.get('text', ''))[:2200]}

PAGE CONTENT EXCERPT:
{content[:2600]}"""


def run(
    *,
    query: str,
    content: str,
    retrieval: dict[str, Any],
    answer_extraction: dict[str, Any],
    citation_readiness: dict[str, Any],
) -> dict[str, Any] | None:
    """Return query match only when the user supplied a target query."""
    if not query.strip():
        return None

    deterministic = _deterministic_score(
        retrieval=retrieval,
        answer_extraction=answer_extraction,
        citation_readiness=citation_readiness,
    )
    user = _judge_prompt(
        query=query,
        content=content,
        retrieval=retrieval,
        answer_extraction=answer_extraction,
        citation_readiness=citation_readiness,
    )
    requests = [
        ("Qwen", "qwen"),
        ("Nemotron", "nemotron"),
        ("GPT-OSS", "rewrite"),
    ]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        futures = {
            ex.submit(call, _SYSTEM, user, tier=tier, max_tokens=700, temperature=0.1): model
            for model, tier in requests
        }
        judge_calls = [
            (futures[future], future.result())
            for future in concurrent.futures.as_completed(futures)
        ]
    model_readouts = [
        normalized
        for model, raw in judge_calls
        if (normalized := _normalize_model_result(model, raw)) is not None
    ]
    model_scores = [
        item["queryMatchScore"]
        for item in model_readouts
        if isinstance(item.get("queryMatchScore"), int)
    ]
    model_average = round(sum(model_scores) / len(model_scores)) if model_scores else None
    final_score = (
        clamp_score(deterministic * 0.6 + model_average * 0.4)
        if isinstance(model_average, int)
        else deterministic
    )
    top_gap = (
        model_readouts[0].get("topGap")
        if model_readouts and model_readouts[0].get("topGap")
        else retrieval.get("diagnosis", "")
    )
    suggested_fix = (
        model_readouts[0].get("suggestedFix")
        if model_readouts and model_readouts[0].get("suggestedFix")
        else "Add a query-matched, answer-first block near the top of the page."
    )
    return {
        "query": query,
        "query_match_score": final_score,
        "deterministic_score": deterministic,
        "model_average_score": model_average,
        "model_readouts": model_readouts,
        "top_gap": top_gap,
        "suggested_fix": suggested_fix,
        "verdict": (
            model_readouts[0].get("verdict")
            if model_readouts and model_readouts[0].get("verdict")
            else retrieval.get("diagnosis", "")
        ),
    }
