"""
Step 2 — Page Decomposition (Qwen)

Extracts the structural anatomy of the draft page:
  - Value proposition (stated vs. what it actually says)
  - Every claim, classified as specific / semi-specific / vague
  - Trust signals with counts
  - H2 heading structure
  - CTAs, FAQ presence, comparison presence
  - Specificity score (0-100): the single most predictive AEO signal
"""
from __future__ import annotations

from typing import Any

from providers.openrouter import call

_SYSTEM = """You are an expert content analyst specializing in AEO (Answer Engine Optimization).
Analyze the given webpage content and extract its structural anatomy.

Return ONLY valid JSON matching this exact schema:
{
  "value_prop": "<the page's core value proposition in one sentence>",
  "target_customer_stated": "<who the page explicitly says it's for>",
  "target_customer_inferred": "<who it seems to actually be written for based on language/examples>",
  "claims": [
    {
      "text": "<exact claim from page>",
      "type": "specific|semi_specific|vague",
      "has_number": true|false,
      "has_named_customer": true|false,
      "evidence": "<supporting detail or null>"
    }
  ],
  "features": ["<feature1>", "<feature2>"],
  "trust_signals": {
    "named_customers": ["<company name>"],
    "testimonials_with_attribution": 0,
    "case_study_metrics": ["<metric>"],
    "external_citations": 0,
    "logos_mentioned": 0
  },
  "h2_headings": ["<heading text>"],
  "cta_texts": ["<cta text>"],
  "faq_present": false,
  "faq_question_count": 0,
  "comparison_block_present": false,
  "schema_markup_present": false,
  "questions_answered": ["<question this page directly answers>"],
  "missing_sections": ["<section type commonly expected that is absent>"],
  "specificity_score": 0
}

Specificity score rules (0-100):
  - Start at 0
  - +7 per specific claim with a real number or percentage
  - +5 per named customer with a specific outcome
  - +4 per semi-specific claim (has some detail but no hard number)
  - -2 per purely vague claim (e.g. "transform your business", "best-in-class")
  - Cap at 100"""


def run(content: str, url: str = "") -> dict[str, Any]:
    """Decompose page content. Returns structured anatomy dict."""
    excerpt = content[:8000]
    user = f"URL: {url}\n\nPage content:\n{excerpt}"

    # Try Qwen first (best at structured extraction), fall back to Groq
    result = call(_SYSTEM, user, tier="qwen", max_tokens=2500)
    if not result:
        result = call(_SYSTEM, user, tier="fallback", max_tokens=2000)

    if not isinstance(result, dict):
        return _empty_decomposition()

    # Ensure all required fields exist
    result.setdefault("value_prop", "")
    result.setdefault("target_customer_stated", "")
    result.setdefault("target_customer_inferred", "")
    result.setdefault("claims", [])
    result.setdefault("features", [])
    result.setdefault("trust_signals", {
        "named_customers": [],
        "testimonials_with_attribution": 0,
        "case_study_metrics": [],
        "external_citations": 0,
        "logos_mentioned": 0,
    })
    result.setdefault("h2_headings", [])
    result.setdefault("cta_texts", [])
    result.setdefault("faq_present", False)
    result.setdefault("faq_question_count", 0)
    result.setdefault("comparison_block_present", False)
    result.setdefault("schema_markup_present", False)
    result.setdefault("questions_answered", [])
    result.setdefault("missing_sections", [])
    result.setdefault("specificity_score", _compute_specificity(result))

    return result


def _compute_specificity(d: dict) -> int:
    """Recompute specificity score from claims as a sanity check."""
    score = 0
    for claim in d.get("claims", []):
        t = claim.get("type", "vague")
        if t == "specific":
            score += 7
        elif t == "semi_specific":
            score += 4
        else:
            score -= 2
    ts = d.get("trust_signals", {})
    score += len(ts.get("named_customers", [])) * 5
    score += len(ts.get("case_study_metrics", [])) * 5
    return max(0, min(100, score))


def _empty_decomposition() -> dict[str, Any]:
    return {
        "value_prop": "",
        "target_customer_stated": "",
        "target_customer_inferred": "",
        "claims": [],
        "features": [],
        "trust_signals": {
            "named_customers": [],
            "testimonials_with_attribution": 0,
            "case_study_metrics": [],
            "external_citations": 0,
            "logos_mentioned": 0,
        },
        "h2_headings": [],
        "cta_texts": [],
        "faq_present": False,
        "faq_question_count": 0,
        "comparison_block_present": False,
        "schema_markup_present": False,
        "questions_answered": [],
        "missing_sections": [],
        "specificity_score": 0,
    }
