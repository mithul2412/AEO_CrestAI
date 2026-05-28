# Agentic AI Readiness Layer

The Agentic AI Readiness Layer turns a fetched page (plus its existing AEO analysis) into a maintained, machine-readable business profile: a canonical profile, generated artifacts (`llms.txt`, JSON-LD, FAQ blocks, etc.), validation, hosted output formats, and a rescan/approval workflow that keeps that profile current as the source page changes. It's an isolated module under `backend/agentic/` — the original AEO scoring flow is untouched:

```text
URL input -> fetch page -> baseline score -> query scoring -> verdicts -> chat
```

This document is the single current-state reference for that layer, replacing what had become nine overlapping incremental notes (implementation summary → current status → next-stage summary, plus several narrower topic docs) written at different points during development.

## Backend routes

Core generation and hosting:

- `POST /agentic/generate`
- `POST /agentic/validate`
- `GET /agentic/profiles`
- `GET /agent/:slug`
- `GET /agent/:slug.json`
- `GET /agent/:slug.md`

Managed-profile routes (rescan, versioning, approval):

- `POST /agentic/rescan/:slug`
- `GET /agentic/approvals`
- `GET /agentic/approvals/:id`
- `POST /agentic/approvals/:id/approve`
- `POST /agentic/approvals/:id/reject`

`GET /agent/:slug` content-negotiates on `Accept` — `text/html`, `application/json`, or `text/markdown` — and sets `Vary: Accept`; the `.json`/`.md` suffix routes work as direct alternatives. When `ENABLE_AGENTIC_LAYER=false`, agentic/hosted routes return `503` JSON instead of crashing the server.

## Frontend components

- `AgenticReadinessPanel` — appears after baseline analysis, includes monitoring/approval controls
- `ArtifactTabs`
- `HostedProfilePreview`
- `ValidationReport`
- `src/utils/agenticApi.js`

The Vite dev proxy includes `/agentic` and `/agent`. Errors stay inside the panel; existing score/verdict/chat UI is unaffected.

## Artifacts generated

All generated from the canonical profile (never independently from raw text): `llms.txt`, `llms-full.txt`, Schema.org JSON-LD, an FAQ block, action metadata, a claim-source map, structured service/product data, `robots.txt` recommendations, and a `rel="alternate"` snippet.

## Validation

Checks run against generated output: canonical profile required fields, JSON-LD array/object structure (`@context`, `@type`), `llms.txt`/`llms-full.txt` shape, action URL safety, claim source grounding, risky-claim warnings, pricing approval requirement, and private/env value leakage.

## Versioning

Stored profile records keep the current published profile at the top level plus a `versionHistory` of every prior save (canonical profile, artifacts, validation, engine readiness, hosted links, and any associated change events per snapshot). Every publish — whether from initial generation, an auto-published rescan, or an approved change — increments `version` and appends a history entry.

## Change detection

A rescan diffs the old canonical profile against a newly extracted one and emits typed change events:

`page_content_changed`, `pricing_changed`, `new_service_or_product`, `removed_service_or_product`, `broken_action_link`, `robots_txt_changed`, `schema_removed`, `faq_changed`, `policy_changed`, `contact_info_changed`, `ai_standard_changed`

Each event carries `type`, `path`, `oldValue`, `newValue`, `severity`, affected artifacts, and an approval flag (plus camelCase aliases `affectedArtifacts`/`requiresApproval` for compatibility). Events involving pricing, legal/policy content, medical or financial claims, guarantees, certifications, ratings/reviews, refund policy, or availability are marked **approval required**; everything else can be marked auto-publishable.

## Approval workflow

Sensitive changes don't publish automatically — they create an approval request instead, holding the pending profile/artifacts until a reviewer acts.

- `GET /agentic/approvals` (optional `?status=pending`)
- `GET /agentic/approvals/:id`
- `POST /agentic/approvals/:id/approve` — body may include `{ reviewerNote, reviewedBy }`
- `POST /agentic/approvals/:id/reject`

Approving publishes the pending profile/artifacts, increments the stored version, and appends to `versionHistory`. Rejecting preserves the currently published profile and keeps reviewer metadata for the record. Low-risk events may still be marked `auto_publish_allowed` and skip this step entirely — there's no scheduler; every rescan is manually triggered.

## Manual rescan

```text
POST /agentic/rescan/:slug
```

Accepts updated content directly in the body (`markdown`, `pageContent`, or `content`), or omits it and lets the backend re-fetch the profile's stored source URL. Returns `404` for an unknown slug, `400` if there's neither request content nor a stored source URL to fall back on.

