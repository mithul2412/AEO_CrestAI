# Agentic Layer Current Status

## Local Commits Completed

- `203365a` - Captured baseline API contracts, baseline test status, and agentic env placeholders.
- `2758382` - Added isolated canonical profile schema and deterministic markdown extractor.
- `0e918c3` - Added artifact compiler, generators, validation, engine readiness, and change-detection scaffolding.
- `b78c924` - Exposed `/agentic` and `/agent` backend routes with in-memory hosted profiles.
- `3ddb8c4` - Added frontend Agentic AI Readiness panel, artifact tabs, hosted links, validation UI, and frontend API helper.

## Backend Agentic Routes

- `POST /agentic/generate`
- `POST /agentic/validate`
- `GET /agentic/profiles`
- `GET /agent/:slug`
- `GET /agent/:slug.json`
- `GET /agent/:slug.md`

`GET /agent/:slug` supports `Accept: text/html`, `Accept: application/json`, and `Accept: text/markdown`, and sets `Vary: Accept`.

## Frontend Agentic Components

- `AgenticReadinessPanel`
- `ArtifactTabs`
- `HostedProfilePreview`
- `ValidationReport`
- `src/utils/agenticApi.js`

The Vite dev proxy includes `/agentic` and `/agent`.

## Existing AEO Flow Preservation

The original flow remains intact:

```txt
URL input -> fetch page -> baseline score -> query scoring -> verdicts -> chat
```

Existing `/fetch`, `/analyze`, and `/chat` route files were not changed for the agentic layer. The new panel appears only after baseline analysis is available and keeps generation errors inside the panel.

## Passing Tests And Checks

- `cd backend && npm test` passes: 10 suites, 105 tests.
- `cd frontend && npm test` passes: 4 files, 10 tests.
- `cd frontend && npm run build` passes.

Backend tests that bind localhost ports require local port-binding permission in the Codex sandbox.

## Known Limitations

- In-memory hosted profiles disappear on backend restart.
- No persistent database yet.
- No scheduler yet.
- Generated facts are deterministic/source-grounded only; no LLM extraction or unsupported fact invention.

## Run Locally

From the repo root:

```bash
cd backend
npm run dev
```

In another terminal:

```bash
cd frontend
npm run dev
```

Backend: `http://localhost:3001`

Frontend: `http://localhost:5173`

Useful backend env placeholders:

```bash
ENABLE_AGENTIC_LAYER=true
AGENTIC_PROFILE_BASE_URL=http://localhost:3001/agent
GROQ_API_KEY=
OPENROUTER_API_KEY=
OPENROUTER_API_KEY_24=
JINA_API_KEY=
```

## Manual Smoke Test

1. Open `http://localhost:5173`.
2. Enter a URL and click `Fetch Page`.
3. Wait for baseline scoring to finish and confirm the score display appears.
4. Confirm the Agentic AI Readiness panel appears below the baseline section.
5. Click `Generate Agentic AI Readiness Layer`.
6. Open tabs for `llms.txt`, `JSON-LD`, `Validation`, `Engine readiness`, and `Hosted links`.
7. Copy one artifact with its copy button.
8. Open the hosted links:
   - `/agent/{slug}`
   - `/agent/{slug}.json`
   - `/agent/{slug}.md`
9. Add a target query, run `Re-Score with Query`, and confirm verdicts and chat still work.
