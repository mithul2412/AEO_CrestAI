"""
POST /analyze — SSE-streaming AEO pipeline endpoint.

Streams pipeline progress events as Server-Sent Events so the frontend
can show live step updates. The final SSE event contains the full result.

Request body:
  url            — live URL to analyze (optional if draft_content provided)
  draft_content  — raw text/markdown of draft page
  page_type      — product | landing | pricing | comparison | faq | service
  target_query   — optional query for Query Match Score and hero gap
  target_customer
  primary_action
  competitors    — list of competitor domains
  category       — optional product category hint
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from pipeline.aeo_pipeline import AnalyzeRequest, PipelineEvent, run as run_pipeline

router = APIRouter()


class AnalyzeRequestBody(BaseModel):
    url: str = ""
    draft_content: str = ""
    page_type: str = "product"
    target_query: str = ""
    target_customer: str = ""
    primary_action: str = "book demo"
    competitors: list[str] = []
    category: str = ""
    run_legacy_llm_scorecard: bool = True
    include_llm_rewrite: bool = True
    run_competitor_grounding: bool = True


def _event(event_type: str, data: Any) -> str:
    """Format a single SSE event."""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


def _pipeline_event_to_sse(ev: PipelineEvent) -> str:
    payload = {
        "step": ev.step,
        "total_steps": ev.total_steps,
        "label": ev.label,
        "status": ev.status,
        **ev.data,
    }
    if ev.status == "error":
        return _event("error", payload)
    if "result" in ev.data:
        return _event("result", payload)
    return _event("progress", payload)


def _stream_pipeline(body: AnalyzeRequestBody):
    """Generator that runs the pipeline and yields SSE strings."""
    request = AnalyzeRequest(
        url=body.url,
        draft_content=body.draft_content,
        page_type=body.page_type,
        target_query=body.target_query,
        target_customer=body.target_customer,
        primary_action=body.primary_action,
        competitors=body.competitors,
        category=body.category,
        run_legacy_llm_scorecard=body.run_legacy_llm_scorecard,
        include_llm_rewrite=body.include_llm_rewrite,
        run_competitor_grounding=body.run_competitor_grounding,
    )

    try:
        for event in run_pipeline(request):
            yield _pipeline_event_to_sse(event)
            if event.status == "error":
                return
    except Exception as e:
        yield _event("error", {"label": f"Pipeline error: {e}", "status": "error"})


@router.post("/analyze")
def analyze(body: AnalyzeRequestBody) -> StreamingResponse:
    """Stream AEO pipeline progress as SSE."""
    return StreamingResponse(
        _stream_pipeline(body),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/analyze/health")
def health() -> dict:
    import os
    return {
        "status": "ok",
        "openrouter": bool(os.environ.get("OPENROUTER_API_KEY")),
        "tavily": bool(os.environ.get("TAVILY_API_KEY")),
        "exa": bool(os.environ.get("EXA_API_KEY")),
        "groq": bool(os.environ.get("GROQ_API_KEY")),
        "jina": bool(os.environ.get("JINA_API_KEY")),
    }
