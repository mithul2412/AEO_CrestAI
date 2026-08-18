"""
Step 4 — Competitor Research (LLM discovery + Jina fetch, 100% free)

Uses Llama 3.3 70B (free) to discover real competitor URLs for the category,
then fetches each via Jina Reader to get actual current content.

Returns structured competitor intelligence ready for pattern analysis.
"""
from __future__ import annotations

import re
from typing import Any


def run(
    queries: list[dict[str, str]],
    competitors: list[str],
    category: str = "",
    target_customer: str = "",
    page_type: str = "product",
) -> dict[str, Any]:
    """
    Discover and fetch competitor pages. Returns structured research results.
    """
    from providers.tavily import fetch_competitor_pages

    competitor_pages = fetch_competitor_pages(
        category=category or "software",
        target_customer=target_customer or "businesses",
        competitors=competitors,
        page_type=page_type,
        max_pages=10,
    )

    return {
        "search_results": {},
        "competitor_pages": competitor_pages,
        "queries_searched": [q["text"] for q in queries[:8]],
        "total_pages_analyzed": len(competitor_pages),
    }


# ─── Signal extractors (shared with tavily.py) ───────────────────────────────

_HEADING_RE = re.compile(r"^#{1,3}\s+(.+)$", re.MULTILINE)
_FAQ_RE = re.compile(r"(?:^#{1,4}[^#\n]*\?|^\*\*[^*\n]+\?\*\*)", re.MULTILINE | re.IGNORECASE)
_NUMERIC_RE = re.compile(r"\b\d+(?:\.\d+)?(?:%|x|\+|k|m|b)?\b|\$\d[\d,]*", re.IGNORECASE)
_COMPARISON_RE = re.compile(r"\bvs\.?\b|\bversus\b|\bcompared to\b|\balternative\b", re.IGNORECASE)
_PRICING_RE = re.compile(r"\$\d|\bpricing\b|\bper month\b|\bper seat\b|\bfree plan\b|\bfree tier\b", re.IGNORECASE)
_TRUST_RE = re.compile(
    r"\b\d[\d,]*\+?\s+(?:customers?|companies|teams?|users?|brands?)\b"
    r"|\bcustomer stor\w+\b|\btestimonial\b|\bcase stud\w+\b|\breview\b",
    re.IGNORECASE,
)
_CTA_RE = re.compile(
    r"\b(?:get started|book a demo|start free|try free|sign up|request demo|"
    r"schedule a call|contact us|start trial|free trial)\b",
    re.IGNORECASE,
)


def _extract_headings(content: str) -> list[str]:
    return [m.group(1).strip() for m in _HEADING_RE.finditer(content)]


def _extract_faq_questions(content: str) -> list[str]:
    return [m.group(0).strip().lstrip("#* ") for m in _FAQ_RE.finditer(content)]


def _count_specific_claims(content: str) -> int:
    sentences = re.split(r"[.!?\n]", content)
    return sum(1 for s in sentences if len(_NUMERIC_RE.findall(s)) >= 1 and len(s.split()) >= 5)


def _has_comparison(content: str) -> bool:
    return bool(_COMPARISON_RE.search(content))


def _has_pricing(content: str) -> bool:
    return bool(_PRICING_RE.search(content))


def _count_trust_signals(content: str) -> int:
    return len(_TRUST_RE.findall(content))


def _extract_ctas(content: str) -> list[str]:
    return list({m.group(0).lower() for m in _CTA_RE.finditer(content)})
