# Agentic Hosted Profile Storage

The Agentic AI Readiness Layer currently uses an in-memory backend store for generated canonical profiles, artifacts, validation results, and engine-readiness readouts.

This means hosted profiles are available only while the backend process is running:

```txt
POST /agentic/generate -> saves profile in memory
GET /agent/:slug       -> reads profile from memory
backend restart        -> stored profiles are cleared
```

This is intentional for the local implementation. A persistent database or object store should be added before relying on hosted profiles in production.
