"""Ground competitor research in Tavily and Exa before any LLM fallback."""
from __future__ import annotations

import concurrent.futures
from typing import Any
from urllib.parse import urlparse

from providers import exa, jina, tavily
from providers.openrouter import call
from pipeline.retrieval import analyze_retrieval, chunk_markdown
from pipeline.search import (
    _count_specific_claims,
    _count_trust_signals,
    _extract_ctas,
    _extract_faq_questions,
    _extract_headings,
    _has_comparison,
    _has_pricing,
)

_URL_FALLBACK_SYSTEM = """You are a precise competitive research assistant.
Return ONLY valid JSON with real competitor URLs likely to exist:
{"competitor_urls":[{"url":"https://...","brand":"...","page_type":"product|pricing|comparison|landing"}]}
Only include URLs you are confident are real. Maximum 8 URLs."""


def _domain(url: str) -> str:
    try:
        return urlparse(url).netloc.replace("www.", "")
    except Exception:
        return ""


def _target_domains(url: str, competitors: list[str]) -> set[str]:
    domains = {_domain(url)} if url else set()
    for competitor in competitors:
        value = competitor.strip().lower().replace("https://", "").replace("http://", "")
        if value:
            domains.add(value.replace("www.", "").split("/")[0])
    return {domain for domain in domains if domain}


def _search_queries(
    category: str,
    target_customer: str,
    page_type: str,
    target_query: str,
    competitors: list[str],
) -> list[str]:
    queries = []
    if target_query:
        queries.append(target_query)
    if category:
        queries.extend(
            [
                f"best {category} for {target_customer or 'businesses'}",
                f"{category} pricing comparison",
                f"{category} alternatives",
                f"{category} {page_type} page examples",
            ]
        )
    for competitor in competitors[:4]:
        queries.append(f"{competitor} {category or page_type} comparison")
    cleaned = []
    seen = set()
    for query in queries:
        query = " ".join(query.split())
        if query and query not in seen:
            cleaned.append(query)
            seen.add(query)
    return cleaned[:8]


def _normalize_search_result(item: dict[str, Any], source_query: str) -> dict[str, Any]:
    return {
        "url": item.get("url", ""),
        "title": item.get("title", ""),
        "content": item.get("content", ""),
        "source": item.get("source", "unknown"),
        "source_query": source_query or item.get("query", ""),
        "score": item.get("score", 0),
    }


def _discover(
    *,
    target_url: str,
    category: str,
    target_customer: str,
    page_type: str,
    target_query: str,
    competitors: list[str],
    max_results: int,
) -> tuple[list[dict[str, Any]], list[str]]:
    queries = _search_queries(category, target_customer, page_type, target_query, competitors)
    excluded_domains = list(_target_domains(target_url, []))
    seen: set[str] = set()
    results: list[dict[str, Any]] = []

    for query in queries:
        provider_results = tavily.search(
            query,
            max_results=4,
            exclude_domains=excluded_domains,
            search_depth="basic",
        )
        if not provider_results:
            provider_results = exa.search(query, max_results=4, exclude_domains=excluded_domains)
        for item in provider_results:
            normalized = _normalize_search_result(item, query)
            url = normalized["url"]
            if not url or url in seen or _domain(url) in excluded_domains:
                continue
            seen.add(url)
            results.append(normalized)
            if len(results) >= max_results:
                return results, queries

    if not results:
        results = _llm_discover(category, target_customer, page_type, competitors, max_results)
    return results[:max_results], queries


def _llm_discover(
    category: str,
    target_customer: str,
    page_type: str,
    competitors: list[str],
    max_results: int,
) -> list[dict[str, Any]]:
    result = call(
        _URL_FALLBACK_SYSTEM,
        (
            f"Category: {category}\nTarget customer: {target_customer}\n"
            f"Page type: {page_type}\nCompetitors: {', '.join(competitors)}"
        ),
        tier="fallback",
        max_tokens=900,
    )
    if not isinstance(result, dict):
        return []
    items = []
    for item in result.get("competitor_urls", [])[:max_results]:
        url = item.get("url", "")
        if not url:
            continue
        items.append(
            {
                "url": url,
                "title": item.get("brand", _domain(url)),
                "content": "",
                "source": "openrouter_url_fallback",
                "source_query": f"LLM fallback: {page_type}",
                "score": 0,
            }
        )
    return items


