# Current API Contracts

This document captures the pre-agentic-layer API contracts for the existing AEO flow.

## `GET /fetch`

Frontend usage:
- Called by `frontend/src/components/UrlInput.jsx`.
- Uses Server-Sent Events when `EventSource` is available: `/fetch?url={url}&stream=1`.
- Falls back to JSON fetch: `/fetch?url={url}`.

Input:
- Query parameter `url`: required string.
- Optional query parameter `stream=1`, or `Accept: text/event-stream`, enables SSE.
- URLs without a scheme are normalized to `https://`.
- Only `http` and `https` URLs are accepted.

JSON success response:
```json
{
  "markdown": "# Page content...",
  "charCount": 1234,
  "sourceSignals": {
    "sourceUrl": "https://example.com/page",
    "origin": "https://example.com",
    "llmsTxt": { "present": false, "url": null },
    "llmsFullTxt": { "present": false, "url": null }
  },
  "normalizedUrl": "https://example.com/page"
}
```

SSE success events:
- `status`: `{ "phase": "connecting", "normalizedUrl": "https://example.com/page" }`
- `chunk`: `{ "chunk": "..." }`
- `complete`: `{ "markdown": "...", "charCount": 1234, "sourceSignals": {}, "normalizedUrl": "https://example.com/page" }`

Error responses:
- Invalid URL JSON response: `400`, `{ "error": "url parameter required" }` or `{ "error": "url must be a valid absolute URL" }`.
- Fetch/Jina failure JSON response: `502`, `{ "error": "message", "normalizedUrl": "https://example.com/page" }`.
- SSE failures use a `failure` event with `{ "error": "message", "normalizedUrl": "..." }`.

## `POST /analyze`

Frontend usage:
- Called by `frontend/src/App.jsx` after fetch to create the baseline analysis.
- Called again from `App.jsx` after a target query is entered.

Input:
```json
{
  "markdown": "# Page content...",
  "query": "optional target query",
  "sourceSignals": {
    "llmsTxt": { "present": true, "url": "https://example.com/llms.txt" },
    "llmsFullTxt": { "present": false, "url": null }
  },
  "baselineLlmContentScore": 66
}
```

Success response without `query`:
```json
{
  "contentScore": 70,
  "geuScore": 60,
  "llmContentScore": 66,
  "llmContentModels": [],
  "llmContentStatus": [],
  "overallScore": 65,
  "queryScore": null,
  "gapScore": null,
  "checks": [],
  "geuChecks": [],
  "verdicts": [],
  "modelStatus": []
}
```

Success response with `query`:
```json
{
  "contentScore": 70,
  "geuScore": 60,
  "llmContentScore": 66,
  "llmContentModels": [],
  "llmContentStatus": [],
  "overallScore": 62,
  "queryScore": 50,
  "gapScore": 20,
  "checks": [],
  "geuChecks": [],
  "verdicts": [
    {
      "model": "Llama 3.3",
      "verdict": "Useful but not direct enough.",
      "queryMatchScore": 48,
      "topGap": "Needs a tighter opening answer.",
      "suggestedFix": "Lead with the answer in sentence one."
    }
  ],
  "modelStatus": []
}
```

Error responses:
- Missing or non-string markdown: `400`, `{ "error": "markdown required (must be a string)" }`.
- Upstream LLM/provider failure: `502`, `{ "error": "message" }`.

## `POST /chat`

Frontend usage:
- Called by `frontend/src/components/Chat.jsx`.
- Uses the current page markdown as context when available.

Input:
```json
{
  "messages": [
    { "role": "user", "content": "How should I improve this page?" }
  ],
  "markdown": "# Optional page content..."
}
```

Success response:
```json
{
  "responses": [
    { "model": "Llama 3.3", "response": "..." },
    { "model": "Nemotron 120B", "response": "..." }
  ]
}
```

Error responses:
- Missing, empty, or non-array messages: `400`, `{ "error": "messages array required" }`.
- All providers fail: `502`, `{ "error": "message" }`.

## Preservation Notes

The existing user-facing flow is:

```txt
URL input -> fetch page -> analyze baseline -> query scoring/verdicts -> chat guidance
```

The agentic layer must be added after this flow and must not remove, rename, or change these existing routes.
