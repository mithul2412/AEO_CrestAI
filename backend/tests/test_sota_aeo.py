from __future__ import annotations

import json
import os
import unittest
from unittest.mock import patch

from pipeline.access_intelligence import evaluate_robots, extract_page_intelligence
from pipeline import citation_intelligence, competitive_gap, optimization, prepublish_evaluation
from pipeline.competitor_grounding import _annotated_chunks
from pipeline.original_aeo import (
    CONTENT_CHECKS,
    GEU_CHECKS,
    compute_content_score,
    compute_geu_score,
    compute_original_aeo,
)
from pipeline.retrieval import analyze_retrieval, benchmark_retrieval, chunk_markdown, score_answer_extraction


RICH_MARKDOWN = """# Sales Enablement Platform

Sales Enablement Platform is software that helps mid-market SaaS teams onboard reps,
centralize content, and improve sales execution. According to Example Research, teams
reduced ramp time by 43% in 2025.
See https://example.com/research and https://example.com/report for methodology.

## Best sales enablement platform for mid-market SaaS?

The best sales enablement platform for mid-market SaaS teams gives reps searchable
playbooks, onboarding paths, buyer content, and analytics in one workspace.
It helps revenue leaders reduce ramp time and compare content performance across teams.

## Pricing and implementation

- Setup time: 30 days
- Best for: mid-market SaaS
- Proof: based on 200 customer accounts

## FAQ

### What is a sales enablement platform?
A sales enablement platform is a system for training reps and organizing sales content.

### How long does implementation take?
Implementation usually takes 30 days for mid-market SaaS teams.

### What should teams compare?
Teams should compare onboarding, analytics, content governance, and integrations.

AEO vs SEO: AEO is optimized for answer engines.
This page uses schema.org/Article and mentions llms.txt.
"""


class AeoScoringTests(unittest.TestCase):
    def test_weights_sum_to_100(self) -> None:
        self.assertEqual(sum(check["weight"] for check in CONTENT_CHECKS), 100)
        self.assertEqual(sum(check["weight"] for check in GEU_CHECKS), 100)

    def test_scores_are_bounded_and_deterministic(self) -> None:
        first = compute_original_aeo(RICH_MARKDOWN)
        second = compute_original_aeo(RICH_MARKDOWN)
        self.assertEqual(first, second)
        self.assertGreaterEqual(first["content_score"], 0)
        self.assertLessEqual(first["content_score"], 100)
        self.assertGreaterEqual(first["geu_score"], 0)
        self.assertLessEqual(first["geu_score"], 100)

    def test_individual_original_signals(self) -> None:
        content = compute_content_score(RICH_MARKDOWN)
        checks = {check["id"]: check["passed"] for check in content["checks"]}
        self.assertTrue(checks["faq"])
        self.assertTrue(checks["stats"])
        self.assertTrue(checks["citations"])
        self.assertTrue(checks["schema"])
        self.assertTrue(checks["comparison"])
        self.assertTrue(checks["llmstxt"])

    def test_geu_edge_cases(self) -> None:
        coherent = compute_geu_score("# AEO Guide\nAEO stands for Answer Engine Optimization.")
        pronoun = compute_geu_score("This is a system. More content here.")
        self.assertTrue(next(check for check in coherent["checks"] if check["id"] == "coherent")["passed"])
        self.assertFalse(next(check for check in pronoun["checks"] if check["id"] == "coherent")["passed"])


