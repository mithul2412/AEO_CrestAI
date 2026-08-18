# Agentic Approval Workflow

Commit 9 adds backend scaffolding for approval-required profile updates.

The workflow is intended for sensitive change events produced by the versioning/change-event layer. Initial agentic generation still works as before; approval requests are used when a stored profile has a pending generated update that should not be published automatically.

## Approval Request Model

Approval requests include:

- `id`
- `slug`
- `profileId`
- `status`: `pending`, `approved`, or `rejected`
- `changeEventIds`
- `eventSummaries`
- `affectedArtifacts`
- `oldValues`
- `newValues`
- `pendingUpdate`
- `createdAt`
- `reviewedAt`
- `reviewerNote`
- `audit`

`pendingUpdate` may include a generated canonical profile, artifacts, validation result, engine-readiness readout, and hosted profile metadata. Sensitive changes are stored here until approved.

## Backend Routes

Routes live under `/agentic` and use the existing agentic feature flag behavior.

- `GET /agentic/approvals`
- `GET /agentic/approvals/:id`
- `POST /agentic/approvals/:id/approve`
- `POST /agentic/approvals/:id/reject`

`GET /agentic/approvals` accepts an optional `status` query parameter, for example:

```txt
/agentic/approvals?status=pending
```

Approve/reject requests may include:

```json
{
  "reviewerNote": "Approved after pricing review.",
  "reviewedBy": "reviewer@example.com"
}
```

## Publishing Behavior

Approval-required changes do not publish automatically. A pending approval can include generated replacement profile data and artifacts, but those remain unpublished until approval.

Approving an approval request:

- marks the request `approved`
- publishes the pending profile/artifacts when present
- increments the stored profile version
- appends to `versionHistory`
- preserves approval audit metadata on the published profile record and approval request

Rejecting an approval request:

- marks the request `rejected`
- preserves reviewer metadata
- does not publish pending sensitive changes
- leaves the currently published hosted profile unchanged

Low-risk events may still be marked `auto_publish_allowed` by the change-event model. Scheduler or rescan automation is not part of Commit 9.

## Storage

Approval storage is implemented for both storage modes:

- memory storage keeps approval requests in process memory
- file storage writes approval JSON under `backend/data/agentic-profiles/approvals/`

Generated local approval JSON is ignored by git with the rest of local agentic profile data.