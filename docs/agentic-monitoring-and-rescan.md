# Agentic Monitoring And Rescan

Commit 10 adds manual monitoring/rescan scaffolding for stored agentic profiles.

There is no automatic scheduler or cron job in this stage. Rescans run only when explicitly requested.

## Route

```txt
POST /agentic/rescan/:slug
```

The route uses the existing agentic feature flag behavior. If the stored profile does not exist, it returns `404`.

## Input Modes

Mode A: provide updated content in the request body.

```json
{
  "markdown": "# Updated page content..."
}
```

Equivalent content fields are also accepted:

- `pageContent`
- `content`

Mode B: omit content and let the backend fetch the stored profile's `source.sourceUrl` using the same Jina-backed fetch helper used by `/fetch`.

If neither request content nor a stored source URL is available, the route returns `400`.

## Rescan Flow

The manual rescan flow:

1. Loads the existing stored profile by slug.
2. Resolves updated markdown from the request body or stored source URL.
3. Extracts a new canonical profile from the updated markdown.
4. Diffs old vs new canonical profile using the Commit 8 change-event model.
5. Computes affected artifacts.
6. Compiles pending artifacts from the new canonical profile.
7. Validates pending artifacts.
8. Auto-publishes low-risk changes.
9. Creates approval requests for sensitive changes.

Sensitive changes are not auto-published. They are stored as pending approval updates until approved through the Commit 9 approval routes.

## Responses

No changes:

```json
{
  "status": "no_changes",
  "changed": false,
  "changes": [],
  "affectedArtifacts": []
}
```

Low-risk changes:

```json
{
  "status": "auto_published",
  "changed": true,
  "changes": [],
  "affectedArtifacts": [],
  "validation": {},
  "publishedProfile": {}
}
```

Sensitive changes:

```json
{
  "status": "approval_required",
  "changed": true,
  "changes": [],
  "affectedArtifacts": [],
  "validation": {},
  "approval": {}
}
```

## Monitoring Metadata

Each rescan updates monitoring metadata on the stored profile record:

- `lastScannedAt`
- `lastChangeDetectedAt`
- `lastRescanStatus`
- `lastRescanSummary`

For approval-required rescans, only monitoring metadata is updated on the published record. The pending sensitive profile/artifact update remains inside the approval request and is not published.
