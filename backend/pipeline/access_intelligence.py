"""Crawler access and extraction checks for AEO readiness."""
from __future__ import annotations

import json
import re
import urllib.robotparser
from dataclasses import dataclass
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from pipeline.content_signals import get_headings, get_words, normalize_markdown

ACCESS_TIMEOUT = 12.0
ROBOTS_TIMEOUT = 8.0
CRAWLERS = {
    "googlebot": "Googlebot",
    "oaiSearchBot": "OAI-SearchBot",
    "gptBot": "GPTBot",
    "perplexityBot": "PerplexityBot",
}


@dataclass
class FetchSnapshot:
    html: str
    access: dict[str, Any]
    source_signals: dict[str, Any]


def _compact_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _meta(soup: BeautifulSoup, name: str) -> str:
    node = soup.find("meta", attrs={"name": name}) or soup.find("meta", attrs={"property": name})
    return _compact_text(node.get("content") if node else "")


def _parse_robots_directives(value: str) -> dict[str, Any]:
    directives = [item.strip().lower() for item in str(value or "").split(",") if item.strip()]
    max_snippet = next((item for item in directives if item.startswith("max-snippet:")), None)
    return {
        "directives": directives,
        "noindex": "noindex" in directives,
        "nosnippet": "nosnippet" in directives,
        "maxSnippet": max_snippet,
    }


def evaluate_robots(robots_text: str, robots_url: str, target_url: str) -> dict[str, str]:
    parser = urllib.robotparser.RobotFileParser()
    parser.set_url(robots_url)
    parser.parse(robots_text.splitlines())
    results = {}
    for key, agent in CRAWLERS.items():
        try:
            results[key] = "allowed" if parser.can_fetch(agent, target_url) else "blocked"
        except Exception:
            results[key] = "unknown"
    return results


def _unknown_robots() -> dict[str, str]:
    return {key: "unknown" for key in CRAWLERS}


def _allowed_robots() -> dict[str, str]:
    return {key: "allowed" for key in CRAWLERS}


def _probe_text_file(client: httpx.Client, url: str) -> dict[str, Any]:
    try:
        resp = client.get(url, timeout=ROBOTS_TIMEOUT, headers={"Accept": "text/plain,*/*;q=0.8"})
        if resp.status_code == 200 and resp.text.strip():
            return {"present": True, "url": url, "status": resp.status_code}
        return {"present": False, "url": url, "status": resp.status_code}
    except Exception as exc:
        return {"present": False, "url": url, "error": str(exc)}


def crawl_page(url: str) -> FetchSnapshot:
    warnings: list[str] = []
    html = ""
    status_code: int | None = None
    final_url = url
    content_type = ""
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    with httpx.Client(timeout=ACCESS_TIMEOUT, follow_redirects=True) as client:
        try:
            resp = client.get(
                url,
                headers={
                    "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
                    "User-Agent": "Crest.ai AEO Intelligence (+https://crest.ai)",
                },
            )
            status_code = resp.status_code
            final_url = str(resp.url)
            content_type = resp.headers.get("content-type", "")
            html = resp.text
            if 300 <= resp.status_code < 400:
                warnings.append(f"The page returned redirect status {resp.status_code}.")
            elif resp.status_code in (401, 403):
                warnings.append("The page may be protected by login, WAF, or access controls.")
            elif resp.status_code >= 400:
                warnings.append(f"The page returned HTTP {resp.status_code}.")
            if not re.search(r"text/html|application/xhtml\+xml", content_type, re.IGNORECASE):
                warnings.append("The direct fetch did not identify the page as HTML.")
        except Exception as exc:
            warnings.append(f"The page HTML could not be fetched directly: {exc}.")

        robots_url = urljoin(origin, "/robots.txt")
        try:
            robots_resp = client.get(robots_url, timeout=ROBOTS_TIMEOUT, headers={"Accept": "text/plain,*/*"})
            if robots_resp.status_code == 404:
                warnings.append("robots.txt was not found; crawler access is assumed open.")
                robots = _allowed_robots()
            elif robots_resp.is_success:
                robots = evaluate_robots(robots_resp.text, robots_url, final_url)
            else:
                warnings.append(
                    f"robots.txt returned {robots_resp.status_code}; crawler access could not be fully verified."
                )
                robots = _unknown_robots()
        except Exception as exc:
            warnings.append(f"robots.txt could not be checked: {exc}.")
            robots = _unknown_robots()

        source_signals = {
            "llmsTxt": _probe_text_file(client, urljoin(origin, "/llms.txt")),
            "llmsFullTxt": _probe_text_file(client, urljoin(origin, "/llms-full.txt")),
        }

    blocked = [crawler for crawler, status in robots.items() if status == "blocked"]
    if blocked:
        warnings.append(f"robots.txt blocks {', '.join(blocked)}.")

    return FetchSnapshot(
        html=html,
        access={
            "statusCode": status_code,
            "finalUrl": final_url,
            "canonical": final_url,
            "indexable": None if status_code is None else 200 <= status_code < 400,
            "robots": robots,
            "warnings": warnings,
            "contentAccessibleViaReader": False,
        },
        source_signals=source_signals,
    )


