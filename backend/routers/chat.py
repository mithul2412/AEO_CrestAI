"""OpenRouter-powered rewrite help endpoint."""
from __future__ import annotations

import concurrent.futures
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from providers.openrouter import call

router = APIRouter()


class ChatMessage(BaseModel):
    role: str = "user"
    content: str = ""


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    markdown: str = ""


def _truncate(text: str, limit: int) -> str:
    value = str(text or "")
    if len(value) <= limit:
        return value
    return value[:limit] + "\n\n[truncated]"


def _transcript(messages: list[ChatMessage]) -> str:
    lines = []
    for message in messages[-10:]:
        role = "Assistant" if message.role == "assistant" else "User"
        content = _truncate(message.content, 1800)
        if content:
            lines.append(f"{role}: {content}")
    return "\n\n".join(lines)


def _call_model(model_label: str, tier: str, system: str, user: str) -> dict[str, str]:
    response = call(
        system,
        user,
        tier=tier,
        json_mode=False,
        max_tokens=1200,
        temperature=0.45,
    )
    if not isinstance(response, str) or not response.strip():
        raise RuntimeError(f"{model_label} returned no response")
    return {"model": model_label, "response": response.strip()}


@router.post("/chat")
def chat(body: ChatRequest):
    if not body.messages:
        return JSONResponse({"error": "messages array required"}, status_code=400)

    system = (
        "You are a senior AEO pre-publish optimization assistant. Give concrete, "
        "evidence-based changes that improve answer-engine retrieval, direct-answer "
        "clarity, citation readiness, and competitive answer strength. Never invent "
        "statistics or sources."
    )
    user = (
        "PAGE CONTEXT:\n"
        f"{_truncate(body.markdown, 4200)}\n\n"
        "CHAT HISTORY:\n"
        f"{_transcript(body.messages)}"
    )
    requests = [
        ("Qwen", "qwen"),
        ("Nemotron", "nemotron"),
        ("GPT-OSS", "rewrite"),
    ]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        futures = {
            ex.submit(_call_model, label, tier, system, user): label
            for label, tier in requests
        }
        settled: list[dict[str, Any]] = []
        for future in concurrent.futures.as_completed(futures):
            try:
                settled.append(future.result())
            except Exception as exc:
                settled.append({"model": futures[future], "error": str(exc)})

    responses = [item for item in settled if item.get("response")]
    if not responses:
        errors = "; ".join(item.get("error", "") for item in settled if item.get("error"))
        return JSONResponse({"error": errors or "All models failed"}, status_code=502)
    return {"responses": responses, "modelStatus": settled}
