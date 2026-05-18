# Homepage Redesign — Change Log

> Branch: `final_changes`
> Files changed: `frontend/src/routes/Overview.jsx`, `frontend/src/index.css`

---

## What was redesigned

The old homepage (`FocusGate`) was a single-column centered layout with a title, one paragraph, and a URL input. It has been replaced with a two-column hero that makes the product's core concept — "human view vs AI view" — immediately interactive and self-explanatory.

---

## 1. `frontend/src/routes/Overview.jsx` — FocusGate rewrite

### Constants added (above `FocusGate`)

```jsx
const SAMPLE_URLS = [
  'https://stripe.com/pricing',
  'https://www.notion.com/help',
  'https://anthropic.com',
  'https://vercel.com/blog',
]

const VIEW_COPY = {
  human: 'Looks fine to you. The page reads cleanly in a normal browser.',
  ai:    'But AI systems may see less — blocked sections, weak metadata, or content too thin to cite.',
}
```

### FocusGate — before

```jsx
function FocusGate() {
  const { url, setUrl, handleFetchComplete, contentAnalyzing } = useRun()

  return (
    <div className="focus__inner">
      <span className="kicker">Crest.ai · AI Visibility Lab</span>
      <h1 className="focus__title">Test AI citation readiness.</h1>
      <p className="focus__copy">
        Paste a live page URL. Crest.ai reads the AI-visible markdown, checks crawler access,
        runs a baseline read, and lets you score the page against a target query.
      </p>
      <div className="focus__url-section">
        <UrlInput url={url} onUrlChange={setUrl} onFetchComplete={handleFetchComplete} />
        {contentAnalyzing && (
          <span className="kicker">Analyzing baseline content signals…</span>
        )}
      </div>
    </div>
  )
}
```

### FocusGate — after

```jsx
function FocusGate() {
  const { url, setUrl, handleFetchComplete, contentAnalyzing } = useRun()
  const [view, setView] = useState('human')
  const isAi = view === 'ai'

  return (
    <div className="focus__split">
      {/* ── LEFT COLUMN ── */}
      <section className="focus__copy-col">
        <header className="focus__header">
          {/* Eyebrow: green live dot + free audit label */}
          <span className="kicker">
            <span style={{ color: 'var(--ok)' }}>●</span> Live · Free audit
          </span>
          <h1 className="focus__title">See your page like an AI does.</h1>
          {/* key={view} forces remount → CSS animation replays on every toggle */}
          <p className={`focus__sub focus__sub--${view}`} key={view}>
            {VIEW_COPY[view]}
          </p>
        </header>

        {/* Human / AI segmented toggle */}
        <div className="focus__toggle" role="tablist" aria-label="View mode">
          <button
            type="button" role="tab"
            aria-selected={!isAi}
            className={`focus__toggle-btn${!isAi ? ' is-active' : ''}`}
            onMouseEnter={() => setView('human')}
            onFocus={() => setView('human')}
            onClick={() => setView('human')}
          >Human view</button>
          <button
            type="button" role="tab"
            aria-selected={isAi}
            className={`focus__toggle-btn${isAi ? ' is-active' : ''}`}
            onMouseEnter={() => setView('ai')}
            onFocus={() => setView('ai')}
            onClick={() => setView('ai')}
          >AI view</button>
        </div>

        {/* URL input + sample chips */}
        <div className="focus__form">
          <UrlInput url={url} onUrlChange={setUrl} onFetchComplete={handleFetchComplete} />

          <div className="focus__samples">
            <span className="focus__samples-label">Try a sample</span>
            <div className="focus__samples-row">
              {SAMPLE_URLS.map(s => (
                <button key={s} type="button" className="chip focus__sample" onClick={() => setUrl(s)}>
                  {s.replace(/^https?:\/\/(www\.)?/, '')}
                </button>
              ))}
            </div>
          </div>

          {contentAnalyzing && (
            <span className="kicker">Analyzing baseline content signals…</span>
          )}
        </div>
      </section>

      {/* ── RIGHT COLUMN — wireframe preview panel ── */}
      <aside className={`focus__preview${isAi ? ' is-ai' : ''}`} aria-hidden="true">
        <div className="focus__preview-glow" />

        <div className="focus__preview-head">
          <span className="focus__preview-eyebrow">Preview</span>
          <span className={`focus__preview-status focus__preview-status--${isAi ? 'warn' : 'ok'}`}>
            <span className="focus__preview-status-dot" />
            {isAi ? 'Citation gaps' : 'Reads cleanly'}
          </span>
        </div>

        <div className="focus__preview-card">
          <div className="focus__preview-kicker">
            {isAi ? 'Important context may be invisible' : 'Content appears complete'}
          </div>

          {/* wireframe skeleton lines */}
          <div className="mini-nav" />
          <div className="mini-line" />
          <div className="mini-line mini-line--mid" />
          <div className="mini-line mini-line--short" />

          {/* hero block placeholder */}
          <div className="mini-box">
            <span className="mini-box-label">
              {isAi ? 'Hero blocked from crawlers' : 'Hero · headline + image'}
            </span>
          </div>

          {/* citation-readiness score bar */}
          <div className="mini-meter" aria-hidden="true">
            <span className="mini-meter-track">
              <span className="mini-meter-fill" />  {/* 92% green → 38% amber on toggle */}
            </span>
            <span className="mini-meter-label">
              {isAi ? '38 / 100 citation-ready' : '92 / 100 reads cleanly'}
            </span>
          </div>

          {/* AI view: 6-signal checklist  |  Human view: two callout cards */}
          {isAi ? (
            <div className="mini-signals">  {/* 2-column grid */}
              <div className="mini-signal mini-signal--fail">
                <span className="mini-signal-icon">✕</span>
                <span className="mini-signal-text">Schema · not found</span>
              </div>
              <div className="mini-signal mini-signal--fail">
                <span className="mini-signal-icon">✕</span>
                <span className="mini-signal-text">Meta description · absent</span>
              </div>
              <div className="mini-signal mini-signal--warn">
                <span className="mini-signal-icon">!</span>
                <span className="mini-signal-text">Alt text · 0 of 8</span>
              </div>
              <div className="mini-signal mini-signal--fail">
                <span className="mini-signal-icon">✕</span>
                <span className="mini-signal-text">JS render · blocked</span>
              </div>
              <div className="mini-signal mini-signal--warn">
                <span className="mini-signal-icon">!</span>
                <span className="mini-signal-text">Author / date · absent</span>
              </div>
              <div className="mini-signal mini-signal--fail">
                <span className="mini-signal-icon">✕</span>
                <span className="mini-signal-text">Canonical URL · none</span>
              </div>
            </div>
          ) : (
            <>
              <div className="mini-grid">
                <div className="mini-callout">Readable layout, images, and context make sense in a normal browser.</div>
                <div className="mini-callout">Users see a complete page with supporting sections and visual hierarchy.</div>
              </div>
              <div className="mini-line mini-line--hidden" />
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
```