class RetrievalAndExtractionTests(unittest.TestCase):
    def test_retrieval_ranks_query_matched_chunk(self) -> None:
        chunks = chunk_markdown(RICH_MARKDOWN)
        retrieval = analyze_retrieval(chunks, "best sales enablement platform for mid-market SaaS")
        answer = score_answer_extraction(retrieval["top_chunks"][0])
        self.assertGreater(retrieval["retrieval_score"], 50)
        self.assertEqual(retrieval["method"], "lexical_fallback")
        self.assertRegex(retrieval["top_chunks"][0]["section"], "Sales|sales")
        self.assertTrue(retrieval["top_chunks"][0]["direct_answer"])
        self.assertGreater(answer["answer_score"], 50)

    def test_embedding_rerank_path_enriches_retrieval(self) -> None:
        chunks = chunk_markdown(RICH_MARKDOWN)
        query_vector = [1.0, 0.0, 0.0]
        passage_vectors = [[1.0, 0.0, 0.0] for _ in chunks]
        with patch(
            "pipeline.retrieval.jina_provider.embed_texts",
            side_effect=[[query_vector], passage_vectors],
        ):
            with patch(
                "pipeline.retrieval.jina_provider.rerank_documents",
                return_value=[{"index": 0, "relevance_score": 0.95}],
            ):
                retrieval = analyze_retrieval(
                    chunks,
                    "best sales enablement platform for mid-market SaaS",
                    use_external=True,
                )

        self.assertEqual(retrieval["method"], "hybrid_embedding_rerank")
        self.assertTrue(retrieval["used_embeddings"])
        self.assertTrue(retrieval["used_reranker"])
        self.assertIsNotNone(retrieval["top_chunks"][0]["embedding_similarity"])
        self.assertIsNotNone(retrieval["top_chunks"][0]["rerank_score"])

    def test_benchmark_retrieval_returns_rag_fields(self) -> None:
        results = benchmark_retrieval(
            RICH_MARKDOWN,
            [{"text": "best sales enablement platform for mid-market SaaS", "intent": "target"}],
        )
        self.assertEqual(len(results), 1)
        self.assertIn("direct_answer", results[0])
        self.assertIn("top_chunk_position", results[0])
        self.assertIn("evidence_score", results[0])

    def test_access_extraction_reads_metadata_schema_and_robots(self) -> None:
        robots = evaluate_robots(
            robots_url="https://example.com/robots.txt",
            target_url="https://example.com/page",
            robots_text="""User-agent: OAI-SearchBot
Disallow: /

User-agent: GPTBot
Allow: /

User-agent: *
Allow: /""",
        )
        self.assertEqual(robots["oaiSearchBot"], "blocked")
        self.assertEqual(robots["gptBot"], "allowed")

        html = """<!doctype html><html><head>
        <title>Best Sales Enablement Platform</title>
        <meta name="description" content="Sales enablement comparison">
        <meta name="robots" content="noindex,max-snippet:120">
        <link rel="canonical" href="https://example.com/sales">
        <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question"}]}</script>
        </head><body><h1>Sales Enablement for Modern Teams</h1><h2>How it works</h2><table><tr><td>Pricing</td></tr></table></body></html>"""
        extraction = extract_page_intelligence(html, "# Sales Enablement\n\nReadable text.", "https://example.com/sales")
        self.assertEqual(extraction["title"], "Best Sales Enablement Platform")
        self.assertEqual(extraction["h1"], "Sales Enablement for Modern Teams")
        self.assertIn("FAQPage", extraction["schemaTypes"])
        self.assertTrue(extraction["robotsMeta"]["noindex"])
        self.assertRegex(" ".join(extraction["warnings"]), "noindex|table")


