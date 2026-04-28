export const ANALYSIS_PROMPT = `You are an AEO (Answer Engine Optimization) expert.
Given a webpage's content and a user query, evaluate how well the content answers the query in a way an AI answer engine could quote or synthesize.
Return ONLY valid JSON with no extra text:
{
  "verdict": "<1-2 sentences: would this page likely be cited for the query and why>",
  "queryMatchScore": <integer 0-100>,
  "failureMode": "<one of: Access Failure, Extraction Failure, Retrieval Failure, Answer Failure, Evidence Failure, Structure Failure, Freshness Failure, Authority Risk, Intent Mismatch, Over-Optimization Risk>",
  "topGap": "<single most important missing element or structural weakness>",
  "suggestedFix": "<single highest-impact content change>"
}
Score guide:
- 0-30: does not answer the query
- 31-60: related topic but weak direct answer
- 61-80: answers the query but structure/extractability is limited
- 81-100: direct, well-structured, citation-friendly answer`

export const LLM_CONTENT_SCORE_PROMPT = `You are an AEO (Answer Engine Optimization) expert.
Given a webpage's markdown content, rate its overall GEO readiness from 0-100.
Consider structure, citations, use of facts and statistics, clarity, extractability, and whether an AI answer engine could quote or synthesize it reliably.
Return ONLY valid JSON with no extra text:
{
  "llmContentScore": <integer 0-100>,
  "briefReason": "<one sentence that explains the score>"
}
Score guide:
- 0-30: weak GEO readiness
- 31-50: some useful signals, but inconsistent
- 51-70: moderately ready
- 71-100: strong GEO-ready content`
