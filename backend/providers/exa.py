"""Exa provider for full-text page extraction and search with contents."""
from __future__ import annotations

import os
from typing import Any

import httpx

_SEARCH_ENDPOINT = "https://api.exa.ai/search"
_CONTENTS_ENDPOINT = "https://api.exa.ai/contents"
_TIMEOUT = 35.0


def _headers() -> dict[str, str] | None:
    api_key = os.environ.get("EXA_API_KEY", "")
    if not api_key:
        return None
    return {"x-api-key": api_key, "Content-Type": "application/json"}


def search(
    query: str,
    *,
    max_results: int = 5,
    include_domains: list[str] | None = None,
    exclude_domains: list[str] | None = None,
    text_max_characters: int = 5000,
) -> list[dict[str, Any]]:
    """Search Exa and request LLM-ready content for returned URLs."""
    headers = _headers()
    if not headers:
        return []
    payload: dict[str, Any] = {
        "query": query,
        "numResults": max_results,
        "type": "auto",
        "contents": {
            "text": {"maxCharacters": text_max_characters, "verbosity": "standard"},
            "highlights": {"maxCharacters": 1200, "query": query},
            "maxAgeHours": 24,
        },
    }
    if include_domains:
        payload["includeDomains"] = include_domains
    if exclude_domains:
        payload["excludeDomains"] = exclude_domains
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(_SEARCH_ENDPOINT, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return []
    return [_normalize_result(item, query=query, source="exa_search") for item in data.get("results", []) or []]


def contents(urls: list[str], *, max_characters: int = 8000) -> list[dict[str, Any]]:
    """Fetch clean text for known URLs using Exa Contents."""
    headers = _headers()
    if not headers or not urls:
        return []
    payload = {
        "urls": urls,
        "text": {"maxCharacters": max_characters, "verbosity": "standard"},
        "maxAgeHours": 24,
    }
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(_CONTENTS_ENDPOINT, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return []
    return [_normalize_result(item, query="", source="exa_contents") for item in data.get("results", []) or []]


def _normalize_result(item: dict[str, Any], *, query: str, source: str) -> dict[str, Any]:
    highlights = item.get("highlights", [])
    if isinstance(highlights, list):
        highlight_text = "\n".join(str(value) for value in highlights)
    else:
        highlight_text = str(highlights or "")
    return {
        "title": item.get("title", ""),
        "url": item.get("url") or item.get("id") or "",
        "content": item.get("text") or highlight_text or item.get("summary", ""),
        "highlights": highlights if isinstance(highlights, list) else [],
        "score": item.get("score", 0),
        "source": source,
        "query": query,
        "publishedDate": item.get("publishedDate"),
        "author": item.get("author", ""),
        "favicon": item.get("favicon", ""),
    }