class CompetitiveGapTests(unittest.TestCase):
    def test_competitor_corpus_chunks_are_annotated(self) -> None:
        page = {
            "source_id": "competitor-1",
            "url": "https://competitor.com/best-sales-enablement",
            "title": "Best Sales Enablement",
        }
        chunks = _annotated_chunks(RICH_MARKDOWN, page)
        self.assertGreaterEqual(len(chunks), 1)
        self.assertTrue(chunks[0]["chunk_id"].startswith("competitor-1-"))
        self.assertEqual(chunks[0]["source_url"], page["url"])
        self.assertEqual(chunks[0]["source_type"], "competitor")

    def test_competitive_gap_classifies_competitor_advantage(self) -> None:
        weak_user = [{
            "chunk_id": "c1",
            "section": "Opening",
            "position": 0.7,
            "text": "This platform is powerful and flexible for teams.",
            "word_count": 20,
        }]
        competitor = {
            "source_id": "competitor-1",
            "title": "Competitor Guide",
            "url": "https://competitor.com/guide",
            "chunks": [{
                "chunk_id": "competitor-1-c1",
                "section": "Best sales enablement platform for mid-market SaaS",
                "position": 0.05,
                "text": (
                    "The best sales enablement platform for mid-market SaaS teams is a system "
                    "that gives reps searchable playbooks, onboarding paths, buyer content, "
                    "and analytics in one workspace. According to Example Research, teams "
                    "reduced ramp time by 43% in 2025."
                ),
                "word_count": 40,
                "source_id": "competitor-1",
            }],
        }
        result = competitive_gap.compare_user_vs_competitors(
            query="best sales enablement platform for mid-market SaaS",
            user_chunks=weak_user,
            competitor_pages=[competitor],
            use_external=False,
        )
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["winner"], "competitor")
        self.assertIn(result["failureMode"], {"Answer Failure", "Evidence Failure", "Retrieval Failure", "Specificity Failure", "Structure Failure", "Competitor Structure Advantage"})
        self.assertLess(result["competitorGapScore"], 100)
        self.assertEqual(result["winningCompetitor"]["url"], competitor["url"])

    def test_citation_readiness_weights_competitive_gap(self) -> None:
        page_intelligence = {
            "access": {"statusCode": 200, "indexable": True, "robots": {}, "warnings": [], "contentAccessibleViaReader": True},
            "extraction": {"title": "Sales", "h1": "Sales", "headings": ["Sales", "FAQ"], "wordCount": 500, "schemaTypes": ["FAQPage"], "warnings": []},
        }
        base = citation_intelligence.build_query_intelligence(
            RICH_MARKDOWN,
            "best sales enablement platform for mid-market SaaS",
            page_intelligence,
        )
        updated = citation_intelligence.apply_competitive_gap(
            base,
            {"status": "ok", "winner": "competitor", "failureMode": "Evidence Failure", "competitorGapScore": 40},
        )
        self.assertNotEqual(base["citationReadiness"]["score"], updated["citationReadiness"]["score"])
        self.assertEqual(updated["citationReadiness"]["subscores"]["competitorGapScore"], 40)
        self.assertIn("competitor", updated["citationReadiness"]["summary"].lower())

    def test_optimization_uses_competitive_gap_first(self) -> None:
        citation_result = {
            "citationReadiness": {"subscores": {"accessScore": 100, "extractionScore": 100}},
            "retrieval": {"retrieval_score": 90, "top_chunks": [{"section": "Opening"}]},
            "answerExtraction": {"answer_score": 90},
        }
        page_intelligence = {
            "extraction": {"h1": "Sales Enablement Platform", "title": "Sales Enablement Platform"},
            "access": {},
        }
        fix = optimization.highest_impact_fix(
            query="best sales enablement platform",
            citation_intelligence=citation_result,
            page_intelligence=page_intelligence,
            competitive_gap={
                "status": "ok",
                "winner": "competitor",
                "failureMode": "Evidence Failure",
                "missingAttributes": ["stronger evidence"],
                "competitorGapScore": 52,
                "userTopChunk": {"section": "Opening"},
                "winningCompetitor": {"title": "Competitor", "url": "https://competitor.com"},
                "whyCompetitorWon": "The competitor has stronger evidence.",
            },
        )
        self.assertEqual(fix["failureMode"], "Evidence Failure")
        self.assertIn("sources", fix["fix"].lower())

    def test_prepublish_evaluation_adds_research_backed_priorities(self) -> None:
        page_intelligence = {
            "access": {
                "statusCode": 200,
                "indexable": True,
                "robots": {"googlebot": "allowed", "gptBot": "allowed"},
                "warnings": [],
                "contentAccessibleViaReader": True,
            },
            "extraction": {
                "title": "Sales",
                "h1": "Sales",
                "headings": ["Sales", "FAQ"],
                "wordCount": 500,
                "schemaTypes": ["FAQPage"],
                "robotsMeta": {},
                "warnings": [],
            },
        }
        citation_result = citation_intelligence.build_query_intelligence(
            RICH_MARKDOWN,
            "best sales enablement platform for mid-market SaaS",
            page_intelligence,
        )
        benchmark = benchmark_retrieval(
            RICH_MARKDOWN,
            [
                {"text": "best sales enablement platform for mid-market SaaS", "intent": "target"},
                {"text": "sales enablement implementation timeline", "intent": "implementation"},
            ],
        )
        evaluation = prepublish_evaluation.evaluate(
            markdown=RICH_MARKDOWN,
            page_intelligence=page_intelligence,
            benchmark_queries=benchmark,
            citation_intelligence=citation_result,
            competitor_grounding={"pages": []},
            competitive_gap=None,
        )
        self.assertIn("ragSimulation", evaluation)
        self.assertIn("geoMethodCoverage", evaluation)
        self.assertIn("aiFeatureEligibility", evaluation)
        self.assertGreaterEqual(evaluation["score"], 0)
        self.assertLessEqual(evaluation["score"], 100)

    def test_optimization_can_prioritize_query_fanout(self) -> None:
        citation_result = {
            "citationReadiness": {"subscores": {"accessScore": 100, "extractionScore": 100, "evidenceScore": 90}},
            "retrieval": {"retrieval_score": 90, "top_chunks": [{"section": "Opening"}]},
            "answerExtraction": {"answer_score": 90},
        }
        page_intelligence = {
            "extraction": {"h1": "Sales Enablement Platform", "title": "Sales Enablement Platform"},
            "access": {},
        }
        fix = optimization.highest_impact_fix(
            query="best sales enablement platform",
            citation_intelligence=citation_result,
            page_intelligence=page_intelligence,
            prepublish_evaluation={
                "ragSimulation": {
                    "fanoutCoverage": 40,
                    "weakQueries": [{"query": "sales enablement pricing", "diagnosis": "weak"}],
                }
            },
        )
        self.assertEqual(fix["failureMode"], "Query Fan-Out Failure")
        self.assertIn("weakQueries", fix)


