# Agentic Next Stage Summary

The next stage turns Crest's agentic layer from one-time artifact generation into a managed, living AI-readable business profile workflow.

## What Now Works

The original AEO flow is preserved:

```txt
URL input -> fetch page -> baseline analysis -> query scoring -> verdicts -> chat
```

The agentic flow now supports:

```txt
generate profile -> host profile -> persist profile -> rescan -> detect changes -> auto-publish or request approval
```

## Backend Routes

Existing routes remain:

- `GET /fetch`
- `POST /analyze`
- `POST /chat`
- `POST /agentic/generate`
- `POST /agentic/validate`
- `GET /agentic/profiles`
- `GET /agent/:slug`
- `GET /agent/:slug.json`
- `GET /agent/:slug.md`

New managed-profile routes:

- `POST /agentic/rescan/:slug`
- `GET /agentic/approvals`
- `GET /agentic/approvals/:id`
- `POST /agentic/approvals/:id/approve`
- `POST /agentic/approvals/:id/reject`

## Storage

Memory storage remains the default fallback and preserves local behavior:

```txt
AGENTIC_PROFILE_STORAGE=memory
```

Optional local file storage:

```txt
AGENTIC_PROFILE_STORAGE=file
```

File storage persists generated profile records and approvals under `backend/data/agentic-profiles/`. This is useful for local development and manual demos, but it is not a production database.

## Versioning And Change Events

Stored profiles keep a current `version` and `versionHistory`.

Supported change event types:

- `page_content_changed`
- `pricing_changed`
- `new_service_or_product`
- `removed_service_or_product`
- `broken_action_link`
- `robots_txt_changed`
- `schema_removed`
- `faq_changed`
- `policy_changed`
- `contact_info_changed`
- `ai_standard_changed`

Each change computes affected artifacts and whether approval is required.

## Sensitive Changes

Sensitive changes require approval before publishing, including:

- pricing
- legal or policy content
- medical or financial claims
- guarantees
- certifications
- ratings or reviews
- refund policy
- availability

Low-risk changes can auto-publish during manual rescan.

## Frontend

The existing Agentic AI Readiness panel still generates artifacts and shows validation/hosted links. It now also includes a monitoring section with:

- version and last-updated metadata
- last-scanned metadata
- rescan controls
- detected changes
- pending approvals
- approve/reject actions

## Manual Smoke Test

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
5. Confirm baseline scoring appears.
6. Click `Generate Agentic AI Readiness Layer`.
7. Confirm artifact tabs render.
8. Confirm hosted links work:
   - `/agent/{slug}`
   - `/agent/{slug}.json`
   - `/agent/{slug}.md`
9. Confirm the monitoring section appears with version and scan metadata.
10. Run a rescan using pasted content.
11. Confirm no-change rescans show a no-op result.
12. Change low-risk copy in pasted content and confirm auto-publish.
13. Change pricing or policy text and confirm a pending approval appears.
14. Approve the pending change and confirm the UI updates.
15. Reject another pending change and confirm the published profile remains unchanged.
16. Add a target query, run query scoring, and confirm verdicts/chat still work.

## Final Verification

Final hardening commands:

```bash
cd backend && npm test
cd frontend && npm test
cd frontend && npm run build
```

Backend tests that bind localhost ports may require local port-binding permission in the Codex sandbox.

## Known Limitations

- File storage is local/dev-oriented and is not a production database.
- There is no automatic cron scheduler yet.
- Rescan is manual.
- Generated facts are deterministic and source-grounded.
- Sensitive changes require approval.
- No LLM extraction is used for canonical agentic profile facts.
- No AI/search ranking or visibility guarantee is implied.
