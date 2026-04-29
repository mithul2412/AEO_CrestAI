# Agentic Versioning And Change Events

Commit 8 adds the model Crest will use to maintain a living AI-readable business profile over time.

## Versioning

Stored agentic profile records keep the latest profile at the top level and append each save to `versionHistory`.

Current record fields:

- `version`: latest stored version number
- `createdAt`: first time this slug was stored
- `updatedAt`: latest store write time
- `versionHistory`: ordered snapshots of each stored version

History snapshots include the canonical profile, artifacts, validation, engine readiness, hosted URLs, and any change events associated with the save.

## Change Event Types

The change detection service compares an old canonical profile with a newly extracted canonical profile and emits these event types:

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

## Event Shape

Each event includes:

- `type`
- `path`
- `oldValue`
- `newValue`
- `severity`
- `affected_artifacts`
- `approval_required`
- `auto_publish_allowed`
- `metadata`

For compatibility with existing scaffolding, events also include camel-case aliases:

- `affectedArtifacts`
- `requiresApproval`

## Approval Sensitivity

Events are marked `approval_required: true` when they involve sensitive business claims or customer-facing commitments, including:

- pricing
- legal or policy content
- medical or financial claims
- guarantees
- certifications
- ratings or reviews
- refund policy
- availability

Low-risk events are marked `auto_publish_allowed: true`. Commit 8 does not add approval routes; approval request creation and approve/reject behavior are planned for Commit 9.

## Affected Artifacts

Affected artifacts are computed by event type:

- `page_content_changed`: hosted profile, `llms-full.txt`, claim-source map
- `pricing_changed`: hosted profile, `llms-full.txt`, JSON-LD, structured service/product data
- `new_service_or_product`: hosted profile, `llms.txt`, `llms-full.txt`, JSON-LD, structured service/product data
- `removed_service_or_product`: hosted profile, `llms.txt`, `llms-full.txt`, JSON-LD, structured service/product data
- `broken_action_link`: action metadata, hosted profile
- `robots_txt_changed`: robots recommendations, engine readiness
- `schema_removed`: JSON-LD, engine readiness
- `faq_changed`: hosted profile, `llms-full.txt`, JSON-LD
- `policy_changed`: hosted profile, `llms-full.txt`
- `contact_info_changed`: hosted profile, action metadata, `llms.txt`
- `ai_standard_changed`: robots recommendations, engine readiness, alternate link