**Key behaviour notes:**
- `key={view}` on the `<p>` tag forces React to remount it on every toggle, which replays the CSS `focus-sub-fade` animation automatically — no JS timeout needed
- `onMouseEnter` + `onFocus` + `onClick` all update the view so keyboard and pointer users both get the live preview effect
- The preview panel is `aria-hidden="true"` — it's decorative; screen readers skip it

---

## 2. `frontend/src/index.css` — changes

### 2a. Light-mode root tokens — strengthened

The original tokens were too pale (near-white paper, barely-visible borders, ghost-level secondary text). These are the new values — dark mode block is **unchanged**.

```css
:root {
  /* before → after */
  --paper:       #FAFAF8 → #F2EFE8;   /* warm cream, not cold white */
  --paper-2:     #F2F2EE → #E4DFD5;   /* card surface clearly distinct from page */
  --ink:         #0A0A0A → #111111;   /* warm near-black */
  --ink-2:       #1A1A1A → #1C1916;   /* warm dark */
  --line:        #E6E6E2 → #C0B8AE;   /* THE main fix — borders now clearly visible */
  --line-strong: #C8C8C2 → #A09890;   /* wireframe bars have real presence */
  --muted:       #6B6B68 → #4A4540;   /* secondary text properly anchored */
  --muted-2:     #9A9A95 → #6E6860;   /* hint text no longer ghost-level */
  --subtle:      #F5F5F1 → #D8D3C8;   /* toggle/chip backgrounds clearly distinct */
  --hover:       #EFEFEA → #CAC4BA;   /* hover states perceptible */

  /* soft badge backgrounds — bumped opacity for warm-cream readability */
  --ok-soft:     rgba(31,142,90, 0.08) → 0.12;
  --warn-soft:   rgba(201,122,31, 0.10) → 0.14;
  --danger-soft: rgba(180,58,42, 0.10) → 0.12;
}
```

### 2b. New CSS classes added (appended after existing `.focus__url-section` rule)

**Layout:**
```css
.focus__split          /* 2-column hero grid (minmax(320px,580px) | 1fr), vertically centered */
.focus__copy-col       /* left column flex, gap --s-6 */
.focus__header         /* flex column, gap --s-3 (kicker + h1 + subline) */
.focus__form           /* flex column, gap --s-4 (UrlInput + samples) */
.focus__sub            /* 18px muted paragraph; CSS fade-in animation on each render */
@keyframes focus-sub-fade
```