Flow: load the stored profile → resolve updated markdown → extract a new canonical profile → diff old vs. new → compute affected artifacts → compile and validate pending artifacts → auto-publish low-risk changes or create an approval request for sensitive ones. Every rescan updates monitoring metadata on the profile record: `lastScannedAt`, `lastChangeDetectedAt`, `lastRescanStatus`, `lastRescanSummary`.

## Storage

A storage abstraction backs hosted profiles, approvals, and monitoring metadata, with two modes:

| Mode | Behavior |
|---|---|
| `memory` (default) | In-process only; profiles and approvals disappear on backend restart. No setup required. |
| `file` (`AGENTIC_PROFILE_STORAGE=file`) | Writes JSON records to `backend/data/agentic-profiles/` (approvals under `.../approvals/`). Local-dev oriented — not a production database, and doesn't coordinate concurrent writers. Generated JSON is git-ignored. |

## Known limitations

- In-memory storage doesn't survive a backend restart; file storage is local/dev-only, not a production database.
- No automatic scheduler — rescan is always manual.
- Generated facts are deterministic and source-grounded; no LLM extraction and no invented facts.
- No AI/search-engine ranking or visibility is guaranteed.

## Manual smoke test

1. Start backend (`cd backend && npm run dev`) and frontend (`cd frontend && npm run dev`).
2. Open `http://localhost:5173`, enter a URL, click **Fetch Page**, confirm baseline scoring renders.
3. Click **Generate Agentic AI Readiness Layer**; confirm the artifact tabs render (`llms.txt`, `llms-full.txt`, JSON-LD, FAQ, actions, claims, robots recommendations, validation, engine readiness, hosted links).
4. Copy one artifact via its copy button.
5. Open the hosted links: `/agent/{slug}`, `/agent/{slug}.json`, `/agent/{slug}.md`.
6. Confirm the monitoring section shows version, last-updated, and last-scanned metadata.
7. Run a rescan with pasted content; confirm a no-change rescan reports a clear no-op.
8. Change low-risk copy in pasted content and confirm it auto-publishes; change pricing or policy text and confirm a pending approval appears instead.
9. Approve one pending change and reject another; confirm the UI updates accordingly and the published profile stays unchanged on rejection.
10. Add a target query, run query scoring, and confirm verdicts and chat still work unaffected.
11. Final checks: `cd backend && npm test`, `cd frontend && npm test`, `cd frontend && npm run build`.

## Acceptance checklist

The layer is considered complete against this checklist, grouped by area:

- **Existing AEO flow unaffected**: URL input, page fetch, baseline score, query scoring, verdicts, and chat all still work.
- **Generation**: panel appears post-baseline; `/agentic/generate` populates artifact tabs, validation, and engine readiness; copy buttons work; errors stay inside the panel.
- **Persistence/versioning**: memory storage works by default; `AGENTIC_PROFILE_STORAGE=file` persists under `backend/data/agentic-profiles/` only; version increments on publish; `versionHistory` records prior snapshots.
- **Change events**: no-op diffs produce nothing; each change type (pricing, service add/remove, contact, FAQ, policy, broken link) produces its typed event with correct affected artifacts and approval flag.
- **Approval workflow**: all four approval routes behave as documented above; approvals carry event summaries, affected artifacts, old/new values, timestamps, and review status; approval storage survives re-instantiation in file mode.
- **Manual rescan**: unknown slug → `404`; accepts pasted content or falls back to stored source URL; no-change/low-risk/sensitive paths all return the correct response shape; monitoring metadata updates every time.
- **Frontend monitoring UI**: version/scan metadata, rescan controls, detected changes, and pending approvals all render and update without breaking the existing artifact tabs.
- **Hosted profiles**: HTML/JSON/Markdown all work at `/agent/{slug}` (via both `Accept` negotiation and suffix routes), and `Vary: Accept` is present.
- **Safety**: generated facts are source-grounded, pricing/risky claims are flagged, no unsupported ratings are generated, and all the "known limitations" above are documented rather than silently assumed.
- **Final checks**: `cd backend && npm test`, `cd frontend && npm test`, `cd frontend && npm run build` all pass before merge.

## Pre-existing test note

Before agentic-layer work began, a baseline test run recorded one pre-existing, unrelated failure: `src/App.test.jsx` failed during setup with `TypeError: window.localStorage.clear is not a function` (all other frontend test files passed; backend tests passed once local port-binding was permitted — 6 suites / 86 tests at that baseline, growing as agentic-layer tests were added). This is a baseline/environment issue, not a regression introduced by this layer, and is recorded here so it isn't mistaken for one later.
