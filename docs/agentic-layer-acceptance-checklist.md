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
- [ ] In-memory profile storage limitation is documented.
- [ ] No persistent DB is assumed.
- [ ] No scheduler is assumed.

## Final Checks

- [ ] `cd backend && npm test`
- [ ] `cd frontend && npm test`
- [ ] `cd frontend && npm run build`
- [ ] No push performed.