def _collect_schema_types(soup: BeautifulSoup) -> list[str]:
    types: set[str] = set()
    for node in soup.select("[itemscope][itemtype]"):
        item_type = node.get("itemtype")
        if item_type:
            types.add(str(item_type).split("/").pop() or str(item_type))

    for node in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = node.string or node.get_text() or ""
        try:
            parsed = json.loads(raw)
        except Exception:
            types.add("Invalid JSON-LD")
            continue
        stack = parsed if isinstance(parsed, list) else [parsed]
        while stack:
            item = stack.pop(0)
            if not isinstance(item, dict):
                continue
            raw_type = item.get("@type")
            if raw_type:
                values = raw_type if isinstance(raw_type, list) else [raw_type]
                for value in values:
                    types.add(str(value))
            graph = item.get("@graph")
            if isinstance(graph, list):
                stack.extend(graph)
            main_entity = item.get("mainEntity")
            if isinstance(main_entity, list):
                stack.extend(main_entity)
            elif isinstance(main_entity, dict):
                stack.append(main_entity)
    return sorted(value for value in types if value)


def extract_page_intelligence(html: str, markdown: str, url: str = "") -> dict[str, Any]:
    soup = BeautifulSoup(html or "", "html.parser")
    normalized = normalize_markdown(markdown)
    title = _compact_text(soup.title.string if soup.title else "")
    meta_description = _meta(soup, "description")
    canonical_node = soup.find("link", attrs={"rel": "canonical"})
    canonical = str(canonical_node.get("href")) if canonical_node and canonical_node.get("href") else url
    h1_node = soup.find("h1")
    h1 = _compact_text(h1_node.get_text(" ") if h1_node else "")
    html_headings = [
        {"level": node.name, "text": _compact_text(node.get_text(" "))}
        for node in soup.find_all(["h1", "h2", "h3"])
        if _compact_text(node.get_text(" "))
    ]
    markdown_headings = [
        {
            "level": len(re.match(r"^#{1,6}", line).group(0)) if re.match(r"^#{1,6}", line) else 1,
            "text": re.sub(r"^#{1,6}\s+", "", line).strip(),
        }
        for line in get_headings(normalized)
    ]
    heading_details = html_headings or markdown_headings
    headings = [heading["text"] for heading in heading_details]
    body_text = _compact_text(soup.body.get_text(" ") if soup.body else "")
    schema_types = _collect_schema_types(soup)
    robots_meta = _parse_robots_directives(f"{_meta(soup, 'robots')},{_meta(soup, 'googlebot')}")
    word_count = len(get_words(normalized))
    html_word_count = len(get_words(body_text))
    table_count = len(soup.find_all("table"))
    faq_like_count = len(soup.select("details, [aria-expanded], .faq, [class*=faq], [id*=faq]"))
    warnings: list[str] = []

    if not h1:
        warnings.append("No H1 was found in the fetched HTML.")
    if word_count < 250:
        warnings.append("The AI-readable markdown is thin, which can limit citation context.")
    if len(headings) < 2:
        warnings.append("The extracted page has limited heading structure.")
    if not schema_types:
        warnings.append("No structured data schema was detected in the HTML.")
    if table_count > 0 and not re.search(r"\|.+\|", normalized):
        warnings.append("HTML tables are present, but table text may not be fully preserved.")
    if faq_like_count > 0 and normalized.count("?") < 2:
        warnings.append("FAQ or accordion-like content exists in HTML, but few questions appear in extracted text.")
    if html_word_count > 250 and word_count / max(html_word_count, 1) < 0.45:
        warnings.append("Less than half of the visible HTML body text appears in the AI-readable markdown.")
    if robots_meta["noindex"]:
        warnings.append("A robots meta noindex directive was found.")
    if robots_meta["nosnippet"]:
        warnings.append("A robots meta nosnippet directive was found.")
    if robots_meta["maxSnippet"]:
        warnings.append(f"A robots meta {robots_meta['maxSnippet']} directive was found.")

    return {
        "title": title,
        "metaDescription": meta_description,
        "h1": h1,
        "headings": headings,
        "headingDetails": heading_details,
        "canonical": canonical,
        "schemaTypes": schema_types,
        "wordCount": word_count,
        "htmlWordCount": html_word_count,
        "extractedWordCount": word_count,
        "tableCount": table_count,
        "faqLikeBlockCount": faq_like_count,
        "robotsMeta": robots_meta,
        "warnings": warnings,
    }


def build_draft_access(markdown: str) -> dict[str, Any]:
    return {
        "statusCode": None,
        "finalUrl": "",
        "canonical": "",
        "indexable": None,
        "robots": _unknown_robots(),
        "warnings": ["Draft content was analyzed without a live URL; crawler access was not checked."],
    }


def run(url: str, markdown: str) -> dict[str, Any]:
    if not url:
        return {
            "access": build_draft_access(markdown),
            "extraction": extract_page_intelligence("", markdown, ""),
            "source_signals": {
                "llmsTxt": {"present": False, "url": ""},
                "llmsFullTxt": {"present": False, "url": ""},
            },
        }
    try:
        snapshot = crawl_page(url)
    except Exception as exc:
        return {
            "access": {
                **build_draft_access(markdown),
                "finalUrl": url,
                "canonical": url,
                "warnings": [f"Access intelligence unavailable: {exc}."],
            },
            "extraction": extract_page_intelligence("", markdown, url),
            "source_signals": {
                "llmsTxt": {"present": False, "url": ""},
                "llmsFullTxt": {"present": False, "url": ""},
            },
        }
    access = {
        **snapshot.access,
        "contentAccessibleViaReader": len(markdown.split()) >= 80,
    }
    return {
        "access": access,
        "extraction": extract_page_intelligence(snapshot.html, markdown, url),
        "source_signals": snapshot.source_signals,
    }
