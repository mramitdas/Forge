# Security Policy

## Supported versions

Forge is deployed continuously from the `prod` branch. Only the latest
production deployment receives security fixes.

| Version | Supported |
|---------|-----------|
| latest (`prod`) | :white_check_mark: |
| older deployments | :x: |

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

- Email the maintainer via the address on the GitHub profile
  ([@mramitdas](https://github.com/mramitdas)), or
- Use GitHub's private vulnerability reporting:
  **Security → Advisories → Report a vulnerability**.

Include a description, reproduction steps, and the affected component
(frontend, API, database/RLS, auth). You can expect an acknowledgement within
a few days and a remediation plan for confirmed issues.

## Scope

In scope: authentication/authorization, tenant isolation (row-level security),
SQL injection, secret exposure, and privilege escalation.

Out of scope: findings that require an already-compromised production secret,
and denial-of-service reports from self-hosted/dev environments.

## Secret handling

Never commit `.env` files or credentials. The repository ignores `.env*`
except `*.env.example`; production secrets live only in the deployment
environment (Vercel environment variables / the database secret store).