def _content_for_result(item: dict[str, Any]) -> str:
    content = item.get("content", "")
    if content and len(content) > 500:
        return content
    exa_content = exa.contents([item["url"]], max_characters=8000)
    if exa_content and exa_content[0].get("content"):
        return exa_content[0]["content"]
    try:
        return jina.fetch_markdown(item["url"])
    except Exception:
        return content


def _annotated_chunks(content: str, page: dict[str, Any]) -> list[dict[str, Any]]:
    source_id = page["source_id"]
    chunks = []
    for chunk in chunk_markdown(content)[:24]:
        chunks.append(
            {
                **chunk,
                "chunk_id": f"{source_id}-{chunk.get('chunk_id', '')}",
                "source_id": source_id,
                "source_type": "competitor",
                "source_url": page.get("url", ""),
                "source_title": page.get("title", ""),
            }
        )
    return chunks


def _structure_page(item: dict[str, Any], source_id: str, target_query: str = "") -> dict[str, Any] | None:
    url = item.get("url", "")
    if not url:
        return None
    content = _content_for_result(item)
    if len(content) < 160:
        return None
    page: dict[str, Any] = {
        "source_id": source_id,
        "sourceId": source_id,
        "url": url,
        "title": item.get("title") or _domain(url),
        "source_query": item.get("source_query", ""),
        "source": item.get("source", "unknown"),
        "query_intent": "commercial",
        "is_competitor": True,
        "content": content[:12000],
        "content_snippet": content[:1500],
        "headings": _extract_headings(content)[:10],
        "faq_questions": _extract_faq_questions(content)[:15],
        "specific_claims_count": _count_specific_claims(content),
        "has_comparison_section": _has_comparison(content),
        "has_pricing_info": _has_pricing(content),
        "trust_signal_count": _count_trust_signals(content),
        "cta_texts": _extract_ctas(content)[:5],
        "word_count": len(content.split()),
        "char_count": len(content),
    }
    chunks = _annotated_chunks(content, page)
    page["chunks"] = chunks
    page["chunk_count"] = len(chunks)
    page["chunkCount"] = len(chunks)
    if target_query and chunks:
        retrieval = analyze_retrieval(chunks, target_query, use_external=False)
        page["best_retrieved_chunk"] = retrieval.get("top_chunks", [None])[0] if retrieval.get("top_chunks") else None
        page["best_retrieval_score"] = retrieval.get("retrieval_score", 0)
    return page


def run(
    *,
    target_url: str,
    category: str,
    target_customer: str,
    page_type: str,
    target_query: str,
    competitors: list[str],
    max_results: int = 8,
) -> dict[str, Any]:
    discovered, queries = _discover(
        target_url=target_url,
        category=category,
        target_customer=target_customer,
        page_type=page_type,
        target_query=target_query,
        competitors=competitors,
        max_results=max_results,
    )
    pages: list[dict[str, Any]] = []
    failures: list[str] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        futures = {
            ex.submit(_structure_page, item, f"competitor-{index + 1}", target_query): item
            for index, item in enumerate(discovered)
        }
        for future in concurrent.futures.as_completed(futures):
            item = futures[future]
            try:
                page = future.result()
            except Exception as exc:
                failures.append(f"{item.get('url', 'competitor')}: {exc}")
                continue
            if page:
                pages.append(page)
            else:
                failures.append(f"{item.get('url', 'competitor')}: no usable readable content")
    return {
        "queries": queries,
        "results": discovered,
        "pages": pages,
        "competitors": pages,
        "failures": failures,
        "pages_analyzed": len(pages),
        "providers": {
            "tavily": any(item.get("source") == "tavily" for item in discovered),
            "exa": any(str(item.get("source", "")).startswith("exa") for item in discovered),
            "openrouter_fallback": any(item.get("source") == "openrouter_url_fallback" for item in discovered),
        },
    }
