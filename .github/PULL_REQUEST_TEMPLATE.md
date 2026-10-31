## Summary

<!-- What does this change do, and why? -->

## Changes

- [ ] Backend change
- [ ] Frontend change
- [ ] Migration (Alembic revision)
- [ ] Touches the platform admin console (frozen for v1 — requires approval)

## Verification

- [ ] `make lint` passes (backend)
- [ ] `make test-backend` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run test` passes
- [ ] `npm run build` passes
- [ ] Platform admin or shared-UI change → `make e2e` plus affected house
      script(s) (`make e2e-gym`, etc.) run sequentially
- [ ] CI checks green: `Backend lint + tests` and `Frontend build`
