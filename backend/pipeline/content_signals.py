"""
Deterministic text signal helpers for the original AEO method.

These functions intentionally mirror the tested JavaScript implementation in
`/extracted`, with small Python-specific cleanups. They avoid model calls so
Content Score, GEU Score, retrieval, and optimization diagnostics stay stable.
"""
from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

SENTENCE_RE = re.compile(r"[^.!?\n]+[.!?]+")
BARE_URL_RE = re.compile(r"https?://[^\s)>\]]+", re.IGNORECASE)
MARKDOWN_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^)]+)\)", re.IGNORECASE)
ATTRIBUTION_RE = re.compile(
    r"\baccording to\s+([A-Z][A-Za-z0-9&,\- ]{2,80})",
    re.IGNORECASE,
)
SOURCE_NAME_RE = re.compile(
    r"\b([A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+){0,4})\s+"
    r"(Research|University|Institute|Report|Study|Survey|Data|Analytics|Lab|Labs|"
    r"Commission|Agency)\b"
)
NUMERIC_SIGNAL_RE = re.compile(
    r"\b\d+(?:\.\d+)?(?:%|x|k|m|b)?\b"
    r"|\b\d+(?:,\d{3})+\b"
    r"|\$\d+(?:,\d{3})*(?:\.\d+)?\b"
    r"|\b\d+\s*(?:million|billion|trillion|users|customers|companies|countries|"
    r"states|days|weeks|months|years|hours|minutes|seconds|GB|TB|MB|KB|Mbps|Gbps)\b",
    re.IGNORECASE,
)


def normalize_markdown(markdown: str | None) -> str:
    return str(markdown or "").replace("\r\n", "\n").replace("\t", " ").replace("\xa0", " ")


def get_lines(markdown: str | None) -> list[str]:
    return [line.strip() for line in normalize_markdown(markdown).split("\n") if line.strip()]


def get_words(markdown: str | None) -> list[str]:
    return [word.strip() for word in normalize_markdown(markdown).split() if word.strip()]


def get_paragraphs(markdown: str | None) -> list[str]:
    return [
        paragraph.strip()
        for paragraph in re.split(r"\n{2,}", normalize_markdown(markdown))
        if paragraph.strip()
    ]


def get_sentences(markdown: str | None) -> list[str]:
    text = re.sub(r"^#{1,6}\s+", "", normalize_markdown(markdown), flags=re.MULTILINE)
    return [
        re.sub(r"\s+", " ", match.group(0)).strip()
        for match in SENTENCE_RE.finditer(text)
        if len(match.group(0).strip()) >= 8
    ]


def get_headings(markdown: str | None) -> list[str]:
    return [line for line in get_lines(markdown) if re.match(r"^#{1,6}\s+", line)]


def get_bullet_lines(markdown: str | None) -> list[str]:
    return [line for line in get_lines(markdown) if re.match(r"^[-*+]\s+|^\d+\.\s+", line)]


def unique_matches(
    markdown: str | None,
    regex: re.Pattern[str],
    map_fn: Callable[[re.Match[str]], str | None] | None = None,
) -> list[str]:
    values: set[str] = set()
    for match in regex.finditer(normalize_markdown(markdown)):
        value = map_fn(match) if map_fn else match.group(0)
        if value:
            values.add(str(value).strip())
    return list(values)


def get_numeric_signals(markdown: str | None) -> list[str]:
    return unique_matches(markdown, NUMERIC_SIGNAL_RE)


def get_citation_signals(markdown: str | None) -> dict[str, Any]:
    urls = unique_matches(markdown, BARE_URL_RE, lambda m: m.group(0).lower())
    markdown_links = unique_matches(markdown, MARKDOWN_LINK_RE, lambda m: m.group(2).lower())
    attributions = unique_matches(markdown, ATTRIBUTION_RE, lambda m: m.group(1))
    source_names = unique_matches(markdown, SOURCE_NAME_RE, lambda m: f"{m.group(1)} {m.group(2)}")
    all_signals = set(urls + markdown_links + attributions + source_names)
    return {
        "urls": sorted(set(urls + markdown_links)),
        "attributions": sorted(attributions),
        "source_names": sorted(source_names),
        "total": len(all_signals),
    }


def get_lead_text(markdown: str | None, percent: float = 0.2, min_words: int = 80) -> str:
    words = get_words(markdown)
    lead_word_count = max(min_words, int(len(words) * percent))
    return " ".join(words[:lead_word_count])


def has_structured_data_signal(markdown: str | None) -> bool:
    return bool(
        re.search(
            r"schema\.org|application/ld\+json|[\"']@type[\"']|FAQPage|HowTo|Article|"
            r"BreadcrumbList|Organization",
            normalize_markdown(markdown),
            re.IGNORECASE,
        )
    )


def has_comparison_signal(markdown: str | None) -> bool:
    return bool(
        re.search(
            r"\bvs\.?\b|\bversus\b|\bcompared to\b|\bcompare\b|\balternative(?:s)?\b|"
            r"\bpros and cons\b|\bbetter than\b|\btrade[- ]?off\b|\|\s*[^|\n]+\s*\|",
            normalize_markdown(markdown),
            re.IGNORECASE,
        )
    )


def has_llms_txt_signal(markdown: str | None, source_signals: dict[str, Any] | None = None) -> bool:
    source_signals = source_signals or {}
    return bool(
        source_signals.get("llmsTxt", {}).get("present")
        or source_signals.get("llmsFullTxt", {}).get("present")
        or re.search(r"llms\.txt|llms-full\.txt", normalize_markdown(markdown), re.IGNORECASE)
    )


def get_average_sentence_length(markdown: str | None) -> float:
    sentences = get_sentences(markdown)
    if not sentences:
        return 0.0
    return sum(len(get_words(sentence)) for sentence in sentences) / len(sentences)


def has_answer_like_opening(markdown: str | None) -> bool:
    lead_text = get_lead_text(markdown, 0.18, 70)
    return bool(
        re.search(
            r"\b(is|are|means|refers to|defined as|provides|offers|helps|lets you|"
            r"enables|allows|works by|works through)\b",
            lead_text,
            re.IGNORECASE,
        )
    )


def has_named_source_near_fact(markdown: str | None) -> bool:
    citation_signals = get_citation_signals(markdown)
    if citation_signals["total"] >= 2:
        return True
    return bool(
        re.search(
            r"\b(?:according to|research from|data from|study by)\b.{0,80}\b\d+(?:\.\d+)?%",
            normalize_markdown(markdown),
            re.IGNORECASE | re.DOTALL,
        )
    )


def clamp_score(value: float | int | None) -> int:
    if value is None:
        return 0
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0
    return max(0, min(100, round(numeric)))
