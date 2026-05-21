"""
OpenRouter client — 100% free models for prototyping.

Model tiers (all free on OpenRouter):
  qwen      — qwen/qwen3-coder:free            (262K ctx, strong at structured extraction)
  nemotron  — nvidia/nemotron-3-super-120b-a12b:free  (262K ctx, strong reasoning)
  rewrite   — openai/gpt-oss-120b:free         (131K ctx, strong generation)
  fallback  — openai/gpt-oss-120b:free         (131K ctx, reliable all-rounder)
"""
from __future__ import annotations

import json
import os
from typing import Any

import httpx

_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
_TIMEOUT = 90.0
_SITE = "https://crest-ai.app"
_TITLE = "Crest AI"

_DEFAULT_MODELS = {
    "qwen": "qwen/qwen3-coder:free",
    "nemotron": "nvidia/nemotron-3-super-120b-a12b:free",
    "rewrite": "openai/gpt-oss-120b:free",
    "fallback": "openai/gpt-oss-120b:free",
}
_ENV_KEYS = {
    "qwen": "QWEN_MODEL",
    "nemotron": "NEMOTRON_MODEL",
    "rewrite": "REWRITE_MODEL",
    "fallback": "FALLBACK_MODEL",
}


def _get_model(tier: str) -> str:
    return os.environ.get(_ENV_KEYS.get(tier, ""), _DEFAULT_MODELS.get(tier, _DEFAULT_MODELS["fallback"]))


def _parse_response(content: str, json_mode: bool) -> dict[str, Any] | str:
    if not json_mode:
        return content
    text = content.strip()

    # Strip thinking blocks (Nemotron outputs <think>...</think> before JSON)
    import re as _re
    text = _re.sub(r"<think>.*?</think>", "", text, flags=_re.DOTALL).strip()

    # Strip markdown code fences
    if text.startswith("```"):
        lines = text.split("\n")
        inner = lines[1:] if len(lines) > 1 else lines
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        text = "\n".join(inner).strip()

    try:
        return json.loads(text)
    except Exception:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
        raise


def call(
    system: str,
    user: str,
    tier: str = "qwen",
    *,
    json_mode: bool = True,
    max_tokens: int = 2000,
    temperature: float = 0.2,
    model: str | None = None,
) -> dict[str, Any] | str | None:
    """
    Call OpenRouter. Returns parsed dict if json_mode=True, raw string otherwise.
    Tries the requested tier first, falls back to 'fallback' model on failure.
    Returns None on total failure — callers degrade gracefully.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key:
        return None

    models_to_try = [model or _get_model(tier)]
    if tier not in ("fallback",):
        fallback = _get_model("fallback")
        if fallback not in models_to_try:
            models_to_try.append(fallback)

    payload: dict[str, Any] = {
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    # Only add response_format for models that support it reliably
    if json_mode and tier in ("nemotron", "rewrite", "fallback"):
        payload["response_format"] = {"type": "json_object"}

    headers = {
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": _SITE,
        "X-Title": _TITLE,
    }

    for m in models_to_try:
        try:
            with httpx.Client(timeout=_TIMEOUT) as client:
                resp = client.post(
                    _ENDPOINT,
                    headers=headers,
                    json={**payload, "model": m},
                )
                resp.raise_for_status()
                content = resp.json()["choices"][0]["message"]["content"]
                return _parse_response(content, json_mode)
        except Exception:
            continue

    return None
