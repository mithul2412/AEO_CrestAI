# Agentic Layer Acceptance Checklist

## Existing AEO Flow

- [ ] URL input renders.
- [ ] Page fetch works.
- [ ] Baseline score renders.
- [ ] Query scoring works.
- [ ] Verdicts render.
- [ ] Chat still works.

## Agentic Generation

- [ ] Agentic panel appears after baseline analysis.
- [ ] Generate button calls `/agentic/generate`.
- [ ] Generated artifacts render in tabs.
- [ ] Validation appears.
- [ ] Engine readiness appears.
- [ ] Copy buttons work for key artifacts.
- [ ] Errors stay inside the agentic panel.

## Persistence And Versioning

- [ ] Memory storage works as the default fallback.
- [ ] `AGENTIC_PROFILE_STORAGE=file` persists profiles locally.
- [ ] File storage writes only under `backend/data/agentic-profiles/`.
- [ ] Stored profile records include canonical profile, artifacts, validation, engine readiness, hosted metadata, timestamps, and version.
- [ ] Profile version increments on publish.
- [ ] `versionHistory` records prior published snapshots.

## Change Events

- [ ] No-op diffs produce no change events.
- [ ] Pricing changes produce `pricing_changed`.
- [ ] Service/product additions produce `new_service_or_product`.
- [ ] Service/product removals produce `removed_service_or_product`.
- [ ] Contact changes produce `contact_info_changed`.
- [ ] FAQ changes produce `faq_changed`.
- [ ] Policy changes produce `policy_changed`.
- [ ] Broken action links produce `broken_action_link`.
- [ ] Affected artifacts are computed for each change event.
- [ ] Sensitive changes are marked `approval_required`.
- [ ] Low-risk changes can be marked `auto_publish_allowed`.

## Approval Workflow

- [ ] `GET /agentic/approvals` lists approvals.
- [ ] `GET /agentic/approvals/:id` returns approval details.
- [ ] `POST /agentic/approvals/:id/approve` approves and publishes pending profile/artifacts.
- [ ] `POST /agentic/approvals/:id/reject` rejects without publishing sensitive changes.
- [ ] Approval requests include event summaries, affected artifacts, old/new values, timestamps, review status, and reviewer notes.
- [ ] Approval storage works in memory mode.
- [ ] Approval storage survives store re-instantiation in file mode.

## Manual Rescan

- [ ] `POST /agentic/rescan/:slug` returns `404` for unknown slugs.
- [ ] Rescan accepts pasted markdown/content.
- [ ] Rescan can fetch the stored source URL when content is not provided.
- [ ] No-change rescan returns a clear no-op response.
- [ ] Low-risk changes auto-publish.
- [ ] Sensitive changes create pending approvals and do not publish.
- [ ] Rescan responses include validation and affected artifacts.
- [ ] Monitoring metadata includes `lastScannedAt`, `lastChangeDetectedAt`, `lastRescanStatus`, and `lastRescanSummary`.

## Frontend Monitoring UI

- [ ] Agentic monitoring section appears after generation.
- [ ] Profile version, last updated, last scanned, rescan status, and rescan summary render.
- [ ] Stored-source rescan button renders when a source URL is available.
- [ ] Pasted markdown/content rescan is available for testing.
- [ ] Detected changes render after rescan.
- [ ] Pending approvals render with event summaries, affected artifacts, old/new values, and status.
- [ ] Approve/reject buttons call backend approval routes.
- [ ] Approve/reject updates UI without breaking generated artifact tabs.
- [ ] Monitoring and approval errors stay inside the agentic panel.

## Hosted Profiles

- [ ] Hosted HTML profile works at `/agent/{slug}`.
- [ ] Hosted JSON profile works at `/agent/{slug}.json`.
- [ ] Hosted Markdown profile works at `/agent/{slug}.md`.
- [ ] `Accept: application/json` returns JSON from `/agent/{slug}`.
- [ ] `Accept: text/markdown` returns Markdown from `/agent/{slug}`.
- [ ] `Accept: text/html` returns HTML from `/agent/{slug}`.
- [ ] `Vary: Accept` is present.

## Safety And Limitations

- [ ] Generated facts are source-grounded/deterministic.
- [ ] Pricing is flagged for approval.
- [ ] Risky claims are flagged.
- [ ] No unsupported ratings/reviews are generated.
- [ ] Memory storage fallback limitation is documented.
- [ ] File storage is documented as local/dev-oriented, not a production database.
- [ ] No automatic cron scheduler is assumed.
- [ ] Rescan is manual.
- [ ] Sensitive changes require approval.

## Final Checks

- [ ] `cd backend && npm test`
- [ ] `cd frontend && npm test`
- [ ] `cd frontend && npm run build`
- [ ] No push performed.
