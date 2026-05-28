# Project History & Design Notes

This is one consolidated record of the product's scoring model, UX flow, and two design passes (a homepage rewrite and a broader "AI Visibility Lab" rebrand). It replaces five separate working documents that had grown redundant with each other; it's kept for context on *why* the product looks and behaves the way it does, not as a live spec.

## 1. Scoring model

Crest.AI scores a page across three dimensions. The first two are deterministic; the third is a content-only LLM read added specifically so a page could be scored before a target query even exists.

| Dimension | Type | Basis |
|---|---|---|
| **Content Score** (0–100) | Rule-based, implemented in `geoScorer.js` | Princeton KDD 2024, [GEO: Generative Engine Optimization](https://arxiv.org/abs/2311.09735) |
| **GEU Score** (0–100) | Rule-based, implemented in `geuScorer.js` | AutoGEO CMU 2025, [What Generative Search Engines Like](https://arxiv.org/pdf/2510.11438) |
| **LLM Content Score** (0–100) | AI-computed, content-only | Holistic GEO-readiness read from Llama/Nemotron immediately after fetch |
| **Query Match Score** (0–100) | AI-computed, optional | E-GEO 2025 + AutoGEO 2025 — only computed once a target query is supplied |

**Content Score checklist** (weights sum to 100):

| Check | Weight | Research lift |
|---|---:|---|
| FAQ / Q&A structure present | 20 | +11% |
| Statistics/numbers in content | 15 | +40% |
| External citations present | 20 | +115% |
| Structured data / schema | 15 | — |
| Comparison framing present | 10 | — |
| Fluency / reading level | 10 | +22% |
| `llms.txt` present | 10 | — |

**GEU Score checklist** (weights sum to 100):

| Check | Weight |
|---|---:|
| Key facts extractable as standalone sentences | 30 |
| Answer appears in the first sentence, not buried | 25 |
| Claims backed by numbers or named sources | 25 |
| Sentences remain coherent when lifted out of context | 20 |

### No-query mode

When no target query is supplied, the app shows Content Score, GEU Score, and LLM Content Score only — no Query Match, Gap, or model verdicts, since those require something to match against.

### A flow bug found during implementation

While auditing the "no-query" behavior against the actual `App.jsx` state machine, one gap surfaced: the Chat panel was gated behind `results`, which is only set after a user runs a query re-score — so a user who never entered a query never saw Chat, even though its `post-fetch` suggestions were designed for exactly that case. The fix was to gate Chat on `markdown` (present as soon as a page is fetched) instead of `results`. Two smaller, lower-priority flow notes came out of the same audit: the "Fetch" step in the journey bar represents fetch *and* baseline analysis combined (a reasonable simplification, not a bug), and the query input only appears once baseline analysis returns rather than immediately after fetch (a deliberate trade-off to avoid merging out-of-order results).

## 2. Homepage redesign

The original homepage (`FocusGate`) was a single-column, centered layout: a headline, one paragraph, and a URL input — roughly 70% empty space below the fold. It was rewritten into a two-column hero built around a **Human view / AI view toggle**, making the product's core idea ("a page can look fine to a person and still be invisible to an AI system") interactive on the very first screen instead of something the user had to be told.

Key changes (`frontend/src/routes/Overview.jsx`, `frontend/src/index.css`):

- A segmented Human/AI toggle drives both the copy and a decorative wireframe preview panel on the right. In AI view, the preview shows a 6-item signal checklist (schema, meta description, alt text, JS-render blocking, author/date, canonical URL) with fail/warn icons; in Human view it shows a clean, complete-looking page.
- Sample URL chips (stripe.com, notion.com, anthropic.com, vercel.com) let a visitor try the tool with zero typing.
- Light-mode design tokens were meaningfully darkened — borders (`--line`) in particular had been nearly invisible (`#E6E6E2`) and became `#C0B8AE`, along with matching increases to `--muted`, `--subtle`, and hover-state contrast.
- Removed: the old single-paragraph copy, three low-signal "trust pills" (10s scan / no signup / public pages only), a redundant eyebrow label duplicating the logo, and two vague AI-view callout cards, replaced by the concrete 6-item signal checklist.

## 3. "AI Visibility Lab" rebrand

A broader design pass reframed the product as a calm, diagnostic workspace rather than a scoring tool, organized around a **gated workflow**:

1. **Focus Mode** — centered wordmark, headline, URL input, single Diagnostic Yellow fetch action.
2. **Baseline Waiting Room** — after fetch, the source URL locks in as context while baseline scores are available and a query-unlock prompt invites the next step.
3. **Diagnostic Engine** — once a query is scored, the workspace switches into an "Intelligence" timeline (Access → AI-Readable Preview → Extraction Warnings → Retrieval Fitness → Answer Extraction → Competitive Citation Gap → Highest-Impact Fix → Chunk View), with a sticky chunk minimap for navigation on desktop and a horizontal strip on mobile.

**Visual system** (light theme, default): Workbench `#FFFFFE`, Authority slate `#272343`, Diagnostic yellow (primary action) `#FFD803`, Verified signal `#E3F6F5`, Structural cyan `#BAE8E8`. Primary actions use Diagnostic Yellow exclusively; dark theme keeps the same semantic roles.

**Wordmark**: a pure typographic logotype, no symbol — `Crest` in Satoshi SemiBold (human layer), a yellow `.` in Commit Mono as a "diagnostic hinge," `ai` in Commit Mono (machine layer). The subtitle "AI Visibility Lab" is supporting context, not part of the logo mark itself.

**Typography** follows a two-speed model: **Satoshi** for human-facing UI (navigation, section titles, buttons, chat, fix copy) and **Commit Mono** for machine-readable content (URLs, extracted markdown, score numbers, chunk IDs, formulas), with `font-variant-numeric: tabular-nums` so score columns and deltas align cleanly. The intent is to let a reader distinguish "this is guidance" from "this is raw data" at a glance.

**Motion**: `InfinityLoop` is used for continuous read/score states (fetching, baseline analysis); `WanderingEyes` is used for discovery states (competitor lookup, answer extraction, fix generation). Every loading state stays animated — never a bare spinner.

Files touched: `App.jsx`, `UrlInput.jsx`, `ParticleLoader.jsx`, `IntelligencePanel.jsx`, `CrestLogo.jsx`, `InfinityLoop.jsx`, `index.css`, `index.html`. Backend routes and behavior were untouched by this pass.

## 4. Design review findings

A separate design review (working from a set of UI screenshots) was cross-checked against the codebase to separate confirmed issues from resolved ones. Confirmed at the time: homepage emptiness (addressed by §2 above), inconsistent button colors across primary actions, an overly tall page-content preview pushing the query input below the fold, no clear visual hierarchy in the results section (no single "hero" score), a non-sticky stepper losing context on long scrolls, and a washed-out light mode (also addressed by §2's token changes).

Priority ranking from that review, roughly by effort:

| Priority | Change | Effort |
|---|---|---|
| P0 | Consistent primary-action color across all buttons | Low |
| P0 | Collapsible page preview (default collapsed) | Low |
| P0 | Chat visible as soon as content is fetched, not gated on re-score | Low *(see §1 fix above)* |
| P0 | Chat always shows both models side by side, no compare toggle | Low |
| P1 | Sticky stepper with frosted-glass backdrop | Medium |
| P1 | Homepage hero/feature cards | Medium *(see §2)* |
| P1 | Light-mode polish | Low *(see §2)* |
| P2 | Overall AEO score as a hero number | Medium |
| P2 | Mobile responsiveness pass | Medium |
| P3 | Micro-interactions (favicon, particle effects) | Medium |
