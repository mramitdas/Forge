# AGENTS.md

## Platform admin panel is FROZEN for v1

The platform admin console is locked for v1. Treat it as a frozen surface:
no changes to its behavior, layout, routes, or data contract without explicit
user approval.

### Frozen surface

- Pages: `apps/web/src/app/(app)/platform/**` (overview, gyms, owners,
  subscriptions/tier cards, revenue) and the platform nav in
  `apps/web/src/app/(app)/layout.tsx`.
- Backend API: every `/api/v1/platform/*` route and its request/response
  schemas in `backend/app/modules/tenancy/` (service, api, schemas, models).
- Migrations that add/alter platform-admin tables (subscription_tiers,
  gym_subscription_events).

### Rules

1. Do not modify any file under the frozen surface unless the user explicitly
   asks to change the platform admin panel.
2. When a task requires touching shared files that the panel depends on
   (`apps/web/src/components/ui.tsx`, `components/skeleton*.tsx`,
   `lib/hooks.ts`, `lib/api.ts`, `(app)/layout.tsx`), the panel's behavior
   must remain byte-for-byte identical.
3. After ANY change to shared files listed above (even unrelated to the
   panel), run the regression gate before finishing:

   ```bash
   cd apps/web && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs
   ```

   All checks must pass (100%). This script provisions and deletes a throwaway
   gym, exercises gym/owner management, tier CRUD, and the revenue chart, so
   it also validates the backend `platform_*` API.
