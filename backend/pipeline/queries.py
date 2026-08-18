"""
Step 3 — Query Intent Generation (Qwen)

Generates 20-25 real user queries across 6 intent types.
These queries become the benchmark: every scoring decision traces
back to whether the page answers them.

Intent types:
  informational  — what is, how does, explain
  comparison     — X vs Y, alternatives to, better than
  commercial     — best X for Y, top X tools, X software
  action         — X pricing, X demo, X free trial, X signup
  trust          — X reviews, is X worth it, X case studies
  problem_first  — how to solve [problem the product solves]
"""
from __future__ import annotations

from typing import Any

from providers.openrouter import call

_SYSTEM = """You are an AEO (Answer Engine Optimization) expert who understands exactly how real buyers
and researchers phrase queries to AI engines like ChatGPT, Claude, and Perplexity.

Generate exactly 22 real, specific search queries that real users would type when researching
the given product/service. Queries must be diverse across all 6 intent types.

Return ONLY valid JSON:
{
  "queries": [
    {"text": "<query text>", "intent": "informational|comparison|commercial|action|trust|problem_first"},
    ...
  ]
}

Rules:
- Make queries realistic and specific — not generic ("best software") but targeted ("best AI support tool for Shopify stores")
- Comparison queries must name real competitors when provided
- Problem-first queries must describe the actual problem, not the product category
- Action queries should include pricing, demo, trial, signup variations
- Trust queries should include reviews, case studies, worth it, reliable
- Minimum 3 queries per intent type
- If competitors are listed, include at least 2 comparison queries per competitor"""


def run(
    page_type: str,
    target_customer: str,
    category: str,
    competitors: list[str],
    decomposition: dict[str, Any],
) -> list[dict[str, str]]:
    """Generate query variants. Returns list of {text, intent} dicts."""
    features = decomposition.get("features", [])[:5]
    value_prop = decomposition.get("value_prop", "")

    user = (
        f"Page type: {page_type}\n"
        f"Target customer: {target_customer}\n"
        f"Product category: {category}\n"
        f"Value proposition: {value_prop}\n"
        f"Key features: {', '.join(features) if features else 'not specified'}\n"
        f"Competitors: {', '.join(competitors) if competitors else 'none specified'}"
    )

    result = call(_SYSTEM, user, tier="qwen", max_tokens=1500)
    if not result:
        result = call(_SYSTEM, user, tier="fallback", max_tokens=1200)

    if not isinstance(result, dict):
        return _fallback_queries(category, competitors)

    queries = result.get("queries", [])
    if not isinstance(queries, list) or len(queries) < 10:
        return _fallback_queries(category, competitors)

    # Validate structure
    validated = []
    valid_intents = {"informational", "comparison", "commercial", "action", "trust", "problem_first"}
    for q in queries:
        if isinstance(q, dict) and q.get("text") and q.get("intent") in valid_intents:
            validated.append({"text": str(q["text"]).strip(), "intent": str(q["intent"])})

    return validated[:25] if validated else _fallback_queries(category, competitors)


def _fallback_queries(category: str, competitors: list[str]) -> list[dict[str, str]]:
    base = [
        {"text": f"what is {category}", "intent": "informational"},
        {"text": f"how does {category} work", "intent": "informational"},
        {"text": f"best {category} for small businesses", "intent": "commercial"},
        {"text": f"top {category} tools 2024", "intent": "commercial"},
        {"text": f"{category} pricing", "intent": "action"},
        {"text": f"{category} free trial", "intent": "action"},
        {"text": f"is {category} worth it", "intent": "trust"},
        {"text": f"{category} reviews", "intent": "trust"},
        {"text": f"how to choose {category}", "intent": "informational"},
        {"text": f"{category} alternatives", "intent": "comparison"},
    ]
    for comp in competitors[:2]:
        base.append({"text": f"{category} vs {comp}", "intent": "comparison"})
    return base
