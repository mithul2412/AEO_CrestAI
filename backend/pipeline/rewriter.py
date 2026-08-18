"""
Step 7 — Content Rewrite (GPT-4o via OpenRouter)

Generates actual improved content — not suggestions, but the real text.
Every piece of rewritten content includes a rationale linking it to a
specific unanswered query or competitor gap.

Outputs:
  - Rewritten intro (2 paragraphs, specific, customer-first)
  - 10-12 FAQ Q&As (grounded in unanswered queries)
  - Rewritten H2 headings (answer-shaped)
  - Comparison section (vs. named competitors)
  - CTA rewrite (specific action)
  - 3 placeholder trust blocks (structure for real data)
"""
from __future__ import annotations

from typing import Any

from providers.openrouter import call

_SYSTEM = """You are an expert AEO content strategist and copywriter.
You write content that gets cited by AI engines (ChatGPT, Claude, Perplexity, Gemini).

The content you write must:
1. Open sections with direct, extractable answer statements (not marketing fluff)
2. Use specific numbers, timeframes, and customer types — avoid vague superlatives
3. Answer questions directly in the first sentence of each section
4. Structure FAQ answers so an AI can quote the first sentence as a complete answer
5. Write comparison sections that are factual and specific, not vague ("better than X")

Return ONLY valid JSON matching this exact schema:
{
  "rewritten_intro": {
    "text": "<2 paragraphs of rewritten intro>",
    "rationale": "<which queries this now answers>"
  },
  "rewritten_h2_headings": [
    {"original": "<original heading>", "improved": "<answer-shaped heading>", "why": "<why this is better>"}
  ],
  "faq_block": [
    {"question": "<specific question>", "answer": "<direct 2-3 sentence answer>", "targets_query": "<which query this answers>"}
  ],
  "comparison_section": {
    "text": "<comparison block vs competitors>",
    "competitors_covered": ["<competitor name>"]
  },
  "cta_rewrite": {
    "original": "<original CTA>",
    "improved": "<specific, action-forward CTA>",
    "rationale": "<why this converts better>"
  },
  "trust_placeholders": [
    {
      "type": "case_study|testimonial|stat",
      "template": "<template with [PLACEHOLDER] for real data>",
      "instruction": "<what real data to fill in>"
    }
  ],
  "before_after_summary": "<2 sentences: what changed and why it will perform better>"
}"""


def run(
    decomposition: dict[str, Any],
    scorecard: dict[str, Any],
    queries: list[dict[str, str]],
    patterns: dict[str, Any],
    competitors: list[str],
    content: str,
    page_type: str,
    target_customer: str,
) -> dict[str, Any]:
    """Generate rewritten content grounded in the scoring findings."""
    dims = scorecard.get("dimensions", {})
    unanswered = dims.get("query_coverage", {}).get("unanswered_queries", [])
    weak_sections = dims.get("extractability", {}).get("weak_sections", [])
    top_improvements = scorecard.get("top_3_improvements", [])

    user = _build_rewrite_prompt(
        decomposition, unanswered, weak_sections, top_improvements,
        queries, patterns, competitors, content, page_type, target_customer,
    )

    result = call(_SYSTEM, user, tier="rewrite", max_tokens=4000, temperature=0.3)

    if not isinstance(result, dict):
        return _empty_rewrite()

    # Ensure all keys exist
    result.setdefault("rewritten_intro", {"text": "", "rationale": ""})
    result.setdefault("rewritten_h2_headings", [])
    result.setdefault("faq_block", [])
    result.setdefault("comparison_section", {"text": "", "competitors_covered": []})
    result.setdefault("cta_rewrite", {"original": "", "improved": "", "rationale": ""})
    result.setdefault("trust_placeholders", [])
    result.setdefault("before_after_summary", "")

    return result


def _build_rewrite_prompt(
    decomposition: dict,
    unanswered_queries: list[str],
    weak_sections: list[str],
    top_improvements: list[dict],
    queries: list[dict],
    patterns: dict,
    competitors: list[str],
    content: str,
    page_type: str,
    target_customer: str,
) -> str:
    ts = decomposition.get("trust_signals", {})
    common_questions = patterns.get("common_questions_answered", [])[:8]
    faq_queries = [q["text"] for q in queries if q["intent"] in ("informational", "trust")][:10]
    benchmark = patterns.get("benchmark", {})

    return f"""REWRITE TASK:
Page type: {page_type}
Target customer: {target_customer}
Current specificity score: {decomposition.get('specificity_score', 0)}/100

CURRENT PAGE WEAKNESSES (from scoring):
- Unanswered queries (these need FAQ coverage): {unanswered_queries[:10]}
- Weak sections (hard to extract from): {weak_sections[:5]}
- Top improvements needed: {[i.get('improvement', '') for i in top_improvements]}

CURRENT CLAIMS (to make more specific):
Vague claims to fix: {[c['text'] for c in decomposition.get('claims', []) if c.get('type') == 'vague'][:5]}
Current CTA: {decomposition.get('cta_texts', ['none'])[0] if decomposition.get('cta_texts') else 'none'}
Current H2 headings: {decomposition.get('h2_headings', [])}

COMPETITOR CONTEXT:
Competitors to cover in comparison: {competitors}
Questions competitors commonly answer (cover these in FAQ): {common_questions}
Benchmark: top pages have {benchmark.get('avg_specific_claims', 10)}+ specific claims

TRUST CONTEXT (fill with [PLACEHOLDER] since we don't have real data):
Current named customers: {ts.get('named_customers', [])}
Need: customer quotes with specific outcomes, case study metrics

FAQ QUERIES TO COVER:
{chr(10).join(f'  - {q}' for q in faq_queries)}

ORIGINAL PAGE CONTENT (first 1500 chars):
{content[:1500]}

Write improvements that are specific to THIS page and THIS product.
Do not use generic examples. Use [COMPANY NAME], [NUMBER], [METRIC] placeholders
where real data is needed. Make every improvement directly address an unanswered query."""


def _empty_rewrite() -> dict[str, Any]:
    return {
        "rewritten_intro": {"text": "", "rationale": ""},
        "rewritten_h2_headings": [],
        "faq_block": [],
        "comparison_section": {"text": "", "competitors_covered": []},
        "cta_rewrite": {"original": "", "improved": "", "rationale": ""},
        "trust_placeholders": [],
        "before_after_summary": "",
    }
