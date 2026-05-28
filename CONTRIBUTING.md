# Contributing

This file covers how to contribute, who built this project, and how to report security issues — kept together so there's one place to look instead of three.

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

## Generated data and secrets

- Never commit `.env` files or provider credentials.
- Never commit generated agentic profiles, benchmark output, build artifacts,
  dependency directories, or local caches.
- Report sensitive findings according to the Security section below.

---

## Credits

Crest.AI was built as a collaborative project for the UW Dempsey Startup
Competition 2026, organized by the Foster School of Business.

Contributors represented in the project history include:

- Mithul Raaj
- Uva Venkata Kaushik Bolla
- Balaji Boopal

---

## Security

### Reporting a vulnerability

Please use GitHub's private vulnerability reporting for sensitive findings. If
private reporting is unavailable, contact the maintainer at
`mithulraaj24@gmail.com` and avoid including credentials, exploit details, or
private user data in a public issue.

### Secrets

The application reads provider credentials from `backend/.env`. Never commit
that file or paste real credentials into issues, pull requests, fixtures, or
screenshots. Copy `backend/.env.example` and supply local values instead.

If a credential is exposed, revoke and rotate it before removing it from Git
history. Deleting a secret from the latest revision does not remove it from
earlier commits.
