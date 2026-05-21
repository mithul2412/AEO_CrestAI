"""
Step 6 — Six-Dimension AEO Scoring (Nemotron)

Scores the draft page across 6 dimensions with specific, traceable evidence.
Every score traces back to content on the page or competitor benchmark data.

Dimensions:
  1. Specificity       (25%) — specific vs. vague claims
  2. Query Coverage    (20%) — how many of the 22 queries the page answers
  3. Extractability    (20%) — can AI pull a clean answer from each section
  4. Competitor Gap    (15%) — how the draft stacks up against the benchmark
  5. Trust Density     (10%) — social proof vs. competitor benchmark
  6. Action Clarity    (10%) — CTA quality and placement

Overall AEO score = weighted sum, 0-100.
"""
from __future__ import annotations

from typing import Any

from providers.openrouter import call

_SYSTEM = """You are an AEO (Answer Engine Optimization) scoring expert.
Score this page across 6 dimensions. Return ONLY valid JSON:

{
  "dimensions": {
    "specificity":     {"score": 0, "evidence": "", "gap": "", "benchmark_note": ""},
    "query_coverage":  {"score": 0, "evidence": "", "gap": "", "answered_queries": [], "unanswered_queries": []},
    "extractability":  {"score": 0, "evidence": "", "gap": "", "weak_sections": []},
    "competitor_gap":  {"score": 0, "evidence": "", "gap": ""},
    "trust_density":   {"score": 0, "evidence": "", "gap": "", "found_signals": [], "missing_signals": []},
    "action_clarity":  {"score": 0, "evidence": "", "gap": "", "cta_found": ""}
  },
  "overall_score": 0,
  "score_rationale": "",
  "top_3_improvements": [
    {"improvement": "", "expected_score_delta": 0, "effort": "low|medium|high", "dimension": ""}
  ]
}

Scoring guide (0-20 very weak, 21-40 below avg, 41-60 moderate, 61-80 good, 81-100 strong).
Overall = specificity×0.25 + query_coverage×0.20 + extractability×0.20 + competitor_gap×0.15 + trust_density×0.10 + action_clarity×0.10"""


def run(
    decomposition: dict[str, Any],
    queries: list[dict[str, str]],
    patterns: dict[str, Any],
    content: str,
) -> dict[str, Any]:
    """Score the draft page across 6 dimensions. Returns full scorecard."""
    benchmark = patterns.get("benchmark", {})
    query_texts = [q["text"] for q in queries]

    user = _build_scoring_prompt(decomposition, query_texts, benchmark, patterns, content)

    result = call(_SYSTEM, user, tier="nemotron", max_tokens=3000)

    if not isinstance(result, dict) or "dimensions" not in result:
        return _fallback_score(decomposition, queries, patterns)

    # Sanitize dimensions: ensure each value is a dict with a "score" key
    raw_dims = result.get("dimensions", {})
    if not isinstance(raw_dims, dict):
        return _fallback_score(decomposition, queries, patterns)

    clean_dims: dict[str, Any] = {}
    for k, v in raw_dims.items():
        if isinstance(v, dict):
            clean_dims[k] = v
        elif isinstance(v, (int, float)):
            clean_dims[k] = {"score": int(v)}
        else:
            # Skip malformed dimension entries — fallback handles them
            clean_dims[k] = {"score": 0, "evidence": str(v)[:100], "gap": ""}
    result["dimensions"] = clean_dims

    # Recompute overall score from dimension scores to ensure accuracy
    dims = result.get("dimensions", {})
    weights = {
        "specificity": 0.25,
        "query_coverage": 0.20,
        "extractability": 0.20,
        "competitor_gap": 0.15,
        "trust_density": 0.10,
        "action_clarity": 0.10,
    }
    weighted = sum(
        dims.get(k, {}).get("score", 0) * w
        for k, w in weights.items()
    )
    result["overall_score"] = round(weighted)

    return result


