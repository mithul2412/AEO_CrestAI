# Agentic Persistence And Monitoring

This document summarizes the managed AI infrastructure layer added after the original Agentic AI Readiness implementation.

## Storage Behavior

The agentic layer uses a storage abstraction so hosted profiles, approval requests, and monitoring metadata do not depend directly on a single in-memory map.

Default behavior remains memory storage:

```txt
AGENTIC_PROFILE_STORAGE=memory
```

Memory storage preserves existing local behavior and requires no setup. Profiles and approvals disappear when the backend process restarts.

Optional local file storage is enabled with:

```txt
AGENTIC_PROFILE_STORAGE=file
```

File storage writes repo-local JSON records under:

```txt
backend/data/agentic-profiles/
```

Approval requests are stored under:

```txt
backend/data/agentic-profiles/approvals/
```

Generated file-storage JSON is ignored by git.

## Persisted Profile Data

Stored profile records include:

- canonical profile
- generated artifacts
- validation result
- engine-readiness readout
- hosted profile metadata
- `createdAt`
- `updatedAt`
- current `version`
- `versionHistory`
- latest change events
- approval audit metadata when published through approval
- monitoring metadata

## Versioning

Each publish increments the stored profile `version` and appends a `versionHistory` snapshot. The top-level record always represents the current published profile.

Version snapshots include the canonical profile, artifacts, validation, engine readiness, hosted profile links, change events, and approval metadata when available.

## Change Events

Profile diffs use these event types:

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

Each event includes affected artifacts and approval metadata. Sensitive events are marked `approval_required`; low-risk events can be marked `auto_publish_allowed`.

## Approval Workflow

Approval-required changes create approval requests instead of publishing immediately. Approval requests include event summaries, affected artifacts, old/new values, status, review metadata, and pending generated profile/artifact output.

Routes:

- `GET /agentic/approvals`
- `GET /agentic/approvals/:id`
- `POST /agentic/approvals/:id/approve`
- `POST /agentic/approvals/:id/reject`

Approving publishes the pending profile/artifacts and creates a new profile version. Rejecting preserves the current published profile.

## Manual Rescan

Manual rescan route:

```txt
POST /agentic/rescan/:slug
```

Rescan supports two modes:

- request-provided `markdown`, `pageContent`, or `content`
- source URL fetch from the stored profile

Rescan flow:

1. Load the stored profile.
2. Extract a new canonical profile.
3. Diff old vs new profile.
4. Compute affected artifacts.
5. Compile and validate pending artifacts.
6. Auto-publish low-risk changes.
7. Create approval requests for sensitive changes.

Monitoring metadata stored on the profile:

- `lastScannedAt`
- `lastChangeDetectedAt`
- `lastRescanStatus`
- `lastRescanSummary`

## Frontend UI

The Agentic AI Readiness panel now includes monitoring and approval controls after artifacts are generated:

- stored profile version
- last updated
- last scanned
- last rescan status
- last rescan summary
- stored-source rescan button
- pasted-content rescan input
- detected changes
- pending approvals
- approve/reject buttons

Errors stay inside the agentic panel. Existing artifact tabs and hosted profile links remain available after approval/rescan actions.

## Known Limitations

- File storage is local/dev-oriented and is not a production database.
- File storage is single-process oriented and does not coordinate concurrent writers.
- There is no automatic cron scheduler yet.
- Rescan is manual.
- Generated facts are deterministic and source-grounded.
- Sensitive changes require approval before publishing.
- No LLM extraction is used for agentic profile facts.
- No ranking or AI-engine visibility guarantee is implied.
