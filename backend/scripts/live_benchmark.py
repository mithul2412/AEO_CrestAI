"""
Run fixed live-site SOTA AEO benchmarks.

Usage:
  cd backend
  PYTHONPATH=. .venv/bin/python scripts/live_benchmark.py

This intentionally prints only scores and status summaries, never API keys.
"""
from __future__ import annotations

import argparse

from dotenv import load_dotenv

from pipeline.aeo_pipeline import AnalyzeRequest, run


SITES = [
    {
        "url": "https://www.gorgias.com",
        "page_type": "product",
        "category": "ecommerce customer support software",
        "target_customer": "ecommerce brands",
        "target_query": "best AI customer support software for Shopify brands",
        "competitors": ["Zendesk", "Intercom", "Freshdesk"],
    },
    {
        "url": "https://www.intercom.com/pricing",
        "page_type": "pricing",
        "category": "customer support software",
        "target_customer": "SaaS support teams",
        "target_query": "Intercom pricing for SaaS support teams",
        "competitors": ["Zendesk", "Gorgias", "Freshdesk"],
    },
    {
        "url": "https://zapier.com/app/home",
        "page_type": "landing",
        "category": "workflow automation software",
        "target_customer": "operations teams",
        "target_query": "best workflow automation software for operations teams",
        "competitors": ["Make", "Workato", "n8n"],
    },
    {
        "url": "https://www.notion.com/product",
        "page_type": "product",
        "category": "workspace productivity software",
        "target_customer": "knowledge teams",
        "target_query": "best workspace software for knowledge teams",
        "competitors": ["Coda", "Confluence", "ClickUp"],
    },
    {
        "url": "https://www.klaviyo.com/products/email-marketing/benchmarks-old",
        "page_type": "faq",
        "category": "email marketing benchmarks",
        "target_customer": "ecommerce marketers",
        "target_query": "email marketing benchmarks for ecommerce brands",
        "competitors": ["Mailchimp", "Omnisend", "Attentive"],
    },
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=len(SITES), help="Number of benchmark sites to run")
    parser.add_argument("--offset", type=int, default=0, help="Start index in the benchmark site list")
    parser.add_argument("--full", action="store_true", help="Also run legacy LLM scorecard and rewrite generation")
    args = parser.parse_args()

    load_dotenv(".env")
    for site in SITES[args.offset : args.offset + args.limit]:
        req = AnalyzeRequest(
            **site,
            run_legacy_llm_scorecard=args.full,
            include_llm_rewrite=args.full,
        )
        final = None
        print(f"\n=== {site['url']} ===", flush=True)
        for event in run(req):
            print(f"[{event.status}] step {event.step}/{event.total_steps}: {event.label}", flush=True)
            if "result" in event.data:
                final = event.data["result"]
        if not final:
            print("No final result.", flush=True)
            continue
        original = final.get("original_aeo", {})
        query_match = final.get("query_match") or {}
        citation = final.get("citation_intelligence", {}).get("citationReadiness", {})
        competitive_gap = final.get("competitive_gap") or {}
        prepublish = final.get("prepublish_evaluation") or {}
        rag = prepublish.get("ragSimulation", {})
        print(
            "Summary:",
            {
                "content": original.get("content_score"),
                "geu": original.get("geu_score"),
                "query_match": query_match.get("query_match_score"),
                "gap": final.get("gap_score"),
                "citation_readiness": citation.get("score"),
                "prepublish": prepublish.get("score"),
                "fanout": rag.get("fanoutCoverage"),
                "competitors": final.get("competitor_grounding", {}).get("pages_analyzed"),
                "competitive_gap": competitive_gap.get("competitorGapScore"),
                "gap_winner": competitive_gap.get("winner"),
                "fix": final.get("optimization_plan", {}).get("highest_impact_fix", {}).get("failureMode"),
            },
            flush=True,
        )


if __name__ == "__main__":
    main()
