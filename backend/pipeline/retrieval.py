"""Query-to-content retrieval simulation for AEO citation readiness."""
from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any

from providers import jina as jina_provider
from pipeline.content_signals import (
    clamp_score,
    get_citation_signals,
    get_numeric_signals,
    get_sentences,
    get_words,
    has_answer_like_opening,
    normalize_markdown,
)

MIN_CHUNK_WORDS = 140
TARGET_CHUNK_WORDS = 420
MAX_CHUNK_WORDS = 700
RERANK_CANDIDATE_LIMIT = 8
STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "best",
    "by",
    "can",
    "do",
    "does",
    "for",
    "from",
    "how",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "the",
    "this",
    "to",
    "vs",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "with",
    "your",
}


def _word_count(text: str) -> int:
    return len(get_words(text))


def _clean_block(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", normalize_markdown(text)).strip()


def _parse_blocks(markdown: str) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    current_section = "Opening"
    for block in [_clean_block(block) for block in re.split(r"\n{2,}", normalize_markdown(markdown))]:
        if not block:
            continue
        heading_match = re.search(r"^#{1,6}\s+(.+)$", block, re.MULTILINE)
        if heading_match:
            current_section = heading_match.group(1).strip()
        blocks.append({"text": block, "section": current_section, "word_count": _word_count(block)})
    return blocks


def chunk_markdown(markdown: str) -> list[dict[str, Any]]:
    blocks = _parse_blocks(markdown)
    total_words = max(1, sum(block["word_count"] for block in blocks))
    chunks: list[dict[str, Any]] = []
    buffer: list[dict[str, Any]] = []
    buffer_words = 0
    start_word = 0
    cursor = 0

    def flush() -> None:
        nonlocal buffer, buffer_words, start_word
        if not buffer:
            return
        text = _clean_block("\n\n".join(block["text"] for block in buffer))
        words = _word_count(text)
        section = next((block["section"] for block in buffer if block.get("section")), "Opening")
        chunk_start = start_word
        chunk_end = chunk_start + words
        chunks.append(
            {
                "chunk_id": f"c{len(chunks) + 1}",
                "section": section,
                "position": round(min(1, chunk_start / total_words), 2),
                "text": text,
                "word_count": words,
                "start_word": chunk_start,
                "end_word": chunk_end,
            }
        )
        buffer = []
        buffer_words = 0
        start_word = cursor

    for block in blocks:
        if not buffer:
            start_word = cursor
        buffer.append(block)
        buffer_words += block["word_count"]
        cursor += block["word_count"]
        if buffer_words >= TARGET_CHUNK_WORDS or buffer_words >= MAX_CHUNK_WORDS:
            flush()

    if buffer_words > 0:
        if chunks and buffer_words < MIN_CHUNK_WORDS:
            previous = chunks.pop()
            buffer = [
                {
                    "text": previous["text"],
                    "section": previous["section"],
                    "word_count": previous["word_count"],
                },
                *buffer,
            ]
            start_word = previous["start_word"]
        flush()

    return chunks


def _tokenize(text: str) -> list[str]:
    tokens = []
    for word in get_words(str(text).lower()):
        token = re.sub(r"[^a-z0-9-]", "", word)
        if len(token) > 2 and token not in STOPWORDS:
            tokens.append(token)
    return tokens


def _cosine_similarity(a_tokens: list[str], b_tokens: list[str]) -> float:
    a = Counter(a_tokens)
    b = Counter(b_tokens)
    keys = set(a) | set(b)
    dot = sum(a[key] * b[key] for key in keys)
    a_mag = math.sqrt(sum(value * value for value in a.values()))
    b_mag = math.sqrt(sum(value * value for value in b.values()))
    if a_mag == 0 or b_mag == 0:
        return 0.0
    return dot / (a_mag * b_mag)


def _dense_cosine(a_vec: list[float], b_vec: list[float]) -> float:
    if not a_vec or not b_vec or len(a_vec) != len(b_vec):
        return 0.0
    dot = sum(float(a) * float(b) for a, b in zip(a_vec, b_vec))
    a_mag = math.sqrt(sum(float(value) * float(value) for value in a_vec))
    b_mag = math.sqrt(sum(float(value) * float(value) for value in b_vec))
    if a_mag == 0 or b_mag == 0:
        return 0.0
    return dot / (a_mag * b_mag)


def _embedding_similarity_scores(query: str, chunks: list[dict[str, Any]]) -> list[float]:
    if not query.strip() or not chunks:
        return []
    documents = [
        _clean_block(f"{chunk.get('section', '')}\n\n{chunk.get('text', '')}")[:6000]
        for chunk in chunks
    ]
    dimensions = 1024
    query_embedding = jina_provider.embed_texts(
        [query],
        task="retrieval.query",
        dimensions=dimensions,
    )
    passage_embeddings = jina_provider.embed_texts(
        documents,
        task="retrieval.passage",
        dimensions=dimensions,
    )
    if len(query_embedding) != 1 or len(passage_embeddings) != len(documents):
        return []
    scores = [_dense_cosine(query_embedding[0], passage_vec) for passage_vec in passage_embeddings]
    return [max(0.0, min(1.0, score)) for score in scores]


def _normalize_rerank_scores(raw_scores: dict[int, float]) -> dict[int, float]:
    if not raw_scores:
        return {}
    values = list(raw_scores.values())
    if min(values) >= 0 and max(values) <= 1:
        return {index: max(0.0, min(1.0, score)) for index, score in raw_scores.items()}
    low = min(values)
    high = max(values)
    if high == low:
        return {index: 1.0 for index in raw_scores}
    return {index: (score - low) / (high - low) for index, score in raw_scores.items()}


def _rerank_scores(query: str, candidates: list[dict[str, Any]]) -> dict[int, float]:
    if not query.strip() or not candidates:
        return {}
    documents = [
        _clean_block(f"{candidate.get('section', '')}\n\n{candidate.get('text', '')}")[:8000]
        for candidate in candidates
    ]
    reranked = jina_provider.rerank_documents(query, documents, top_n=len(documents))
    raw_scores = {
        item["index"]: item["relevance_score"]
        for item in reranked
        if isinstance(item.get("index"), int) and isinstance(item.get("relevance_score"), (int, float))
    }
    return _normalize_rerank_scores(raw_scores)


def _overlap_score(query_tokens: list[str], chunk_tokens: list[str]) -> float:
    if not query_tokens:
        return 0.0
    chunk_set = set(chunk_tokens)
    unique_query = sorted(set(query_tokens))
    matches = [token for token in unique_query if token in chunk_set]
    return len(matches) / len(unique_query)


def _has_direct_answer(chunk_text: str, query_tokens: list[str]) -> bool:
    sentences = get_sentences(chunk_text)[:3]
    query_set = set(query_tokens)
    for sentence in sentences:
        sentence_tokens = _tokenize(sentence)
        shared = len([token for token in sentence_tokens if token in query_set])
        answer_verb = re.search(
            r"\b(is|are|means|refers to|helps|provides|offers|enables|allows|uses|"
            r"works by|includes|supports)\b",
            sentence,
            re.IGNORECASE,
        )
        if answer_verb and shared >= min(2, max(1, len(query_set))):
            return True
    return has_answer_like_opening(chunk_text)


def _specificity_score(chunk_text: str, query_tokens: list[str]) -> int:
    entity_count = len(
        re.findall(r"\b[A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+){0,3}\b", chunk_text)
    )
    numeric_count = len(get_numeric_signals(chunk_text))
    query_overlap = _overlap_score(query_tokens, _tokenize(chunk_text))
    return clamp_score((query_overlap * 55) + min(entity_count, 5) * 6 + min(numeric_count, 4) * 4)


def _evidence_score(chunk_text: str) -> int:
    citations = get_citation_signals(chunk_text)
    numeric = get_numeric_signals(chunk_text)
    return clamp_score(min(citations["total"], 4) * 18 + min(len(numeric), 5) * 7)


def _self_contained_score(chunk_text: str) -> int:
    opening = (get_sentences(chunk_text) or [""])[0].strip()
    if re.match(r"^(it|they|this|these|that|those)\b", opening, re.IGNORECASE):
        return 35
    return 80 if len(get_words(opening)) >= 6 else 55


def _diagnose_retrieval(top_chunk: dict[str, Any] | None, chunks: list[dict[str, Any]]) -> str:
    if not top_chunk:
        return "No retrievable chunk could be built from this page."
    if top_chunk["similarity"] < 0.22:
        return "No chunk strongly matches the target query language."
    if top_chunk["position"] > 0.55:
        return "The best matching answer appears late in the page."
    if not top_chunk["direct_answer"]:
        return "The top chunk is relevant, but it does not open with a direct answer."
    if len(chunks) > 1 and top_chunk["position"] > 0.25:
        return "The right topic is present, but it is not front-loaded."
    return "The target query maps to an early, usable chunk."


def analyze_retrieval(chunks: list[dict[str, Any]], query: str, use_external: bool = False) -> dict[str, Any]:
    query_tokens = _tokenize(query)
    embedding_scores = _embedding_similarity_scores(query, chunks) if use_external else []
    used_embeddings = len(embedding_scores) == len(chunks) and len(chunks) > 0
    ranked = []
    for index, chunk in enumerate(chunks):
        chunk_tokens = _tokenize(f"{chunk.get('section', '')} {chunk.get('text', '')}")
        cosine = _cosine_similarity(query_tokens, chunk_tokens)
        overlap = _overlap_score(query_tokens, chunk_tokens)
        lexical_similarity = min(1.0, cosine * 0.7 + overlap * 0.3)
        embedding_similarity = embedding_scores[index] if used_embeddings else 0.0
        similarity = (
            min(1.0, lexical_similarity * 0.45 + embedding_similarity * 0.55)
            if used_embeddings
            else lexical_similarity
        )
        direct_answer = _has_direct_answer(chunk["text"], query_tokens)
        chunk_evidence_score = _evidence_score(chunk["text"])
        chunk_specificity_score = _specificity_score(chunk["text"], query_tokens)
        position_score = clamp_score(100 - (chunk["position"] * 70))
        self_contained = _self_contained_score(chunk["text"])
        retrieval_score = clamp_score(
            similarity * 100 * 0.38
            + (100 if direct_answer else 35) * 0.18
            + position_score * 0.14
            + chunk_specificity_score * 0.14
            + chunk_evidence_score * 0.1
            + self_contained * 0.06
        )
        ranked.append(
            {
                **chunk,
                "similarity": round(similarity, 2),
                "lexical_similarity": round(lexical_similarity, 2),
                "embedding_similarity": round(embedding_similarity, 2) if used_embeddings else None,
                "direct_answer": direct_answer,
                "evidence_score": chunk_evidence_score,
                "specificity_score": chunk_specificity_score,
                "self_contained_score": self_contained,
                "rerank_score": None,
                "retrieval_score": retrieval_score,
            }
        )
    ranked.sort(key=lambda item: item["retrieval_score"], reverse=True)
    used_reranker = False
    if use_external and ranked:
        candidates = ranked[:RERANK_CANDIDATE_LIMIT]
        rerank_scores = _rerank_scores(query, candidates)
        if rerank_scores:
            used_reranker = True
            for candidate_index, rerank_score in rerank_scores.items():
                if 0 <= candidate_index < len(candidates):
                    candidates[candidate_index]["rerank_score"] = round(rerank_score, 2)
                    candidates[candidate_index]["retrieval_score"] = clamp_score(
                        candidates[candidate_index]["retrieval_score"] * 0.78
                        + rerank_score * 100 * 0.22
                    )
            ranked.sort(key=lambda item: item["retrieval_score"], reverse=True)
    method = "lexical_fallback"
    if used_reranker:
        method = "hybrid_embedding_rerank" if used_embeddings else "lexical_rerank"
    elif used_embeddings:
        method = "hybrid_embedding"
    for chunk in ranked:
        chunk["retrieval_method"] = method
    top_chunks = ranked[:3]
    top_chunk = top_chunks[0] if top_chunks else None
    return {
        "query": query,
        "method": method,
        "used_embeddings": used_embeddings,
        "used_reranker": used_reranker,
        "top_chunks": top_chunks,
        "retrieval_score": top_chunk["retrieval_score"] if top_chunk else 0,
        "diagnosis": _diagnose_retrieval(top_chunk, chunks),
    }


def score_answer_extraction(top_chunk: dict[str, Any] | None) -> dict[str, Any]:
    if not top_chunk:
        return {
            "answer_score": 0,
            "direct_answer_found": False,
            "diagnosis": "No candidate chunk is available for answer extraction.",
        }
    sentences = get_sentences(top_chunk["text"])
    standalone_count = 0
    for sentence in sentences:
        if re.search(
            r"^[A-Z][^!?]*\b(is|are|means|provides|offers|helps|enables|allows|"
            r"includes|supports)\b",
            sentence,
            re.IGNORECASE,
        ) and len(get_words(sentence)) >= 5:
            standalone_count += 1
    vague_count = len(
        re.findall(
            r"\b(seamless|robust|powerful|innovative|transform|outcomes|leverage|"
            r"optimize|streamline)\b",
            top_chunk["text"],
            re.IGNORECASE,
        )
    )
    pronoun_opening_penalty = (
        18
        if re.match(
            r"^(it|they|this|these|that|those)\b",
            (sentences[0] if sentences else "").strip(),
            re.IGNORECASE,
        )
        else 0
    )
    answer_score = clamp_score(
        (45 if top_chunk["direct_answer"] else 15)
        + min(standalone_count, 4) * 12
        + min(top_chunk["specificity_score"], 85) * 0.18
        + min(top_chunk["evidence_score"], 80) * 0.12
        - min(vague_count, 5) * 4
        - pronoun_opening_penalty
    )
    return {
        "answer_score": answer_score,
        "direct_answer_found": top_chunk["direct_answer"],
        "diagnosis": (
            "The top chunk contains an extractable answer path."
            if top_chunk["direct_answer"]
            else "The chunk is relevant, but it does not provide a clean standalone answer near the start."
        ),
    }


def benchmark_retrieval(
    markdown: str,
    queries: list[dict[str, str]],
    limit: int = 8,
    use_external: bool = False,
) -> list[dict[str, Any]]:
    chunks = chunk_markdown(markdown)
    results = []
    for query in queries[:limit]:
        text = query.get("text", "")
        if not text:
            continue
        retrieval = analyze_retrieval(chunks, text, use_external=use_external)
        answer = score_answer_extraction(retrieval["top_chunks"][0] if retrieval["top_chunks"] else None)
        results.append(
            {
                "query": text,
                "intent": query.get("intent", "unknown"),
                "method": retrieval.get("method", "lexical_fallback"),
                "retrieval_score": retrieval["retrieval_score"],
                "answer_score": answer["answer_score"],
                "diagnosis": retrieval["diagnosis"],
                "top_chunk_id": retrieval["top_chunks"][0]["chunk_id"] if retrieval["top_chunks"] else None,
                "top_chunk_section": retrieval["top_chunks"][0].get("section") if retrieval["top_chunks"] else None,
                "top_chunk_position": retrieval["top_chunks"][0].get("position") if retrieval["top_chunks"] else None,
                "direct_answer": answer["direct_answer_found"],
                "evidence_score": retrieval["top_chunks"][0].get("evidence_score", 0) if retrieval["top_chunks"] else 0,
                "specificity_score": retrieval["top_chunks"][0].get("specificity_score", 0) if retrieval["top_chunks"] else 0,
                "self_contained_score": retrieval["top_chunks"][0].get("self_contained_score", 0) if retrieval["top_chunks"] else 0,
            }
        )
    return results
