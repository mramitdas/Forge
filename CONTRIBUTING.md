# Contributing to Forge

Thanks for contributing! A few ground rules keep the repo healthy.

## Platform admin console is frozen for v1

The platform admin panel (`/platform` pages, `/api/v1/platform/*` routes, and
the related migrations) is locked for v1. Do not change its behavior, layout,
routes, or data contract. If a change requires touching it, open an issue first.

After any change to shared files the panel depends on
(`components/ui.tsx`, `components/skeleton*.tsx`, `lib/hooks.ts`,
`lib/api.ts`, `(app)/layout.tsx`), run the platform e2e suite and the
affected house scripts:

```bash
make e2e               # full platform Playwright suite (workers=1)
make e2e-gym           # plus any house script for your domain
```

All regression gates must pass 100%.

## Development

- Backend: Python 3.11+, FastAPI + SQLAlchemy async. Run `make lint`
  (ruff) and `make test-backend` (pytest, 90% coverage gate).
- Frontend: Next.js 15, client components only, TanStack Query for data.
  Run `npx tsc --noEmit`, `npm run test`, and `npm run build` before
  opening a PR.
- Migrations: Alembic revisions in `backend/alembic/versions/`; apply with
  `make migrate`.
- Code quality: mypy (`mypy app`), ESLint (`npm run lint`); pre-commit
  hooks run ruff and repo hygiene checks.

## Pull requests

- Keep changes focused; a PR should do one thing.
- Add or update backend tests in `backend/tests/` for new behavior.
- Reference the issue you're addressing, if any.

## License

By contributing, you agree your contributions are licensed under the [MIT license](LICENSE).
