"""
Step 5 — Competitor Pattern Analysis (Nemotron)

From the fetched competitor pages, extracts what the top pages have in common:
  - Sections present in 70%+ of top pages (must-haves)
  - Average specificity, FAQ count, trust signal density
  - Common question topics answered
  - Comparison coverage patterns
  - Overall benchmark scores for each dimension

This benchmark is what the draft page gets compared against.
Uses Nemotron for high-quality reasoning over competitor data.
"""
from __future__ import annotations

import json
from typing import Any

from providers.openrouter import call

_SYSTEM = """You are an expert competitive intelligence analyst for AEO (Answer Engine Optimization).

Analyze the competitor pages provided and extract patterns that explain why they rank well
and get cited by AI engines. Be specific and evidence-based.

Return ONLY valid JSON:
{
  "must_have_sections": [
    {"section": "<section name>", "frequency": 0.0, "why_it_matters": "<brief reason>"}
  ],
  "benchmark": {
    "avg_specific_claims": 0,
    "avg_faq_questions": 0,
    "avg_trust_signals": 0,
    "pct_with_comparison_block": 0.0,
    "pct_with_pricing_info": 0.0,
    "avg_word_count": 0
  },
  "common_questions_answered": ["<question topic>"],
  "common_comparison_topics": ["<competitor or category compared>"],
  "heading_patterns": ["<pattern description e.g. 'answer-shaped H2s like Who is this for?'>"],
  "trust_signal_types": ["<type of trust signal most common>"],
  "cta_patterns": ["<CTA style pattern>"],
  "key_insight": "<the single most important thing top pages do that weak pages miss>"
}"""


def run(competitor_pages: list[dict[str, Any]]) -> dict[str, Any]:
    """Analyze competitor pages and return benchmark patterns."""
    if not competitor_pages:
        return _empty_patterns()

    # Build a compact summary of competitor pages for the LLM
    summary = _build_summary(competitor_pages)

    user = f"Analyze these {len(competitor_pages)} competitor pages:\n\n{summary}"

    result = call(_SYSTEM, user, tier="nemotron", max_tokens=2000)

    if not isinstance(result, dict):
        return _fallback_patterns(competitor_pages)

    # Ensure benchmark exists with defaults
    result.setdefault("must_have_sections", [])
    result.setdefault("benchmark", {})
    result.setdefault("common_questions_answered", [])
    result.setdefault("common_comparison_topics", [])
    result.setdefault("heading_patterns", [])
    result.setdefault("trust_signal_types", [])
    result.setdefault("cta_patterns", [])
    result.setdefault("key_insight", "")

    bm = result["benchmark"]
    bm.setdefault("avg_specific_claims", _avg([p["specific_claims_count"] for p in competitor_pages]))
    bm.setdefault("avg_faq_questions", _avg([len(p["faq_questions"]) for p in competitor_pages]))
    bm.setdefault("avg_trust_signals", _avg([p["trust_signal_count"] for p in competitor_pages]))
    bm.setdefault(
        "pct_with_comparison_block",
        round(sum(1 for p in competitor_pages if p["has_comparison_section"]) / len(competitor_pages), 2),
    )
    bm.setdefault(
        "pct_with_pricing_info",
        round(sum(1 for p in competitor_pages if p["has_pricing_info"]) / len(competitor_pages), 2),
    )
    bm.setdefault("avg_word_count", _avg([p["word_count"] for p in competitor_pages]))

    return result


def _build_summary(pages: list[dict[str, Any]]) -> str:
    lines = []
    for i, p in enumerate(pages[:15], 1):  # Cap at 15 pages to stay within context
        lines.append(
            f"Page {i}: {p['title'][:60]}\n"
            f"  URL: {p['url'][:80]}\n"
            f"  Query that found it: {p['source_query']}\n"
            f"  Specific claims with numbers: {p['specific_claims_count']}\n"
            f"  FAQ questions found: {len(p['faq_questions'])}\n"
            f"  Has comparison section: {p['has_comparison_section']}\n"
            f"  Has pricing info: {p['has_pricing_info']}\n"
            f"  Trust signals: {p['trust_signal_count']}\n"
            f"  Headings: {json.dumps(p['headings'][:5])}\n"
            f"  FAQ questions: {json.dumps(p['faq_questions'][:5])}\n"
            f"  CTAs: {json.dumps(p['cta_texts'][:3])}\n"
            f"  Content snippet: {p['content_snippet'][:400]}\n"
        )
    return "\n".join(lines)


def _avg(values: list) -> int:
    nums = [v for v in values if isinstance(v, (int, float))]
    return round(sum(nums) / len(nums)) if nums else 0


def _fallback_patterns(pages: list[dict[str, Any]]) -> dict[str, Any]:
    """Statistical fallback when LLM call fails."""
    return {
        "must_have_sections": [],
        "benchmark": {
            "avg_specific_claims": _avg([p["specific_claims_count"] for p in pages]),
            "avg_faq_questions": _avg([len(p["faq_questions"]) for p in pages]),
            "avg_trust_signals": _avg([p["trust_signal_count"] for p in pages]),
            "pct_with_comparison_block": round(
                sum(1 for p in pages if p["has_comparison_section"]) / max(len(pages), 1), 2
            ),
            "pct_with_pricing_info": round(
                sum(1 for p in pages if p["has_pricing_info"]) / max(len(pages), 1), 2
            ),
            "avg_word_count": _avg([p["word_count"] for p in pages]),
        },
        "common_questions_answered": [],
        "common_comparison_topics": [],
        "heading_patterns": [],
        "trust_signal_types": [],
        "cta_patterns": [],
        "key_insight": "",
    }


def _empty_patterns() -> dict[str, Any]:
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
