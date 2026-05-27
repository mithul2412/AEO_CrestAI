# Contributing

## Development workflow

1. Create a focused branch from `main` using `feature/`, `fix/`, `docs/`, or
   `chore/` as the prefix.
2. Keep commits cohesive and use an imperative subject line.
3. Add or update deterministic tests for behavior changes.
4. Run the backend tests, frontend tests, and frontend production build.
5. Open a pull request describing the problem, approach, validation, and any
   provider-dependent behavior that was not exercised.

## Required checks

```bash
cd backend
npm ci
npm test

cd ../frontend
npm ci
npm test
npm run build
```

Tests must not depend on real provider credentials. Mock network boundaries and
keep live benchmarks separate from the default verification path.

## Security and generated data

- Never commit `.env` files or provider credentials.
- Never commit generated agentic profiles, benchmark output, build artifacts,
  dependency directories, or local caches.
