"""Fetch endpoint for the MotionViz UI workflow."""
from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse, StreamingResponse

from pipeline import access_intelligence
from providers import jina

router = APIRouter()


def _event(event_type: str, data: Any) -> str:
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


def normalize_url(raw: str) -> str:
    value = str(raw or "").strip()
    if not value:
        raise ValueError("url parameter required")
    if "://" not in value:
        value = f"https://{value.lstrip('/')}"
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("url must be a valid http or https URL")
    return value


def _source_signals(normalized_url: str, intelligence: dict[str, Any]) -> dict[str, Any]:
    parsed = urlparse(normalized_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    signals = intelligence.get("source_signals", {})
    return {
        "sourceUrl": normalized_url,
        "origin": origin,
        "llmsTxt": signals.get("llmsTxt", {"present": False, "url": f"{origin}/llms.txt"}),
        "llmsFullTxt": signals.get("llmsFullTxt", {"present": False, "url": f"{origin}/llms-full.txt"}),
    }


def _fetch_payload(normalized_url: str) -> dict[str, Any]:
    markdown = jina.fetch_markdown(normalized_url)
    intelligence = access_intelligence.run(normalized_url, markdown)
    return {
        "markdown": markdown,
        "charCount": len(markdown),
        "sourceSignals": _source_signals(normalized_url, intelligence),
        "normalizedUrl": normalized_url,
        "intelligence": {
            "access": intelligence.get("access", {}),
            "extraction": intelligence.get("extraction", {}),
        },
    }


def _stream_fetch(normalized_url: str):
    try:
        yield _event("status", {"phase": "connecting", "normalizedUrl": normalized_url})
        payload = _fetch_payload(normalized_url)
        yield _event("chunk", {"chunk": payload["markdown"]})
        yield _event("complete", payload)
    except Exception as exc:
        yield _event("failure", {"error": str(exc), "normalizedUrl": normalized_url})


@router.get("/fetch")
def fetch_page(url: str = Query(""), stream: str = Query("")):
    try:
        normalized_url = normalize_url(url)
    except ValueError as exc:
        if stream == "1":
            return StreamingResponse(
                iter([_event("failure", {"error": str(exc)})]),
                media_type="text/event-stream",
            )
        return JSONResponse({"error": str(exc)}, status_code=400)

    if stream == "1":
        return StreamingResponse(
            _stream_fetch(normalized_url),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    try:
        return _fetch_payload(normalized_url)
    except Exception as exc:
        return JSONResponse({"error": str(exc), "normalizedUrl": normalized_url}, status_code=502)