**Toggle:**
```css
.focus__toggle         /* pill container, 1.5px --line-strong border, --subtle background */
.focus__toggle-btn     /* inactive: --ink-2 text, transparent bg */
.focus__toggle-btn.is-active  /* --accent (#FFD803) background, #0A0A0A text */
```

**Sample chips:**
```css
.focus__samples        /* column flex, dashed --line-strong top border */
.focus__samples-label  /* 11px uppercase mono, --muted */
.focus__samples-row    /* flex wrap, 6px gap */
.focus__sample         /* mono font-family, 12px — inherits .chip styles */
```

**Preview panel:**
```css
.focus__preview        /* right column card: --paper-2 bg, 18px radius, box-shadow in light mode */
.focus__preview-glow   /* absolute radial glow, bottom-right corner; yellow in .is-ai */
.focus__preview-head   /* flex row: eyebrow + status badge */
.focus__preview-eyebrow  /* 11px uppercase, --ink-2 */
.focus__preview-status   /* pill badge with coloured dot */
.focus__preview-status--ok   /* green (#1F8E5A) */
.focus__preview-status--warn /* amber (#C97A1F) */
.focus__preview-card   /* inner card, --paper bg, 14px radius */
.focus__preview-kicker /* small uppercase pill label inside card */
```

**Wireframe primitives:**
```css
.mini-nav        /* 10px tall bar, 38% wide — nav skeleton */
.mini-line       /* 12px tall full-width bar */
.mini-line--mid     /* 78% width */
.mini-line--short   /* 58% width */
.mini-line--hidden  /* 36% width, 0.35 opacity — represents missing/blocked content */
.mini-box        /* 96px tall dashed placeholder (the "hero" block) */
.mini-box-label  /* mono label inside mini-box */
.mini-meter      /* score bar row: track + fill + label */
.mini-meter-fill /* width: 92% green (human) → 38% amber (ai), animated 380ms */
.mini-grid       /* 2-col grid for human-view callouts */
.mini-callout    /* card cell inside mini-grid */
```

**AI signal checklist (shown only in `.is-ai` mode):**
```css
.mini-signals         /* 2-column grid, gap 6px */
.mini-signal          /* flex row: icon + text, 7px 8px padding, --line-strong border */
.mini-signal-icon     /* 14×14 circle, coloured by --fail/--warn/--ok modifier */
.mini-signal-text     /* mono 11px, --muted */
.mini-signal--fail    /* red icon (--danger) */
.mini-signal--warn    /* amber icon (--warn) */
.mini-signal--ok      /* green icon (--ok) */
```

**AI-view modifier (`.focus__preview.is-ai`):**
```css
/* panel border, kicker, mini-box, callouts all gain yellow (#FFD803) tint */
/* uses color-mix(in srgb, var(--accent) X%, var(--line)) — theme-adaptive */
/* mini-meter-fill → 38% width, --warn amber */
/* mini-line--hidden → shrinks to 26%, opacity 0.18 */
```

**Fetch-status pill (UrlInput component):**
```css
/* border bumped from 1px --line → 1.5px --line-strong for light mode legibility */
```

**Responsive:**
```css
@media (max-width: 960px) {
  .focus__split → 1-column, stacks preview below form
  .focus__preview → min-height: 380px
  .focus__sub → min-height: 72px
}
```

---

## 3. What was intentionally removed

| Removed | Reason |
|---|---|
| `focus__inner` layout | Replaced by `focus__split` two-column grid |
| Old headline "Test AI citation readiness." | Replaced by "See your page like an AI does." |
| Old paragraph copy | Replaced by toggling `VIEW_COPY` subline |
| Trust pills (10s scan · No signup · Public pages only) | Low contrast, low signal — removed on user request |
| Eyebrow "Crest.ai · AI Visibility Lab" | Redundant (logo already present); replaced with `● Live · Free audit` |
| Two vague callout cards in AI view | Replaced by 6-item signal checklist (schema, meta, alt, JS render, author, canonical) |

---

## Pull strategy (when merging new main commits)

```bash
# 1. stash local changes
git stash

# 2. fetch and merge main
git fetch origin
git merge origin/main

# 3. restore our changes
git stash pop

# 4. if conflicts → resolve, then commit
# 5. push to final_changes or open a PR
git push origin final_changes
```

Files most likely to conflict:
- `frontend/src/routes/Overview.jsx` — FocusGate is a full rewrite; if main touched lines above `FocusGate` (the utility functions) there should be no conflict
- `frontend/src/index.css` — root token block and the new `.focus__split` block appended at the end; conflicts only if main also touched `:root {}` or added classes after `.focus__url-section`
