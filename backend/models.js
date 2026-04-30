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

const QUERY_SUGGESTION_BASE = `You are an AEO (Answer Engine Optimization) strategist.
Given a webpage's markdown content and page metadata, suggest target queries that a content team should test for AI citation readiness.
Return ONLY valid JSON with no extra text:
{
  "queries": [
    "<question 1>",
    "<question 2>",
    "<question 3>"
  ]
}
Hard rules:
- Return exactly 3 questions.
- Each question must be under 90 characters and end with "?".
- Each question must be specific to THIS page's actual subject (use the page's title/H1 vocabulary).
- Do not use generic placeholders like "this product" or "this page".
- Avoid duplicate intent across the three questions.
- Question #1 MUST mention the page's brand or product name explicitly (the named-entity test).
- Questions #2 and #3 MUST be category-level questions that DO NOT name the brand — they test whether this page would be cited as the answer to a generic "best <category>" / "<category> for <audience>" / "what is the best <category>" question. Example: a BMW 3-Series page should produce one named query like "Is the BMW 3-Series reliable?" and two category queries like "best german sports sedan?" and "best luxury sedan for daily driving?".`

const QUERY_SUGGESTION_REFERENCE = `You are an AEO (Answer Engine Optimization) strategist.
This page is a definition / reference / glossary / docs page. The reader is trying to LEARN a concept, not buy a product.
Return ONLY valid JSON with no extra text:
{
  "queries": [
    "<question 1>",
    "<question 2>",
    "<question 3>"
  ]
}
Hard rules:
- Return exactly 3 questions.
- Each question must be under 90 characters and end with "?".
- Each question must be specific to THIS page's actual concept (use the page's title/H1 vocabulary).
- DO NOT generate brand, buyer, pricing, plan, vendor-comparison, or "alternatives to X" questions.
- Generate three questions a learner or developer would actually search:
  (1) a definitional question — "What is X?" or "What does X mean?"
  (2) a how/why mechanism question — "How does X work?" or "Why does X exist?"
  (3) a comparative question against an adjacent concept — "X vs Y" where Y is the most directly related concept (NOT a vendor).`

const QUERY_SUGGESTION_FAQ = `${QUERY_SUGGESTION_BASE}
This page is an FAQ or Q&A. Generate three high-intent questions that mirror the actual questions on the page, but rephrased the way a real searcher would phrase them.`

const QUERY_SUGGESTION_COMPARISON = `${QUERY_SUGGESTION_BASE}
This page compares products/options. Generate three buyer-intent comparison questions: head-to-head, decision-criteria, and category-best.`

const QUERY_SUGGESTION_PRICING = `${QUERY_SUGGESTION_BASE}
This page is about pricing or plans. Generate three buyer-intent questions: cost, plan-fit, and value-justification.`

const QUERY_SUGGESTION_COMMERCIAL = `${QUERY_SUGGESTION_BASE}
This is a commercial product or service page. Prefer commercial, comparison, pricing, plan, feature, or how-it-works questions.`

export const QUERY_SUGGESTION_PROMPTS = {
  reference: QUERY_SUGGESTION_REFERENCE,
  faq: QUERY_SUGGESTION_FAQ,
  comparison: QUERY_SUGGESTION_COMPARISON,
  pricing: QUERY_SUGGESTION_PRICING,
  product: QUERY_SUGGESTION_COMMERCIAL,
  commercial: QUERY_SUGGESTION_COMMERCIAL,
}

export function getQuerySuggestionPrompt(pageType = 'commercial') {
  return QUERY_SUGGESTION_PROMPTS[pageType] || QUERY_SUGGESTION_COMMERCIAL
}

// Back-compat: legacy single-prompt export still used by some callers/tests.
export const QUERY_SUGGESTION_PROMPT = QUERY_SUGGESTION_COMMERCIAL

export const DYNAMIC_FIX_PROMPT = `You are an AEO (Answer Engine Optimization) rewrite strategist.
Given a target query, scoring diagnostics, model verdicts, and the best retrieved page chunks, recommend the single highest-impact fix that would make the page more likely to be cited by an AI answer engine.
Return ONLY valid JSON with no extra text:
{
  "failureMode": "<one of: Access Failure, Extraction Failure, Retrieval Failure, Answer Failure, Evidence Failure, Structure Failure, Freshness Failure, Authority Risk, Intent Mismatch, Over-Optimization Risk>",
  "fix": "<one specific action the content team should take>",
  "whereToEdit": "<specific section, chunk, or page location>",
  "why": "<why this fix matters for the target query>",
  "exampleCopy": "<short example copy or outline the team could paste into the page>",
  "expectedLift": {
    "retrievalScore": "<+N or +0>",
    "answerScore": "<+N or +0>",
    "evidenceScore": "<+N or +0>"
  },
  "confidence": "<low|medium|medium-high|high>"
}
Rules:
- Make the fix specific to the provided query and page evidence.
- Do not return generic advice like "improve content" or "add more information".
- If retrieval is weak, propose query-matched copy using the target query language.
- If evidence is weak, include the exact kind of proof/source to add.
- Keep exampleCopy under 120 words.`
