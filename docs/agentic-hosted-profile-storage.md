# Agentic Hosted Profile Storage

The Agentic AI Readiness Layer now reads and writes hosted profiles through a storage abstraction. The default remains the original in-memory store so local behavior is unchanged unless file storage is explicitly enabled.

## Default: Memory Storage

```txt
POST /agentic/generate -> saves profile in memory
GET /agent/:slug       -> reads profile from memory
backend restart        -> stored profiles are cleared
```

`GET /agentic/profiles` reports:

```json
{
  "storage": {
    "type": "memory",
    "warning": "In-memory hosted profiles disappear when the backend process restarts."
  }
}
```

## Optional: Local File Storage

Set:

```bash
AGENTIC_PROFILE_STORAGE=file
```

When enabled, generated hosted profile records are stored as local JSON files under:

```txt
backend/data/agentic-profiles/
```

Each record persists:

- canonical profile
- generated artifacts
- validation results
- engine-readiness readout
- hosted profile URLs
- `createdAt`
- `updatedAt`
- current record `version`
- `versionHistory` snapshots for each stored version

The generated JSON files are intentionally ignored by git. This storage mode is intended for local development and single-process deployments only; it is not a production database and does not coordinate concurrent writers. Approval-aware publishing is planned for the next stage.

Tests can instantiate the file store with a temporary directory to prove profiles survive store re-instantiation without writing outside the repo during normal runtime.

## Version History

Every save increments the profile record's current `version` and appends a `versionHistory` entry. The top-level fields continue to represent the latest published profile so existing hosted routes do not need to change.

Each history entry stores:

- version number
- profile ID and business name summary
- source URL
- timestamps
- canonical profile snapshot
- artifacts snapshot
- validation result
- engine-readiness readout
- hosted profile metadata
- change events, when supplied by a rescan or future approval workflow
