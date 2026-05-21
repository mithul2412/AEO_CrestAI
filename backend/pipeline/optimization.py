"""Evidence-based AEO optimization plan generation."""
from __future__ import annotations

import json
from typing import Any


def _format_lift(value: int | float) -> str:
    rounded = round(value)
    return f"+{max(0, rounded)}"


def _page_name(page_intelligence: dict[str, Any]) -> str:
    extraction = page_intelligence.get("extraction", {})
    return extraction.get("h1") or extraction.get("title") or "this page"


def _clean_query(query: str) -> str:
    return (query or "the target query").strip().rstrip("?.!")


def _answer_copy(query: str, page_intelligence: dict[str, Any]) -> str:
    name = _page_name(page_intelligence)
    clean_query = _clean_query(query)
    return (
        f"{name} directly answers \"{clean_query}\" by stating the recommended answer first, "
        "then supporting it with specific evidence, examples, and source-backed details."
    )


def highest_impact_fix(
    *,
    query: str,
    citation_intelligence: dict[str, Any],
    page_intelligence: dict[str, Any],
    query_match_score: int | None = None,
    competitive_gap: dict[str, Any] | None = None,
    prepublish_evaluation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    subscores = citation_intelligence.get("citationReadiness", {}).get("subscores", {})
    access = page_intelligence.get("access", {})
    extraction = page_intelligence.get("extraction", {})
    retrieval = citation_intelligence.get("retrieval", {})
    answer = citation_intelligence.get("answerExtraction", {})
    prepublish_evaluation = prepublish_evaluation or {}

    if competitive_gap and competitive_gap.get("status") == "ok" and competitive_gap.get("winner") == "competitor":
        user_top = competitive_gap.get("userTopChunk") or {}
        competitor = competitive_gap.get("winningCompetitor") or {}
        missing = competitive_gap.get("missingAttributes") or []
        failure_mode = competitive_gap.get("failureMode") or "Competitor Structure Advantage"
        if "direct answer" in missing:
            fix = "Rewrite the top chunk so the first sentence directly answers the target query."
        elif "stronger evidence" in missing:
            fix = "Add named sources, dated proof, or specific statistics to the top answer block."
        elif "answer appears earlier" in missing:
            fix = "Move the strongest answer block above competing explanatory content."
        elif "more specific entities and numbers" in missing:
            fix = "Add specific entities, numbers, examples, and buying criteria that match the query."
        elif "self-contained answer" in missing:
            fix = "Make the top answer self-contained so it can be quoted without surrounding context."
        else:
            fix = "Match the competitor's answer clarity with a tighter answer-first section."
        return {
            "failureMode": failure_mode,
            "fix": fix,
            "whereToEdit": f"Section: {user_top.get('section', 'top retrieved chunk')}",
            "why": competitive_gap.get("whyCompetitorWon")
            or "A discovered competitor has a stronger citation-ready answer path for this query.",
            "exampleCopy": _answer_copy(query, page_intelligence),
            "expectedLift": {
                "retrievalScore": "+8",
                "answerScore": "+10",
                "competitorGapScore": _format_lift(100 - (competitive_gap.get("competitorGapScore") or 0)),
            },
            "confidence": "medium-high",
            "competitiveReference": {
                "title": competitor.get("title", ""),
                "url": competitor.get("url", ""),
                "missingAttributes": missing,
            },
        }

    if subscores.get("accessScore", 100) < 70:
        return {
            "failureMode": "Access Failure",
            "fix": "Remove crawler and indexability blockers before rewriting the page.",
            "whereToEdit": "robots.txt, page robots meta tags, WAF rules, or page access controls.",
            "why": "AI citation systems cannot evaluate or cite content they cannot reach or index.",
            "exampleCopy": (access.get("warnings") or ["Allow AI-search crawlers for discoverable pages."])[0],
            "expectedLift": {
                "retrievalScore": "+0",
                "answerScore": "+0",
                "accessScore": _format_lift(100 - subscores.get("accessScore", 0)),
            },
            "confidence": "high",
        }

    if subscores.get("extractionScore", 100) < 70:
        return {
            "failureMode": "Extraction Failure",
            "fix": "Make the core answer content visible as crawlable HTML text.",
            "whereToEdit": "The H1, opening paragraph, and any accordion/table content missing from extracted text.",
            "why": "The page may look complete to humans while key content is missing or weak in AI-readable extraction.",
            "exampleCopy": f"Add a crawlable H1 and short paragraph that names {_page_name(page_intelligence)} and the main answer clearly.",
            "expectedLift": {
                "retrievalScore": "+8",
                "answerScore": "+10",
                "extractionScore": _format_lift(100 - subscores.get("extractionScore", 0)),
            },
            "confidence": "medium-high",
        }

    if retrieval.get("retrieval_score", 0) < 65 and (query_match_score or 0) >= 75:
        top = (retrieval.get("top_chunks") or [{}])[0]
        return {
            "failureMode": "Front-Loading Opportunity",
            "fix": "Keep the existing answer, but move the clearest query-matched paragraph higher and label it with an answer-shaped heading.",
            "whereToEdit": f"Section: {top.get('section', 'top retrieved chunk')}",
            "why": "Model judgment says the page answers the query, but retrieval simulation says the best answer is not easy enough to retrieve early.",
            "exampleCopy": _answer_copy(query, page_intelligence),
            "expectedLift": {"retrievalScore": "+10", "answerScore": "+6"},
            "confidence": "medium-high",
        }

    if retrieval.get("retrieval_score", 0) < 65:
        return {
            "failureMode": "Retrieval Failure",
            "fix": "Add a query-matched answer block near the top of the page.",
            "whereToEdit": "Immediately after the H1 or first intro paragraph.",
            "why": retrieval.get("diagnosis") or "The best chunk does not strongly match the target query.",
            "exampleCopy": _answer_copy(query, page_intelligence),
            "expectedLift": {"retrievalScore": "+14", "answerScore": "+10"},
            "confidence": "medium-high",
        }

    if answer.get("answer_score", 0) < 70:
        top = (retrieval.get("top_chunks") or [{}])[0]
        return {
            "failureMode": "Answer Failure",
            "fix": "Rewrite the top retrieved chunk so its first sentence is a standalone answer.",
            "whereToEdit": f"Section: {top.get('section', 'top retrieved chunk')}",
            "why": answer.get("diagnosis") or "The chunk is relevant but hard to quote cleanly.",
            "exampleCopy": _answer_copy(query, page_intelligence),
            "expectedLift": {"retrievalScore": "+6", "answerScore": "+18"},
            "confidence": "medium-high",
        }

    rag = prepublish_evaluation.get("ragSimulation", {})
    if rag.get("fanoutCoverage", 100) < 70:
        weak = rag.get("weakQueries", [])
        return {
            "failureMode": "Query Fan-Out Failure",
            "fix": "Add answer-first sections for the important query variants this page currently misses.",
            "whereToEdit": "Create or rewrite FAQ, comparison, pricing, and buying-criteria sections based on the weak query list.",
            "why": f"Only {rag.get('fanoutCoverage', 0)}% of benchmark queries have strong retrieval and answer scores.",
            "exampleCopy": _answer_copy((weak[0].get("query") if weak else query), page_intelligence),
            "expectedLift": {
                "retrievalScore": "+10",
                "answerScore": "+10",
                "fanoutCoverage": _format_lift(80 - rag.get("fanoutCoverage", 0)),
            },
            "confidence": "medium-high",
            "weakQueries": [item.get("query", "") for item in weak[:5]],
        }

    if subscores.get("evidenceScore", 0) < 55:
        return {
            "failureMode": "Evidence Failure",
            "fix": "Add one statistic, dated proof point, or named source to the top answer block.",
            "whereToEdit": "Within the first 200 words and inside the top retrieved chunk.",
            "why": "The page answers the query, but citation confidence is limited by weak proof.",
            "exampleCopy": "Based on [source or internal dataset], [customer type] saw [specific number] improvement in [outcome] in [year].",
            "expectedLift": {
                "retrievalScore": "+4",
                "answerScore": "+8",
                "evidenceScore": _format_lift(70 - subscores.get("evidenceScore", 0)),
            },
            "confidence": "medium",
        }

    top = (retrieval.get("top_chunks") or [{}])[0]
    return {
        "failureMode": "Structure Opportunity",
        "fix": "Turn the strongest answer into a compact FAQ or comparison block.",
        "whereToEdit": f"Section: {top.get('section', 'top answer area')}",
        "why": "The page is mostly ready; clearer structure can make the answer easier to reuse.",
        "exampleCopy": _answer_copy(query, page_intelligence),
        "expectedLift": {"retrievalScore": "+5", "answerScore": "+6"},
        "confidence": "medium",
    }


def _faq_questions(target_query: str, benchmark_queries: list[dict[str, Any]], competitor_grounding: dict[str, Any]) -> list[str]:
    questions = []
    if target_query:
        questions.append(target_query.rstrip("?") + "?")
    for item in benchmark_queries:
        q = item.get("query", "")
        if q and q not in questions:
            questions.append(q.rstrip("?") + "?")
    for page in competitor_grounding.get("pages", []):
        for q in page.get("faq_questions", [])[:3]:
            if q and q not in questions:
                questions.append(str(q).rstrip("?") + "?")
    return questions[:8]


def _schema_jsonld(page_name: str, url: str, faqs: list[dict[str, str]]) -> str:
    graph: list[dict[str, Any]] = [
        {
            "@type": "WebPage",
            "name": page_name,
            "url": url or "[PAGE URL]",
            "description": "[Add a one-sentence answer-focused meta description]",
        }
    ]
    if faqs:
        graph.append(
            {
                "@type": "FAQPage",
                "mainEntity": [
                    {
                        "@type": "Question",
                        "name": item["question"],
                        "acceptedAnswer": {"@type": "Answer", "text": item["answer"]},
                    }
                    for item in faqs[:6]
                ],
            }
        )
    return json.dumps({"@context": "https://schema.org", "@graph": graph}, indent=2)


def run(
    *,
    target_query: str,
    benchmark_queries: list[dict[str, Any]],
    citation_intelligence: dict[str, Any],
    page_intelligence: dict[str, Any],
    competitor_grounding: dict[str, Any],
    url: str,
    category: str,
    query_match: dict[str, Any] | None = None,
    competitive_gap: dict[str, Any] | None = None,
    prepublish_evaluation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    query = target_query or (benchmark_queries[0].get("query", "") if benchmark_queries else category)
    fix = highest_impact_fix(
        query=query,
        citation_intelligence=citation_intelligence,
        page_intelligence=page_intelligence,
        query_match_score=(query_match or {}).get("query_match_score"),
        competitive_gap=competitive_gap,
        prepublish_evaluation=prepublish_evaluation,
    )
    page_name = _page_name(page_intelligence)
    answer_first_block = {
        "where": "Immediately after the H1",
        "copy": _answer_copy(query, page_intelligence),
        "why": "This creates an early, self-contained answer chunk for retrieval and citation.",
    }
    faqs = [
        {
            "question": question,
            "answer": (
                f"{page_name} should answer this directly with a one-sentence answer, "
                "then add one concrete proof point, customer example, or source-backed statistic."
            ),
        }
        for question in _faq_questions(target_query, benchmark_queries, competitor_grounding)
    ]
    return {
        "highest_impact_fix": fix,
        "research_backed_priorities": (prepublish_evaluation or {}).get("priorityActions", []),
        "query_portfolio": (prepublish_evaluation or {}).get("ragSimulation", {}),
        "geo_method_coverage": (prepublish_evaluation or {}).get("geoMethodCoverage", {}),
        "answer_first_block": answer_first_block,
        "faq_block": faqs,
        "citation_stat_placeholders": [
            {
                "type": "stat",
                "template": "In [YEAR], [CUSTOMER SEGMENT] improved [METRIC] by [NUMBER]% after using [PRODUCT].",
                "instruction": "Use verified customer, analytics, or benchmark data only.",
            },
            {
                "type": "source",
                "template": "According to [NAMED SOURCE], [CATEGORY PROBLEM] affects [NUMBER]% of [AUDIENCE].",
                "instruction": "Link to a credible, current source and keep the claim narrow.",
            },
            {
                "type": "quote",
                "template": "\"[CUSTOMER QUOTE WITH OUTCOME],\" said [NAME], [TITLE] at [COMPANY].",
                "instruction": "Use attributable quotes; never fabricate names or metrics.",
            },
        ],
        "schema_jsonld": _schema_jsonld(page_name, url, faqs),
        "llms_txt_starter": (
            f"# {page_name}\n\n"
            f"> AEO-optimized summary for AI answer engines.\n\n"
            f"URL: {url or '[PAGE URL]'}\n"
            f"Category: {category or '[CATEGORY]'}\n"
            f"Primary answer: {_answer_copy(query, page_intelligence)}\n\n"
            "Key sections:\n"
            "- Overview\n- Pricing or buying criteria\n- Comparison\n- FAQ\n- Evidence and sources\n"
        ),
    }
