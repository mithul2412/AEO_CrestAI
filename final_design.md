# Crest.ai MotionViz Redesign Handoff

## Design Goal

Crest.ai now presents itself as an AI Visibility Lab: a calm diagnostic workspace that guides users through the citation pipeline one gate at a time. The redesign follows the `design_detailed.md` direction while preserving the existing fetch, scoring, Tavily competitor gap, verdict, and chat workflows.

## Gate Workflow

1. **Gate 1: Focus Mode**
   - The initial page is centered around the Crest.ai mark, the headline "Test AI Citation Readiness", a large URL input, and a Diagnostic Yellow fetch action.
   - Jina/SSE fetch progress stays visible with an animated `InfinityLoop` loading state.

2. **Gate 2: Baseline Waiting Room**
   - After a page is fetched, the source URL becomes locked context.
   - Baseline scores remain available in Score mode.
   - A cyan query unlock card asks the user to run the target query that will open retrieval, answer extraction, and competitor gap diagnosis.

3. **Gate 3: Diagnostic Engine**
   - Query scoring automatically switches the workspace into Intelligence mode.
   - The Intelligence timeline shows Access, AI-Readable Preview, Extraction Warnings, Retrieval Fitness, Answer Extraction, Competitive Citation Gap, Highest-Impact Fix, and Chunk View.
   - A desktop sticky Chunk Minimap lets reviewers jump through chunk diagnostics; mobile uses a horizontal minimap strip.

## Visual System

- Light theme is the default MotionViz lab palette:
  - Workbench: `#fffffe`
  - Authority slate: `#272343`
  - Diagnostic yellow action: `#ffd803`
  - Verified signal: `#e3f6f5`
  - Structural cyan: `#bae8e8`
  - Secondary data: `#2d334a`
- Dark theme remains available, but it uses the same semantic roles.
- Primary actions use Diagnostic Yellow only.
- Cards are restrained and functional; the Highest-Impact Fix and diagnostic hero use stronger borders to create hierarchy.

## Pure Typographic Wordmark

- Crest.ai now uses the recommended "The Translation" direction from `wordmark_architecture.md`: a pure logotype with no graphical symbol.
- The wordmark separates the product's two audiences:
  - `Crest` is the human layer, set in Satoshi SemiBold.
  - `.` is the diagnostic hinge, set in Commit Mono and held in Diagnostic Yellow.
  - `ai` is the machine layer, set in Commit Mono with slate/data coloring.
- The wordmark always stays on one horizontal line. The topbar version is compact, while the Focus Mode version scales up without stacking the letters.
- The subtitle `AI Visibility Lab` remains supporting product context, but it is not part of the logo.
- The color system is intentionally tighter:
  - Slate carries authority and diagnostic structure.
  - Diagnostic Yellow is reserved for primary action and the wordmark hinge dot.
  - Cyan/green is used for verified signal, readable extraction, and success states.
  - Amber/red are reserved for warning, risk, and failure states.
- The old multi-color uploaded logo and the later SVG symbol were removed from active UI because the pure wordmark is more premium, more ownable, and less likely to fall into generic AI/SEO icon language.

## Typography System

- Crest.ai now uses a two-speed typography model from `typography_directory.md`.
- Human interface typography uses **Satoshi** from Fontshare for navigation, section titles, helper text, buttons, verdict explanations, fix copy, and chat UI.
- Machine-readable typography uses **Commit Mono** from Fontsource/jsDelivr for URLs, extracted markdown, AI-readable preview text, status values, score numbers, formulas, chunk IDs, minimap labels, and metadata.
- Font delivery is CDN-based:
  - Satoshi loads through `https://api.fontshare.com`.
  - Commit Mono loads through `@font-face` declarations backed by `https://cdn.jsdelivr.net/fontsource/fonts/commit-mono`.
  - Fallbacks stay in place through system sans and system monospace stacks.
- Typography tokens in `frontend/src/index.css` define Display, H1, H2, H3, Label, Body P1/P2, Metric Huge, Data Block, Code Inline, and Chunk ID sizing.
- Score and metric surfaces use `font-variant-numeric: tabular-nums` so numeric columns, deltas, and diagnostics align cleanly.
- Letter spacing is normalized to `0` in implementation for responsive layout safety while preserving the intended hierarchy through family, size, weight, and line-height.

## Typography Thinking Process

- The interface separates guidance from evidence: Satoshi reads like product direction, while Commit Mono signals raw data, model output, URL context, or retrievable chunks.
- The goal is to reduce cognitive fatigue for users moving between strategic recommendations and dense machine-readable artifacts.
- Tabular numerals make score comparisons and metric rows easier to scan, especially in the Intelligence view where users compare retrieval, answer extraction, and competitor gap signals.
- Buttons and badges avoid tiny monospace unless they represent data or status, keeping actions readable while preserving the lab-like diagnostic language.

## Logo Usage

- `CrestLogo` now renders only the live text `Crest.ai` wordmark.
- The old uploaded Crest.ai asset may remain in `frontend/src/assets/crest-ai-logo.png`, but it is no longer the active app identity.
- The logo appears in the sticky app shell and in the initial Focus Mode.
- `showWordmark={false}` still renders the compact wordmark without the subtitle, rather than falling back to an icon.

## Motion And Loading

- `InfinityLoop` is used for continuous reading and scoring states such as URL fetching and baseline analysis.
- `WanderingEyes` remains the discovery loader for Tavily competitor lookup, answer extraction, and fix generation.
- All user-visible loading states remain animated.

## Implementation Notes

- Main files changed:
  - `frontend/src/App.jsx`
  - `frontend/src/components/UrlInput.jsx`
  - `frontend/src/components/ParticleLoader.jsx`
  - `frontend/src/components/IntelligencePanel.jsx`
  - `frontend/src/components/CrestLogo.jsx`
  - `frontend/src/components/InfinityLoop.jsx`
  - `frontend/src/index.css`
  - `frontend/index.html`
- Backend APIs were not changed for this design pass.
- Existing `/fetch`, `/analyze`, Tavily competitor intelligence, verdicts, and chat behavior are preserved.

## Responsive Behavior

- Desktop Intelligence mode uses a left sticky Chunk Minimap and a main diagnostic timeline.
- Tablet/mobile collapses the minimap above the timeline as a horizontal scroll strip.
- Gate 1 input and CTA stack on narrow screens to avoid overlap.
