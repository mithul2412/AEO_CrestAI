"""Tavily search provider for grounded AEO competitor discovery."""
from __future__ import annotations

import concurrent.futures
import os
from typing import Any

import httpx

from providers.openrouter import call
from providers import jina as jina_provider

_ENDPOINT = "https://api.tavily.com/search"
_TIMEOUT = 30.0

_URL_GEN_SYSTEM = """You are a B2B market research expert with deep knowledge of SaaS, agency,
and e-commerce tool landscapes.

Given a product category and competitors, list real URLs of competitor pages that would
rank for buyers researching this category. Focus on:
  - Product/feature pages
  - Pricing pages
  - Comparison pages
  - Landing pages targeting the specific customer type

Return ONLY valid JSON:
{
  "competitor_urls": [
    {"url": "https://...", "brand": "<brand name>", "page_type": "product|pricing|comparison|landing"}
  ]
}

Rules:
- Only list URLs you are confident actually exist (from your training knowledge)
- Include 2-3 pages per major competitor
- Prioritize pages that directly compete for the target customer's attention
- Maximum 12 URLs total"""


def search(
    query: str,
    *,
    max_results: int = 5,
    include_domains: list[str] | None = None,
    exclude_domains: list[str] | None = None,
    search_depth: str = "basic",
) -> list[dict[str, Any]]:
    """Search the live web with Tavily if `TAVILY_API_KEY` is configured."""
    api_key = os.environ.get("TAVILY_API_KEY", "")
    if not api_key:
        return []

    payload: dict[str, Any] = {
        "query": query,
        "topic": "general",
        "search_depth": search_depth,
        "max_results": max_results,
        "include_answer": False,
        "include_raw_content": "markdown",
        "include_images": False,
        "include_favicon": True,
    }
    if include_domains:
        payload["include_domains"] = include_domains
    if exclude_domains:
        payload["exclude_domains"] = exclude_domains

    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(
                _ENDPOINT,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return []

    results = []
    for item in data.get("results", []) or []:
        url = item.get("url", "")
        if not url:
            continue
        results.append(
            {
                "title": item.get("title", ""),
                "url": url,
                "content": item.get("raw_content") or item.get("content") or "",
                "score": item.get("score", 0),
                "source": "tavily",
                "query": query,
                "favicon": item.get("favicon", ""),
            }
        )
    return results


def search_batch(
    queries: list[str],
    *,
    max_results_per_query: int = 5,
    max_workers: int = 4,
) -> dict[str, list[dict[str, Any]]]:
    """Run a small Tavily batch concurrently."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        futures = {
            ex.submit(search, query, max_results=max_results_per_query): query
            for query in queries
        }
        return {
            query: future.result()
            for future, query in ((future, futures[future]) for future in concurrent.futures.as_completed(futures))
        }


def fetch_competitor_pages(
    category: str,
    target_customer: str,
    competitors: list[str],
    page_type: str,
    max_pages: int = 10,
) -> list[dict[str, Any]]:
    """
    Main entry point. Prefer Tavily live search, then fall back to LLM URL discovery.
    Returns list of structured competitor page dicts ready for pattern analysis.
    """
    live_urls = _discover_with_tavily(category, target_customer, competitors, page_type, max_pages)
    if live_urls:
        return _fetch_url_items(live_urls, max_pages)

    user = (
        f"Category: {category}\n"
        f"Target customer: {target_customer}\n"
        f"Page type being analyzed: {page_type}\n"
        f"Known competitors: {', '.join(competitors) if competitors else 'not specified — infer from category'}"
    )

    result = call(_URL_GEN_SYSTEM, user, tier="fallback", max_tokens=1000)
    if not isinstance(result, dict):
        return []

    urls = result.get("competitor_urls", [])
    if not urls:
        return []

    return _fetch_url_items(urls, max_pages)


def _discover_with_tavily(
    category: str,
    target_customer: str,
    competitors: list[str],
    page_type: str,
    max_pages: int,
) -> list[dict[str, Any]]:
    queries = [
        f"best {category} for {target_customer}".strip(),
        f"{category} {page_type} page competitors".strip(),
        f"{category} pricing comparison".strip(),
    ]
    for competitor in competitors[:4]:
        queries.append(f"{competitor} {category} {page_type}")

    seen: set[str] = set()
    items: list[dict[str, Any]] = []
    for query in queries:
        for result in search(query, max_results=4, search_depth="basic"):
            url = result.get("url", "")
            if not url or url in seen:
                continue
            seen.add(url)
            items.append(
                {
                    "url": url,
                    "brand": result.get("title") or url.split("/")[2],
                    "page_type": page_type,
                    "source_query": query,
                    "source": "tavily",
                    "snippet": result.get("content", ""),
                }
            )
            if len(items) >= max_pages:
                return items
    return items


def _fetch_url_items(urls: list[dict[str, Any]], max_pages: int) -> list[dict[str, Any]]:
    pages = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        futures = {
            ex.submit(_fetch_one, item): item
            for item in urls[:max_pages]
        }
        for f in concurrent.futures.as_completed(futures):
            page = f.result()
            if page:
                pages.append(page)

    return pages


def _fetch_one(url_item: dict[str, Any]) -> dict[str, Any] | None:
    """Fetch one competitor URL via Jina and structure the result."""
    url = url_item.get("url", "")
    if not url:
        return None
    try:
        content = jina_provider.fetch_markdown(url)
        if len(content) < 200:
            return None

        # Import here to avoid circular imports
        from pipeline.search import (
            _extract_headings, _extract_faq_questions, _count_specific_claims,
            _has_comparison, _has_pricing, _count_trust_signals, _extract_ctas,
        )

        return {
            "url": url,
            "title": url_item.get("brand", url.split("/")[2]),
            "source_query": url_item.get("source_query") or f"competitor page: {url_item.get('page_type', 'product')}",
            "query_intent": "commercial",
            "is_competitor": True,
            "source": url_item.get("source", "llm_discovery"),
            "content_snippet": content[:1500],
            "headings": _extract_headings(content)[:10],
            "faq_questions": _extract_faq_questions(content)[:15],
            "specific_claims_count": _count_specific_claims(content),
            "has_comparison_section": _has_comparison(content),
            "has_pricing_info": _has_pricing(content),
            "trust_signal_count": _count_trust_signals(content),
            "cta_texts": _extract_ctas(content)[:5],
            "word_count": len(content.split()),
        }
    except Exception:
        return None
