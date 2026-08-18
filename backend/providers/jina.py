"""
Jina Reader — converts any URL to clean markdown.

Falls back to direct httpx fetch + trafilatura if Jina fails or key is missing.
"""
from __future__ import annotations

import os

import httpx

_TIMEOUT = 30.0
_EMBEDDINGS_ENDPOINT = "https://api.jina.ai/v1/embeddings"
_RERANK_ENDPOINT = "https://api.jina.ai/v1/rerank"


def fetch_markdown(url: str) -> str:
    """Fetch a URL and return clean markdown content. Raises on total failure."""
    jina_key = os.environ.get("JINA_API_KEY", "")

    # Try Jina Reader first (cleanest output)
    try:
        headers: dict[str, str] = {"Accept": "text/plain"}
        if jina_key:
            headers["Authorization"] = f"Bearer {jina_key}"
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.get(f"https://r.jina.ai/{url}", headers=headers)
            resp.raise_for_status()
            content = resp.text.strip()
            if len(content) > 200:
                return content
    except Exception:
        pass

    # Fallback: raw fetch + trafilatura extraction
    try:
        import trafilatura  # type: ignore

        with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = client.get(
                url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; CrestAI/1.0)"},
            )
            resp.raise_for_status()
            text = trafilatura.extract(resp.text, include_tables=True, include_links=False)
            if text and len(text) > 200:
                return text
    except Exception:
        pass

    raise RuntimeError(f"Could not fetch content from {url}")


def embed_texts(
    texts: list[str],
    *,
    model: str | None = None,
    normalized: bool = True,
    task: str | None = None,
    dimensions: int | None = None,
) -> list[list[float]]:
    """Embed texts with Jina. Returns an empty list when unavailable."""
    api_key = os.environ.get("JINA_API_KEY", "")
    if not api_key or not texts:
        return []
    payload = {
        "model": model or os.environ.get("JINA_EMBEDDING_MODEL", "jina-embeddings-v3"),
        "input": texts,
        "normalized": normalized,
        "embedding_type": "float",
        "truncate": True,
    }
    if task:
        payload["task"] = task
    if dimensions:
        payload["dimensions"] = dimensions
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(
                _EMBEDDINGS_ENDPOINT,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return []
    rows = data.get("data", [])
    rows = sorted(rows, key=lambda item: item.get("index", 0))
    embeddings = [row.get("embedding", []) for row in rows]
    if len(embeddings) != len(texts) or any(not isinstance(vec, list) for vec in embeddings):
        return []
    return embeddings


def rerank_documents(
    query: str,
    documents: list[str],
    *,
    model: str | None = None,
    top_n: int | None = None,
) -> list[dict]:
    """Rerank candidate documents with Jina Reranker. Returns [] on failure."""
    api_key = os.environ.get("JINA_API_KEY", "")
    if not api_key or not query.strip() or not documents:
        return []
    payload = {
        "model": model or os.environ.get("JINA_RERANKER_MODEL", "jina-reranker-v3"),
        "query": query,
        "documents": documents,
        "top_n": top_n or len(documents),
        "return_documents": False,
        "truncate": True,
    }
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(
                _RERANK_ENDPOINT,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return []

    normalized = []
    for item in data.get("results", []) or []:
        index = item.get("index")
        score = item.get("relevance_score", item.get("score"))
        if isinstance(index, int) and isinstance(score, (int, float)):
            normalized.append({"index": index, "relevance_score": float(score)})
    return normalized
