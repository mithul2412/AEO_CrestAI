# Agentic Layer Implementation Summary

## What Was Implemented

The Agentic AI Readiness Layer was added as an isolated module under `backend/agentic/` and integrated into the existing React UI after baseline analysis. It turns fetched page markdown plus existing analysis output into a canonical AI Business Profile, generates machine-readable artifacts, validates them, stores generated profiles in memory, and exposes hosted profile formats.

The existing AEO flow remains intact:

```txt
URL input -> fetch page -> baseline score -> query scoring -> verdicts -> chat
```

## Backend Routes

- `POST /agentic/generate`
- `POST /agentic/validate`
- `GET /agentic/profiles`
- `GET /agent/:slug`
- `GET /agent/:slug.json`
- `GET /agent/:slug.md`

`ENABLE_AGENTIC_LAYER=false` returns `503` JSON for agentic/hosted routes without crashing the server.

## Frontend Components

- `AgenticReadinessPanel`
- `ArtifactTabs`
- `HostedProfilePreview`
- `ValidationReport`
- `src/utils/agenticApi.js`

The panel appears after baseline analysis is available and sends URL, markdown, optional query, active analysis results, and source signals to `/agentic/generate`.

## Artifact Types Generated

- `llms.txt`
- `llms-full.txt`
- Schema.org JSON-LD
- FAQ block
- action metadata
- claim-source map
- structured service/product data
- robots.txt recommendations
- `rel="alternate"` snippet

All artifacts are generated from the canonical profile, not independently from raw text.

## Validation Behavior

Validation checks:

- canonical profile required fields
- JSON-LD array/object structure, `@context`, and `@type`
- `llms.txt` and `llms-full.txt` shape
- action URL safety
- claim source grounding
- risky claim warnings
- pricing approval requirement
- private/env value leakage warnings

Pricing and high-risk claims are flagged for review/approval.

## Hosted Profile Behavior

Generated profiles are stored in memory by slug and exposed through `/agent/:slug`. Responses include the canonical profile, selected artifacts, validation, engine readiness, and generated timestamp.

Important limitation: hosted profiles disappear when the backend process restarts.

## Content Negotiation

`GET /agent/:slug` supports:

- `Accept: text/html` -> HTML preview
- `Accept: application/json` -> JSON profile
- `Accept: text/markdown` -> Markdown profile

The route sets `Vary: Accept`. Dedicated suffix routes also work:

- `/agent/:slug.json`
- `/agent/:slug.md`

## Known Limitations

- In-memory hosted profiles disappear on backend restart.
- No persistent database yet.
- No scheduler yet.
- No production change-monitoring worker yet.
- Generated facts are deterministic/source-grounded only.
- No LLM extraction is used.
- No guarantee of ranking or visibility in any AI/search engine.

## Manual Test Steps

1. Start backend:

   ```bash
   cd backend
   npm run dev
   ```

2. Start frontend:

   ```bash
   cd frontend
   npm run dev
   ```

3. Open `http://localhost:5173`.
4. Enter a URL and click `Fetch Page`.
5. Confirm baseline score renders.
6. Click `Generate Agentic AI Readiness Layer`.
7. Review tabs for `llms.txt`, `llms-full.txt`, JSON-LD, FAQ, actions, claims, robots recommendations, validation, engine readiness, and hosted links.
8. Copy a key artifact.
9. Open hosted links:
   - `/agent/{slug}`
   - `/agent/{slug}.json`
   - `/agent/{slug}.md`
10. Add a query, run query scoring, confirm verdicts render, and use chat.

## Final Checks

- `cd backend && npm test`
- `cd frontend && npm test`
- `cd frontend && npm run build`

Backend integration tests require localhost port-binding permission in the Codex sandbox.
