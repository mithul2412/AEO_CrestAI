"""Original deterministic AEO scoring method, ported from `/extracted`."""
from __future__ import annotations

import re
from typing import Any

from pipeline.content_signals import (
    get_average_sentence_length,
    get_bullet_lines,
    get_citation_signals,
    get_headings,
    get_lead_text,
    get_numeric_signals,
    get_paragraphs,
    get_sentences,
    get_words,
    has_answer_like_opening,
    has_comparison_signal,
    has_llms_txt_signal,
    has_named_source_near_fact,
    has_structured_data_signal,
)

def _faq_check(markdown: str, _: dict[str, Any] | None = None) -> bool:
    lines = [line.strip() for line in markdown.splitlines() if line.strip()]
    faq_heading = bool(
        re.search(
            r"(^#{1,6}\s*(faq|frequently asked questions)\b)"
            r"|(^#{1,6}\s*[^#\n]+\?$)"
            r"|(^\*\*[^*\n]+\?\*\*$)",
            markdown,
            re.IGNORECASE | re.MULTILINE,
        )
    )
    question_lines = [
        line
        for line in lines
        if re.match(r"^#{1,6}\s*[^#\n]+\?$", line)
        or re.match(r"^\*\*[^*]+\?\*\*$", line)
        or re.match(r"^[Qq]:\s+.+\?$", line)
    ]
    inline_questions = markdown.count("?")
    return faq_heading and (len(question_lines) >= 2 or inline_questions >= 3)


def _fluency_check(markdown: str, _: dict[str, Any] | None = None) -> bool:
    headings = len(get_headings(markdown))
    bullets = len(get_bullet_lines(markdown))
    paragraphs = len(get_paragraphs(markdown))
    words = len(get_words(markdown))
    avg_sentence_length = get_average_sentence_length(markdown)
    sentences = len(get_sentences(markdown))
    return (
        headings >= 2
        and paragraphs >= 3
        and bullets >= 3
        and words >= 180
        and sentences >= 4
        and avg_sentence_length >= 4
    )


CONTENT_CHECKS: list[dict[str, Any]] = [
    {
        "id": "faq",
        "label": "FAQ structure",
        "weight": 20,
        "lift": "+11% citation lift",
        "test": _faq_check,
    },
    {
        "id": "stats",
        "label": "Statistics / numbers",
        "weight": 15,
        "lift": "+40% avg",
        "test": lambda md, _: len(get_numeric_signals(md)) >= 2,
    },
    {
        "id": "citations",
        "label": "External citations",
        "weight": 20,
        "lift": "+115% visibility",
        "test": lambda md, _: (
            len(get_citation_signals(md)["urls"]) >= 2 or get_citation_signals(md)["total"] >= 2
        ),
    },
    {
        "id": "schema",
        "label": "Structured data / schema",
        "weight": 15,
        "lift": "~ impact",
        "test": lambda md, _: has_structured_data_signal(md),
    },
    {
        "id": "comparison",
        "label": "Comparison framing",
        "weight": 10,
        "lift": "~ impact",
        "test": lambda md, _: has_comparison_signal(md),
    },
    {
        "id": "fluency",
        "label": "Fluency / reading level",
        "weight": 10,
        "lift": "+22% avg",
        "test": _fluency_check,
    },
    {
        "id": "llmstxt",
        "label": "llms.txt present",
        "weight": 10,
        "lift": "~ impact",
        "test": lambda md, options: has_llms_txt_signal(md, (options or {}).get("source_signals", {})),
    },
]


def _is_standalone_sentence(sentence: str) -> bool:
    return bool(
        re.search(
            r"^[A-Z][^!?]*\b(is|are|was|were|has|have|can|will|does|do|provides|"
            r"offers|includes|supports|enables|allows|helps|gives|makes|creates|uses|serves)\b",
            sentence,
            re.IGNORECASE,
        )
        and len(get_words(sentence)) >= 3
    )


GEU_CHECKS: list[dict[str, Any]] = [
    {
        "id": "standalone",
        "label": "Standalone sentences",
        "weight": 30,
        "lift": "AutoGEO",
        "test": lambda md, _: len([s for s in get_sentences(md) if _is_standalone_sentence(s)]) >= 3,
    },
    {
        "id": "frontloaded",
        "label": "Answer front-loaded",
        "weight": 25,
        "lift": "AutoGEO",
        "test": lambda md, _: has_answer_like_opening(get_lead_text(md, 0.2, 80))
        and len(get_lead_text(md, 0.2, 80)) > 120,
    },
    {
        "id": "sourced",
        "label": "Sourced claims",
        "weight": 25,
        "lift": "AutoGEO",
        "test": lambda md, _: has_named_source_near_fact(md),
    },
    {
        "id": "coherent",
        "label": "Coherent opening",
        "weight": 20,
        "lift": "AutoGEO",
        "test": lambda md, _: _coherent_opening(md),
    },
]


def _coherent_opening(markdown: str) -> bool:
    opening = get_sentences(markdown)[:2]
    if not opening:
        return False
    if any(re.match(r"^(It|They|This|These|That|Those)\b", sentence.strip()) for sentence in opening):
        return False
    return all(re.search(r"[A-Za-z]", sentence) and len(get_words(sentence)) >= 4 for sentence in opening)


def _run_checks(
    markdown: str,
    checks: list[dict[str, Any]],
    options: dict[str, Any] | None = None,
) -> tuple[int, list[dict[str, Any]]]:
    results = []
    for check in checks:
        passed = bool(check["test"](markdown, options or {}))
        results.append(
            {
                "id": check["id"],
                "label": check["label"],
                "weight": check["weight"],
                "lift": check["lift"],
                "passed": passed,
            }
        )
    score = sum(check["weight"] for check in results if check["passed"])
    return score, results


def compute_content_score(markdown: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
    score, checks = _run_checks(markdown, CONTENT_CHECKS, options)
    return {"score": score, "checks": checks}


def compute_geu_score(markdown: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
    score, checks = _run_checks(markdown, GEU_CHECKS, options)
    return {"score": score, "checks": checks}


def compute_original_aeo(
    markdown: str,
    *,
    source_signals: dict[str, Any] | None = None,
) -> dict[str, Any]:
    options = {"source_signals": source_signals or {}}
    content = compute_content_score(markdown, options)
    geu = compute_geu_score(markdown, options)
    return {
        "content_score": content["score"],
        "geu_score": geu["score"],
        "overall_baseline_score": round((content["score"] + geu["score"]) / 2),
        "checks": content["checks"],
        "geu_checks": geu["checks"],
        "method": {
            "name": "Original AEO deterministic method",
            "hero_gap": "content_score - query_match_score",
            "content_weights": {check["id"]: check["weight"] for check in CONTENT_CHECKS},
            "geu_weights": {check["id"]: check["weight"] for check in GEU_CHECKS},
        },
    }