class FakeResponse:
    def __init__(self, payload=None, text="", status_code=200):
        self._payload = payload or {}
        self.text = text
        self.status_code = status_code
        self.headers = {"content-type": "text/plain"}
        self.url = "https://example.com/final"

    @property
    def is_success(self):
        return 200 <= self.status_code < 300

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class FakeClient:
    def __init__(self, response):
        self.response = response

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def get(self, *_, **__):
        return self.response

    def post(self, *_, **__):
        return self.response


class ProviderIntegrationTests(unittest.TestCase):
    def test_openrouter_provider_parses_json(self) -> None:
        from providers import openrouter

        payload = {"choices": [{"message": {"content": json.dumps({"ok": True, "score": 88})}}]}
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "test"}, clear=False):
            with patch("providers.openrouter.httpx.Client", return_value=FakeClient(FakeResponse(payload=payload))):
                result = openrouter.call("system", "user", tier="fallback")
        self.assertEqual(result, {"ok": True, "score": 88})

    def test_jina_provider_fetches_reader_text(self) -> None:
        from providers import jina

        text = "Readable content. " * 30
        with patch("providers.jina.httpx.Client", return_value=FakeClient(FakeResponse(text=text))):
            result = jina.fetch_markdown("https://example.com")
        self.assertGreater(len(result), 200)

    def test_jina_provider_embeds_texts(self) -> None:
        from providers import jina

        payload = {
            "data": [
                {"index": 1, "embedding": [0.8, 0.2]},
                {"index": 0, "embedding": [1.0, 0.0]},
            ]
        }
        with patch.dict(os.environ, {"JINA_API_KEY": "test"}, clear=False):
            with patch("providers.jina.httpx.Client", return_value=FakeClient(FakeResponse(payload=payload))):
                vectors = jina.embed_texts(["query", "passage"], task="text-matching", dimensions=128)
        self.assertEqual(vectors, [[1.0, 0.0], [0.8, 0.2]])

    def test_jina_provider_reranks_documents(self) -> None:
        from providers import jina

        payload = {"results": [{"index": 1, "relevance_score": 0.91}, {"index": 0, "score": 0.3}]}
        with patch.dict(os.environ, {"JINA_API_KEY": "test"}, clear=False):
            with patch("providers.jina.httpx.Client", return_value=FakeClient(FakeResponse(payload=payload))):
                results = jina.rerank_documents("query", ["doc a", "doc b"])
        self.assertEqual(results[0], {"index": 1, "relevance_score": 0.91})
        self.assertEqual(results[1], {"index": 0, "relevance_score": 0.3})

    def test_tavily_provider_normalizes_results(self) -> None:
        from providers import tavily

        payload = {
            "results": [
                {
                    "title": "Result",
                    "url": "https://competitor.com",
                    "content": "Snippet",
                    "score": 0.9,
                }
            ]
        }
        with patch.dict(os.environ, {"TAVILY_API_KEY": "test"}, clear=False):
            with patch("providers.tavily.httpx.Client", return_value=FakeClient(FakeResponse(payload=payload))):
                results = tavily.search("best software")
        self.assertEqual(results[0]["source"], "tavily")
        self.assertEqual(results[0]["url"], "https://competitor.com")

    def test_exa_provider_normalizes_contents(self) -> None:
        from providers import exa

        payload = {"results": [{"title": "Article", "url": "https://example.com/a", "text": "Full text"}]}
        with patch.dict(os.environ, {"EXA_API_KEY": "test"}, clear=False):
            with patch("providers.exa.httpx.Client", return_value=FakeClient(FakeResponse(payload=payload))):
                results = exa.contents(["https://example.com/a"])
        self.assertEqual(results[0]["source"], "exa_contents")
        self.assertEqual(results[0]["content"], "Full text")


if __name__ == "__main__":
    unittest.main()
