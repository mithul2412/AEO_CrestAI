# Security Policy

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for sensitive findings. If
private reporting is unavailable, contact the maintainer at
`mithulraaj24@gmail.com` and avoid including credentials, exploit details, or
private user data in a public issue.

## Secrets

The application reads provider credentials from `backend/.env`. Never commit
that file or paste real credentials into issues, pull requests, fixtures, or
screenshots. Copy `backend/.env.example` and supply local values instead.

If a credential is exposed, revoke and rotate it before removing it from Git
history. Deleting a secret from the latest revision does not remove it from
earlier commits.