def _build_scoring_prompt(
    decomposition: dict,
    query_texts: list[str],
    benchmark: dict,
    patterns: dict,
    content: str,
) -> str:
    claims = decomposition.get("claims", [])
    specific_claims = [c for c in claims if c.get("type") == "specific"]
    vague_claims = [c for c in claims if c.get("type") == "vague"]
    ts = decomposition.get("trust_signals", {})

    return f"""DRAFT PAGE ANATOMY:
Value proposition: {decomposition.get('value_prop', 'unknown')}
Target customer: {decomposition.get('target_customer_stated', 'unknown')}
Specificity score (pre-computed): {decomposition.get('specificity_score', 0)}/100
Total claims: {len(claims)} ({len(specific_claims)} specific, {len(vague_claims)} vague)
H2 headings: {decomposition.get('h2_headings', [])}
FAQ present: {decomposition.get('faq_present', False)} ({decomposition.get('faq_question_count', 0)} questions)
Comparison block: {decomposition.get('comparison_block_present', False)}
Trust signals: named customers={len(ts.get('named_customers', []))}, testimonials={ts.get('testimonials_with_attribution', 0)}, case study metrics={len(ts.get('case_study_metrics', []))}
CTA texts: {decomposition.get('cta_texts', [])}
Questions page already answers: {decomposition.get('questions_answered', [])}

COMPETITOR BENCHMARK (from {benchmark.get('avg_word_count', 0)}+ word pages):
Average specific claims: {benchmark.get('avg_specific_claims', 0)}
Average FAQ questions: {benchmark.get('avg_faq_questions', 0)}
Average trust signals: {benchmark.get('avg_trust_signals', 0)}
% with comparison block: {round(benchmark.get('pct_with_comparison_block', 0) * 100)}%
% with pricing info: {round(benchmark.get('pct_with_pricing_info', 0) * 100)}%
Key insight from top pages: {patterns.get('key_insight', 'n/a')}
Common questions competitors answer: {patterns.get('common_questions_answered', [])[:8]}

QUERIES TO TEST COVERAGE (22 real user queries):
{chr(10).join(f'  {i+1}. {q}' for i, q in enumerate(query_texts[:22]))}

DRAFT PAGE CONTENT (first 4000 chars):
{content[:4000]}"""


def _fallback_score(
    decomposition: dict,
    queries: list[dict],
    patterns: dict,
) -> dict[str, Any]:
    """Statistical fallback when Nemotron call fails."""
    spec_score = decomposition.get("specificity_score", 0)
    claims = decomposition.get("claims", [])
    benchmark = patterns.get("benchmark", {})

    faq_score = 80 if decomposition.get("faq_present") else 20
    comp_score = 70 if decomposition.get("comparison_block_present") else 15

    ts = decomposition.get("trust_signals", {})
    trust_count = (
        len(ts.get("named_customers", []))
        + ts.get("testimonials_with_attribution", 0)
        + len(ts.get("case_study_metrics", []))
    )
    benchmark_trust = max(benchmark.get("avg_trust_signals", 3), 1)
    trust_score = min(100, round(trust_count / benchmark_trust * 60))

    cta_texts = decomposition.get("cta_texts", [])
    action_score = 60 if cta_texts else 20

    # Rough query coverage from questions_answered
    answered = len(decomposition.get("questions_answered", []))
    total_q = max(len(queries), 1)
    coverage_score = min(100, round(answered / total_q * 100))

    overall = round(
        spec_score * 0.25
        + coverage_score * 0.20
        + faq_score * 0.20
        + comp_score * 0.15
        + trust_score * 0.10
        + action_score * 0.10
    )

    return {
        "dimensions": {
            "specificity": {"score": spec_score, "evidence": f"{len(claims)} claims analyzed", "gap": "", "benchmark_note": ""},
            "query_coverage": {"score": coverage_score, "answered_queries": decomposition.get("questions_answered", []), "unanswered_queries": [], "evidence": "", "gap": ""},
            "extractability": {"score": faq_score, "extractable_sections": [], "weak_sections": [], "evidence": "", "gap": ""},
            "competitor_gap": {"score": comp_score, "evidence": "", "gap": ""},
            "trust_density": {"score": trust_score, "found_signals": [], "missing_signals": [], "evidence": "", "gap": ""},
            "action_clarity": {"score": action_score, "cta_found": cta_texts[0] if cta_texts else "", "evidence": "", "gap": ""},
        },
        "overall_score": overall,
        "score_rationale": "Score computed from page signals.",
        "top_3_improvements": [],
    }
