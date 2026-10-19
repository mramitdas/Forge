# Deferred-Fixes Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all seven deferred findings per `docs/superpowers/specs/2026-10-19-deferred-fixes-design.md`: roles-delete feature, tenant tier view, billing pagination + SQL summary + server `q` search, unlabeled-controls long tail, granted-only member stats, E2E fixture teardown, and misc hardening (order tiebreakers, in-flight guards, Modal/Toast a11y).

**Architecture:** Two new backend endpoints (`DELETE /permissions/roles/{id}`, `GET /subscriptions/tier`), one response-shape change (`GET /invoices` → paged dict, `GET /invoices/summary` added), additive order-tiebreakers on 9 list queries, and shared-frontend hardening in `components/ui.tsx` (Modal a11y + Toast portal). Frozen platform panel: attribute-only touches + two behavior-preserving e2e/backend retargets — platform gate must stay 22/22 after every shared/platform touch.

**Tech Stack:** Next.js 15 / React Query / FastAPI / SQLAlchemy / pytest+httpx / Playwright e2e.

**Ground rules:**
- Dev servers RUNNING on :3000/:8000 — do not restart (if dead: `make dev` / `make web` from repo root).
- Frozen platform surface (`AGENTS.md`): platform pages/API behavior byte-identical except user-approved attribute-only edits and the tier-e2e retarget. After ANY change to `ui.tsx`, `hooks.ts`, `api.ts`, platform pages, `(app)/layout.tsx`, or backend routes: run `cd apps/web && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs` — must be 22/22 before finishing the task.
- Never `git add -A`; stage only task files. Commit directly to `main` after each task.
- Backend gates from `backend/`: `.venv/bin/python -m pytest -q` (baseline **76 passed**), `.venv/bin/ruff check app tests scripts` (clean).
- Frontend gates from `apps/web`: `npx tsc --noEmit` (clean), `npm test` (baseline **8 pass**; glob `src/lib/*.test.ts`, runner is `node:test`).
- e2e scripts self-provision and share one dev DB — run SEQUENTIALLY. Baselines: platform **22**, plans **9**, member_account **13**, role_visibility **18**, frontdesk **23**, gym_ops **30**, expenses **13**. Expected new counts after this round: member_account **15**, frontdesk **27+** (4 teardown + new billing/tier-card checks), gym_ops **31–33**, platform **22** (unchanged).
- Role logins: platform `admin@gym-erp.dev`/`admin-pass-123`; owner `demo-owner@gym-erp.dev`/`owner-pass-123`; evolve `mramitdas99@gmail.com`/`evolve-import-2026`; manager `branch-manager@gym-erp.dev`/`manager-pass-123`; receptionist `receptionist@gym-erp.dev`/`receptionist-pass-123`; trainer `trainer@gym-erp.dev`/`trainer-pass-123`.
- JSON error contract: HTTP errors serialize as `{"detail": {"error": {code, message, details}}}` (`backend/app/core/errors.py:to_http_exception`). Pytest asserts read `response.json()["detail"]["error"]`; FE `ApiError.detail` = `body.error ?? body.detail ?? body` so server messages live at `detail.error.message` (wrapped shape).
- Modal e2e selectors that match today (`div.fixed.inset-0` in gym_ops) must keep working — keep the fixed-inset overlay wrapper.

**Fix → task map (spec numbering):**

| Deferred finding | Task |
|------------------|------|
| 1 roles delete (BE) | Task 1 |
| 1 roles delete (FE + save guard) | Task 2 (GATE) |
| 2 tenant tier endpoint | Task 3 |
| 2 tenant tier card | Task 4 (GATE) |
| 3 billing endpoints (page/q/summary + tiebreak) | Task 5 |
| 3 billing UI + e2e `.items` contracts + billing/tier-card e2e checks | Task 6 (GATE) |
| 4 tenant unlabeled controls | Task 7 |
| 4 platform unlabeled controls (attribute-only) | Task 8 (GATE) |
| 7 Modal + Toast a11y | Task 9 (GATE) |
| 7 ordering tiebreakers (remaining 7 sites) + tests | Task 10 (GATE) |
| 7 in-flight guard: branches saveEdit | Task 11 |
| 5 granted-only member stats + FE unit test | Task 12 |
| 6 E2E teardowns + platform tier retarget | Task 13 (GATE) |
| final battery + report | Task 14 |

**File structure:**

```
backend/app/modules/identity/{service,api}.py           delete_role (Task 1)
backend/tests/test_roles_delete.py                      new (Task 1)
apps/web/src/lib/hooks.ts                               useDeleteRole/tenant-tier/invoices page+summary (2,4,6)
apps/web/src/app/(app)/roles/page.tsx                   delete UI + save guard (Task 2)
backend/app/modules/tenancy/{api,schemas}.py            GET /subscriptions/tier (Task 3)
backend/app/main.py                                     subscriptions_router (Task 3)
backend/tests/test_tenant_tier.py                       new (Task 3)
apps/web/src/app/(app)/subscriptions/page.tsx           Gym plan card (Task 4)
backend/app/modules/billing/{api,service,schemas}.py    paging/q/summary (Task 5)
backend/tests/test_billing_pagination.py                new (Task 5)
apps/web/src/lib/types.ts                               InvoiceSummaryOut/TenantTierOut (4,6)
apps/web/src/app/(app)/billing/page.tsx                 paged table + summary (Task 6)
apps/web/e2e/{frontdesk,gym_ops}_verify.cjs             .items + new checks (Task 6)
apps/web/src/app/(app)/{members,members/[id],checkins,branches}/page.tsx, (app)/page.tsx  a11y attrs (Task 7)
apps/web/src/app/(app)/platform/{page,gyms,owners,subscriptions}/page.tsx  a11y attrs (Task 8)
apps/web/src/components/ui.tsx                          Modal/Toast a11y (Task 9)
backend/app/modules/{attendance,members,membership,notifications,tenancy}/service.py  tiebreakers (Task 10)
backend/tests/test_order_tiebreakers.py                 new (Task 10)
apps/web/src/app/(app)/branches/page.tsx                saveEdit guard (Task 11)
apps/web/src/lib/adapters.ts + adapters.test.ts         granted-only filter (Task 12)
apps/web/e2e/{frontdesk,gym_ops,member_account,platform_admin}_verify.cjs  teardowns (Task 13)
```

---

### Task 1: Roles delete API

**Files:**
- Modify: `backend/app/modules/identity/service.py` (after `update_role`, ends :349), `backend/app/modules/identity/api.py` (after `create_role`, ~:201-220, before employees routes)
- Test: `backend/tests/test_roles_delete.py` (new)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_roles_delete.py`:

```python
from __future__ import annotations

from tests.helpers import login, provision_gym


async def test_delete_custom_role_soft_deletes_and_list_excludes(client, platform_token):
    await provision_gym(client, platform_token, "roledelete")
    tokens = await login(client, "owner-roledelete@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    created = await client.post(
        "/api/v1/permissions/roles",
        headers=headers,
        json={"name": "Temp Role", "permission_codes": ["members.view"]},
    )
    assert created.status_code == 201, created.text
    role_id = created.json()["id"]

    deleted = await client.delete(
        f"/api/v1/permissions/roles/{role_id}", headers=headers
    )
    assert deleted.status_code == 204, deleted.text

    listed = await client.get("/api/v1/permissions/roles", headers=headers)
    assert listed.status_code == 200
    assert role_id not in [r["id"] for r in listed.json()]

    again = await client.delete(f"/api/v1/permissions/roles/{role_id}", headers=headers)
    assert again.status_code == 404, again.text


async def test_delete_role_in_use_is_409_and_locked_is_422(client, platform_token):
    await provision_gym(client, platform_token, "roleinuse")
    tokens = await login(client, "owner-roleinuse@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    role = await client.post(
        "/api/v1/permissions/roles",
        headers=headers,
        json={"name": "Staff Role", "permission_codes": ["members.view"]},
    )
    assert role.status_code == 201, role.text
    role_id = role.json()["id"]

    emp = await client.post(
        "/api/v1/employees",
        headers=headers,
        json={
            "email": "staff-roleinuse@example.com",
            "full_name": "Staff",
            "password": "staff-pass-123",
            "role_ids": [role_id],
        },
    )
    assert emp.status_code == 201, emp.text

    in_use = await client.delete(f"/api/v1/permissions/roles/{role_id}", headers=headers)
    assert in_use.status_code == 409, in_use.text
    err = in_use.json()["detail"]["error"]
    assert err["code"] == "ROLE_IN_USE"
    assert "1 user" in err["message"]

    # Locked seeded role (Receptionist) refuses deletion before the usage check.
    listed = (await client.get("/api/v1/permissions/roles", headers=headers)).json()
    receptionist = next(r for r in listed if r["name"] == "Receptionist")
    locked = await client.delete(
        f"/api/v1/permissions/roles/{receptionist['id']}", headers=headers
    )
    assert locked.status_code == 422, locked.text
    assert locked.json()["detail"]["error"]["code"] == "ROLE_LOCKED"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && .venv/bin/python -m pytest tests/test_roles_delete.py -q
```

Expect 2 failed (405/404 — route missing).

- [ ] **Step 3: Implement `delete_role` in the service**

In `backend/app/modules/identity/service.py`: change the sqlalchemy import to `from sqlalchemy import func, select` (today it is `from sqlalchemy import select`), and add after `update_role` (which ends :349):

```python
async def delete_role(
    session: AsyncSession,
    *,
    role_id: uuid.UUID,
    tenant_id: uuid.UUID,
    actor_id: uuid.UUID | None = None,
) -> None:
    """Soft-delete a custom role. Refuses locked roles and roles still in use."""
    role = await session.get(Role, role_id)
    if role is None or role.tenant_id != tenant_id or role.deleted_at is not None:
        raise NotFoundError("Role not found", code="NOT_FOUND")
    if not role.is_editable:
        raise ValidationError(
            "This role is locked and cannot be deleted", code="ROLE_LOCKED"
        )
    assignments = await session.scalar(
        select(func.count()).select_from(UserRole).where(UserRole.role_id == role_id)
    )
    if assignments:
        raise ConflictError(
            f"Role is assigned to {assignments} user(s) and cannot be deleted",
            code="ROLE_IN_USE",
        )
    role.deleted_at = datetime.now(UTC)
    role.deleted_by = actor_id
    await session.flush()
```

Notes: `UserRole`, `datetime`/`UTC`, `ConflictError` are already imported in this file. `get_effective_permissions` already joins `deleted_at IS NULL` (:267), so permissions revoke immediately.

- [ ] **Step 4: Add the route**

In `backend/app/modules/identity/api.py`, after the `create_role` route (ends :220), before the first `@employees_router` route:

```python
@roles_router.delete("/roles/{role_id}", status_code=204)
async def delete_role(
    role_id: uuid.UUID,
    actor: Annotated[Actor, Depends(require_permission("roles.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> None:
    await identity_svc.delete_role(
        session, role_id=role_id, tenant_id=actor.tenant_id, actor_id=actor.user_id
    )
```

- [ ] **Step 5: Run the gates**

```bash
cd backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check app tests scripts
```

Expect 78 passed, ruff clean.

- [ ] **Step 6: Commit**

`git add backend/app/modules/identity/service.py backend/app/modules/identity/api.py backend/tests/test_roles_delete.py && git commit -m "feat(roles): DELETE /permissions/roles/{id} — soft, 409 in-use, refuse locked"`

---

### Task 2: Roles delete UI + save in-flight guard (GATE)

**Files:**
- Modify: `apps/web/src/lib/hooks.ts` (after `useUpdateRole`, ~:1076-1085), `apps/web/src/app/(app)/roles/page.tsx`

- [ ] **Step 1: Add `useDeleteRole` to hooks.ts**

After `useUpdateRole` in `apps/web/src/lib/hooks.ts`:

```ts
export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) =>
      apiFetch<void>(`/permissions/roles/${roleId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
    },
  });
}
```

- [ ] **Step 2: Wire the confirm-dialog UI in roles/page.tsx**

1. Extend imports: add `useDeleteRole` to the hooks import (:7), add `RoleOut` is not needed — use a local target shape.
2. After `const addGuard = useInFlight();` (:35) add:

```ts
  const deleteRole = useDeleteRole();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const saveGuard = useInFlight();
```

3. Replace `save()` (:82-94) with the guarded version:

```ts
  async function save(roleId: string, name: string) {
    const codes = draft[roleId] ? [...draft[roleId]] : [];
    await saveGuard.run(async () => {
      setSaving(roleId);
      try {
        await updateRole.mutateAsync({ roleId, body: { permission_codes: codes } });
        setDraft((d) => ({ ...d, [roleId]: new Set(codes) }));
        setToast({ type: "success", message: `Saved ${name} permissions` });
      } catch {
        setToast({ type: "error", message: "Could not save role — it may be locked" });
      } finally {
        setSaving(null);
      }
    });
  }
```

(The button already disables on `saving === role.id`, but that state lands a render late — two same-tick clicks currently fire two PATCHes.)

4. Add the confirm handler after `submitNewRole` (:136):

```ts
  async function confirmDeleteRole() {
    if (!deleteTarget) return;
    try {
      await deleteRole.mutateAsync(deleteTarget.id);
      setToast({ type: "success", message: `${deleteTarget.name} deleted` });
      setDeleteTarget(null);
    } catch (err) {
      const d = (err as { detail?: { message?: string; error?: { message?: string } } })?.detail;
      setToast({
        type: "error",
        message: d?.error?.message ?? d?.message ?? "Could not delete role",
      });
    }
  }
```

5. In the card header action slot (:202-211), after the two existing `role.is_editable && …` branches, add:

```tsx
                {role.is_editable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-2 text-red hover:bg-red-soft"
                    onClick={() => setDeleteTarget({ id: role.id, name: role.name })}
                  >
                    Delete
                  </Button>
                )}
```

6. Before the closing toast (`:339`), add the confirm Modal copying the plans idiom (`plans/page.tsx:673-687`):

```tsx
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name ?? ""}?`}
        subtitle="Staff assigned to this role will lose its permissions"
      >
        <p className="text-[13px] text-ink-soft">
          Deleting {deleteTarget?.name ?? "this role"} is permanent and cannot be undone.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={deleteRole.isPending}
            onClick={confirmDeleteRole}
          >
            Delete role
          </Button>
        </div>
      </Modal>
```

- [ ] **Step 3: Verify**

```bash
cd apps/web && npx tsc --noEmit && npm test
NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs   # 22/22 (hooks.ts touched)
```

Manual spot-check (Chrome DevTools, servers running): owner → /roles → create role `Delete Probe` (1 perm) → Delete button → confirm → toast `Delete Probe deleted`, card gone; locked Receptionist card has no Delete button.

- [ ] **Step 4: Commit**

`git add apps/web/src/lib/hooks.ts "apps/web/src/app/(app)/roles/page.tsx" && git commit -m "feat(roles): delete-role confirm UI + synchronous save guard"`

---

### Task 3: Tenant tier endpoint

**Files:**
- Modify: `backend/app/modules/tenancy/api.py` (new router + route), `backend/app/modules/tenancy/schemas.py` (after `GymSettingsOut`, ~:46-50), `backend/app/main.py` (:28 import, :113 registration)
- Test: `backend/tests/test_tenant_tier.py` (new)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_tenant_tier.py`:

```python
from __future__ import annotations

from sqlalchemy import update

from app.db.session import get_sessionmaker
from app.modules.members.models import Member
from app.modules.tenancy.models import Gym
from tests.helpers import login, provision_gym


async def test_owner_sees_tier_with_usage(client, platform_token):
    gym = await provision_gym(client, platform_token, "tiersee")
    tokens = await login(client, "owner-tiersee@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    res = await client.get("/api/v1/subscriptions/tier", headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["tier_code"] == gym["tier_code"] == "starter"
    assert body["tier_name"] == "Starter"
    assert body["branches_used"] == 1
    assert body["members_used"] == 0
    assert body["gym_status"] == "active"

    created = await client.post(
        "/api/v1/members",
        headers=headers,
        json={
            "first_name": "Tier",
            "last_name": "Member",
            "email": "tier-member-tiersee@example.com",
            "gender": "Male",
            "status": "lead",
        },
    )
    assert created.status_code == 201, created.text
    res2 = await client.get("/api/v1/subscriptions/tier", headers=headers)
    assert res2.json()["members_used"] == 1


async def test_staff_without_subscription_view_gets_403(client, platform_token):
    await provision_gym(client, platform_token, "tier403")
    owner = await login(client, "owner-tier403@example.com", "owner-pass-123")
    owner_headers = {"Authorization": f"Bearer {owner['access_token']}"}

    role = await client.post(
        "/api/v1/permissions/roles",
        headers=owner_headers,
        json={"name": "Viewers", "permission_codes": ["members.view"]},
    )
    assert role.status_code == 201, role.text
    emp = await client.post(
        "/api/v1/employees",
        headers=owner_headers,
        json={
            "email": "viewer-tier403@example.com",
            "full_name": "Viewer",
            "password": "viewer-pass-123",
            "role_ids": [role.json()["id"]],
        },
    )
    assert emp.status_code == 201, emp.text
    viewer = await login(client, "viewer-tier403@example.com", "viewer-pass-123")
    res = await client.get(
        "/api/v1/subscriptions/tier",
        headers={"Authorization": f"Bearer {viewer['access_token']}"},
    )
    assert res.status_code == 403, res.text


async def test_missing_tier_row_falls_back_to_code(client, platform_token):
    await provision_gym(client, platform_token, "tierghost")
    tokens = await login(client, "owner-tierghost@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    sm = get_sessionmaker()
    async with sm() as session:
        await session.execute(
            update(Gym).where(Gym.slug == "tierghost").values(tier_code="ghost-tier")
        )
        await session.commit()

    res = await client.get("/api/v1/subscriptions/tier", headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["tier_code"] == "ghost-tier"
    assert body["tier_name"] == "ghost-tier"
    assert body["price_minor"] is None
    assert body["max_branches"] is None
```

(If `get_sessionmaker` import path differs, mirror `backend/tests/conftest.py:17`.)

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && .venv/bin/python -m pytest tests/test_tenant_tier.py -q
```

- [ ] **Step 3: Schema**

In `backend/app/modules/tenancy/schemas.py`, after `GymSettingsOut` (:46-50):

```python
class TenantTierOut(BaseModel):
    tier_code: str
    tier_name: str
    description: str | None = None
    price_minor: int | None = None
    max_branches: int | None = None
    max_members: int | None = None
    branches_used: int
    members_used: int
    gym_status: str
```

- [ ] **Step 4: Route**

In `backend/app/modules/tenancy/api.py`: add `TenantTierOut` to the schemas import (:24-43), add a new router next to the existing ones (:60-62):

```python
subscriptions_router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])
```

and after the settings routes (file end area), the route:

```python
@subscriptions_router.get("/tier", response_model=TenantTierOut)
async def get_tenant_tier(
    actor: Annotated[Actor, Depends(require_permission("membership.subscriptions.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> TenantTierOut:
    gym = await session.get(Gym, actor.tenant_id)
    if gym is None:
        raise NotFoundError("Gym not found", code="NOT_FOUND")
    tier = await session.get(SubscriptionTier, gym.tier_code)
    branches_used = (
        await session.scalar(
            select(func.count())
            .select_from(Branch)
            .where(Branch.gym_id == actor.tenant_id, Branch.deleted_at.is_(None))
        )
        or 0
    )
    members_used = (
        await session.scalar(
            select(func.count())
            .select_from(Member)
            .where(Member.tenant_id == actor.tenant_id, Member.deleted_at.is_(None))
        )
        or 0
    )
    if tier is None:
        return TenantTierOut(
            tier_code=gym.tier_code,
            tier_name=gym.tier_code,
            branches_used=branches_used,
            members_used=members_used,
            gym_status=gym.status,
        )
    return TenantTierOut(
        tier_code=tier.code,
        tier_name=tier.name,
        description=tier.description,
        price_minor=tier.price_minor,
        max_branches=tier.max_branches,
        max_members=tier.max_members,
        branches_used=branches_used,
        members_used=members_used,
        gym_status=gym.status,
    )
```

All imports (`func`, `select`, `Gym`, `Branch`, `Member`, `SubscriptionTier`, `NotFoundError`) already exist in this file.

- [ ] **Step 5: Register the router**

In `backend/app/main.py`: extend the tenancy import (:28) with `subscriptions_router`, and after the `settings_router` include (:113):

```python
    app.include_router(subscriptions_router, prefix=settings.api_prefix, dependencies=gate)
```

- [ ] **Step 6: Gates + commit**

```bash
cd backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check app tests scripts
```

Expect 81 passed. Commit: `git add backend/app/modules/tenancy/api.py backend/app/modules/tenancy/schemas.py backend/app/main.py backend/tests/test_tenant_tier.py && git commit -m "feat(tier): GET /subscriptions/tier — tenant plan view with usage"`

---

### Task 4: Tenant tier card (GATE)

**Files:**
- Modify: `apps/web/src/lib/types.ts` (after `InvoiceOut`, ~:75-90), `apps/web/src/lib/hooks.ts` (after `useInvoiceSummary` area or near `useSubscriptionsData`), `apps/web/src/app/(app)/subscriptions/page.tsx`

- [ ] **Step 1: Type**

In `types.ts`:

```ts
export interface TenantTierOut {
  tier_code: string;
  tier_name: string;
  description: string | null;
  price_minor: number | null;
  max_branches: number | null;
  max_members: number | null;
  branches_used: number;
  members_used: number;
  gym_status: string;
}
```

Add `TenantTierOut` to the hooks.ts type import block (:12-41).

- [ ] **Step 2: Hook**

In `hooks.ts`, near the other tenant data hooks:

```ts
export function useTenantTier(): {
  tier: TenantTierOut | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const can = useCan();
  const q = useQuery({
    queryKey: ["tenant-tier"],
    queryFn: () => apiFetch<TenantTierOut>("/subscriptions/tier"),
    enabled: can("membership.subscriptions.view"),
  });
  return { tier: q.data, isLoading: q.isLoading, isError: q.isError };
}
```

- [ ] **Step 3: Card**

In `subscriptions/page.tsx`: add `useTenantTier` to the hooks import (:18-25), and inside the component after `can` (:39):

```ts
  const { tier, isLoading: tierLoading } = useTenantTier();
```

Render between the filter row and the table `<Async>` (:84-86):

```tsx
      {can("membership.subscriptions.view") && (
        <Card className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="kicker">Gym plan</p>
            <p className="mt-1 text-[15px] font-semibold tracking-tight">
              {tierLoading ? "…" : (tier?.tier_name ?? "—")}
              {tier?.description && (
                <span className="ml-2 text-[12px] font-normal text-ink-faint">
                  {tier.description}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-ink-soft">
            <span>
              {tier?.price_minor != null ? inr(tier.price_minor) + " / mo" : "Custom pricing"}
            </span>
            <span>
              Branches {tier?.branches_used ?? "—"}
              {tier ? ` of ${tier.max_branches ?? "∞"}` : ""}
            </span>
            <span>
              Members {tier?.members_used ?? "—"}
              {tier ? ` of ${tier.max_members ?? "∞"}` : ""}
            </span>
            <StatusBadge status={tier?.gym_status ?? "pending"} />
          </div>
        </Card>
      )}
```

(`inr` and `StatusBadge` are already imported in this page.)

- [ ] **Step 4: Gates + commit**

```bash
cd apps/web && npx tsc --noEmit && npm test
NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs   # 22/22 (hooks.ts touched)
```

Commit: `git add apps/web/src/lib/types.ts apps/web/src/lib/hooks.ts "apps/web/src/app/(app)/subscriptions/page.tsx" && git commit -m "feat(tier): Gym plan card on /subscriptions"`

---

### Task 5: Billing pagination + q + summary endpoints

**Files:**
- Modify: `backend/app/modules/billing/service.py` (:1-16 imports, :117-126 `list_invoices`), `backend/app/modules/billing/api.py` (:21-35 list route), `backend/app/modules/billing/schemas.py`
- Test: `backend/tests/test_billing_pagination.py` (new)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_billing_pagination.py`:

```python
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import update

from app.db.session import get_sessionmaker
from app.modules.billing.models import Invoice
from tests.helpers import login, provision_gym


async def _seed_gym_with_invoices(client, platform_token, slug: str):
    """Owner + 3 members each subscribed → 3 open invoices (tied issue_date)."""
    await provision_gym(client, platform_token, slug)
    tokens = await login(client, f"owner-{slug}@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    plan = await client.post(
        "/api/v1/plans",
        headers=headers,
        json={
            "name": f"Bill Plan {slug}",
            "slug": f"bill-plan-{slug}",
            "billing_period": "monthly",
            "amount_minor": 100000,
        },
    )
    assert plan.status_code == 201, plan.text
    inv_ids = []
    for i in range(3):
        member = await client.post(
            "/api/v1/members",
            headers=headers,
            json={
                "first_name": f"Buddy{i}",
                "last_name": "Rawat",
                "email": f"buddy{i}-{slug}@example.com",
                "gender": "Male",
                "status": "active",
            },
        )
        assert member.status_code == 201, member.text
        sub = await client.post(
            "/api/v1/plans/subscribe",
            headers=headers,
            json={
                "member_id": member.json()["id"],
                "plan_id": plan.json()["id"],
            },
        )
        assert sub.status_code == 201, sub.text
        inv = await client.get(
            "/api/v1/invoices",
            headers=headers,
            params={"member_id": member.json()["id"]},
        )
        inv_ids.append(inv.json()["items"][0]["id"])
    # Force identical issue_date so the id tiebreaker is exercised.
    sm = get_sessionmaker()
    async with sm() as session:
        await session.execute(update(Invoice).values(issue_date=datetime.now(UTC)))
        await session.commit()
    return headers, inv_ids


async def test_invoices_offset_pagination_q_and_member_filter(client, platform_token):
    headers, inv_ids = await _seed_gym_with_invoices(client, platform_token, "invpage")

    # Paged contract: dict with items/total/page/page_size.
    paged: list[str] = []
    for page in (1, 2):
        res = await client.get(
            "/api/v1/invoices",
            headers=headers,
            params={"page": page, "page_size": 2},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["total"] >= 3
        assert body["page"] == page
        assert body["page_size"] == 2
        paged.extend(item["id"] for item in body["items"])
    assert len(paged) == len(set(paged)), "no duplicate rows across pages"

    # Stable order for tied issue_date: id DESC.
    res = await client.get(
        "/api/v1/invoices", headers=headers, params={"page_size": 100}
    )
    seeded_order = [
        i["id"]
        for i in res.json()["items"]
        if i["id"] in set(inv_ids)
    ]
    assert seeded_order == sorted(inv_ids, reverse=True)

    # member_id filter still works under the new shape.
    one = await client.get(
        "/api/v1/invoices",
        headers=headers,
        params={"member_id": inv_ids[0], "page_size": 100},
    )
    assert all(i["id"] in set(inv_ids) for i in one.json()["items"])
    assert one.json()["items"]

    # Server-side q: member name.
    by_name = await client.get(
        "/api/v1/invoices",
        headers=headers,
        params={"q": "buddy1", "page_size": 100},
    )
    assert by_name.status_code == 200
    assert by_name.json()["total"] == 1
    assert by_name.json()["items"][0]["id"] == inv_ids[1]

    # Server-side q: invoice number (case-insensitive).
    target = next(i for i in res.json()["items"] if i["id"] == inv_ids[2])
    by_number = await client.get(
        "/api/v1/invoices",
        headers=headers,
        params={"q": target["number"].lower(), "page_size": 100},
    )
    assert by_number.json()["total"] == 1
    assert by_number.json()["items"][0]["id"] == inv_ids[2]


async def test_invoice_summary_buckets(client, platform_token):
    headers, inv_ids = await _seed_gym_with_invoices(client, platform_token, "invsum")

    empty = await client.get("/api/v1/invoices/summary", headers=headers)
    assert empty.status_code == 200, empty.text
    body = empty.json()
    # 3 open invoices at ₹1000 each.
    assert body["outstanding_minor"] == 300000
    assert body["collected_minor"] == 0
    assert body["overdue_minor"] == 0

    pay = await client.post(
        f"/api/v1/invoices/{inv_ids[0]}/pay",
        headers=headers,
        json={"method": "cash", "idempotency_key": "sum-pay-1"},
    )
    assert pay.status_code == 200, pay.text
    void = await client.post(
        f"/api/v1/invoices/{inv_ids[1]}/void", headers=headers
    )
    assert void.status_code == 200, void.text

    after = (await client.get("/api/v1/invoices/summary", headers=headers)).json()
    assert after["outstanding_minor"] == 100000  # void excluded
    assert after["collected_minor"] == 100000
    assert after["overdue_minor"] == 0

    # Past-due partial counts its residual as overdue (Bug-10 semantics).
    sm = get_sessionmaker()
    async with sm() as session:
        await session.execute(
            update(Invoice)
            .where(Invoice.id == inv_ids[2])
            .values(
                status="partial",
                paid_minor=40000,
                due_date=datetime.now(UTC) - timedelta(days=3),
            )
        )
        await session.commit()
    past = (await client.get("/api/v1/invoices/summary", headers=headers)).json()
    assert past["outstanding_minor"] == 60000
    assert past["overdue_minor"] == 60000
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && .venv/bin/python -m pytest tests/test_billing_pagination.py -q
```

- [ ] **Step 3: Service**

In `billing/service.py`:
- imports: `from sqlalchemy import func, or_, select`; add `from app.kernel.pagination import OffsetPagination`; add `from app.modules.members.models import Member`.
- Replace `list_invoices` (:117-126) and add the summary function after it:

```python
async def list_invoices(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    pagination: OffsetPagination,
    member_id: uuid.UUID | None = None,
    q: str | None = None,
) -> tuple[list[Invoice], int]:
    stmt = select(Invoice).where(
        Invoice.tenant_id == tenant_id, Invoice.deleted_at.is_(None)
    )
    if member_id:
        stmt = stmt.where(Invoice.member_id == member_id)
    if q:
        like = f"%{q.lower()}%"
        full_name = func.lower(func.concat(Member.first_name, " ", Member.last_name))
        stmt = stmt.join(Member, Member.id == Invoice.member_id).where(
            or_(
                func.lower(Invoice.number).like(like),
                full_name.like(like),
            )
        )
    total = await session.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (
        await session.execute(
            stmt.order_by(Invoice.issue_date.desc(), Invoice.id.desc())
            .offset(pagination.offset())
            .limit(pagination.page_size)
        )
    ).scalars().all()
    return list(rows), total or 0


async def invoice_summary(
    session: AsyncSession, *, tenant_id: uuid.UUID
) -> dict[str, int]:
    live = (Invoice.tenant_id == tenant_id, Invoice.deleted_at.is_(None))
    open_like = Invoice.status.in_(["open", "partial"])
    now = datetime.now(UTC)

    outstanding = await session.scalar(
        select(func.coalesce(func.sum(Invoice.total_minor - Invoice.paid_minor), 0)).where(
            *live, open_like
        )
    )
    collected = await session.scalar(
        select(func.coalesce(func.sum(Invoice.paid_minor), 0)).where(
            *live, Invoice.status == "paid"
        )
    )
    overdue = await session.scalar(
        select(func.coalesce(func.sum(Invoice.total_minor - Invoice.paid_minor), 0)).where(
            *live, open_like, Invoice.due_date < now
        )
    )
    return {
        "outstanding_minor": int(outstanding or 0),
        "collected_minor": int(collected or 0),
        "overdue_minor": int(overdue or 0),
    }
```

- [ ] **Step 4: Schema**

In `billing/schemas.py`, add:

```python
class InvoiceSummaryOut(BaseModel):
    outstanding_minor: int
    collected_minor: int
    overdue_minor: int
```

- [ ] **Step 5: API**

In `billing/api.py`: add `InvoiceSummaryOut` and `OffsetPagination` imports (`from app.kernel.pagination import OffsetPagination`). Replace the list route (:21-35) and add the summary route after it:

```python
@router.get("", response_model=dict)
async def list_invoices(
    actor: Annotated[Actor, Depends(require_permission("billing.invoices.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
    member_id: Annotated[uuid.UUID | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=120)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    invoices, total = await billing_svc.list_invoices(
        session,
        tenant_id=actor.tenant_id,
        pagination=OffsetPagination(page=page, page_size=page_size),
        member_id=member_id,
        q=q,
    )
    items: list[InvoiceOut] = []
    for inv in invoices:
        loaded = await billing_svc.get_invoice(session, inv.id)
        items.append(InvoiceOut.model_validate(loaded))
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/summary", response_model=InvoiceSummaryOut)
async def invoice_summary(
    actor: Annotated[Actor, Depends(require_permission("billing.invoices.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> InvoiceSummaryOut:
    return InvoiceSummaryOut(
        **await billing_svc.invoice_summary(session, tenant_id=actor.tenant_id)
    )
```

(The per-row `get_invoice` line loads stay — now ≤100 rows per page.)

- [ ] **Step 6: Gates + commit**

```bash
cd backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check app tests scripts
```

Expect 83 passed. Commit: `git add backend/app/modules/billing/service.py backend/app/modules/billing/api.py backend/app/modules/billing/schemas.py backend/tests/test_billing_pagination.py && git commit -m "feat(billing): paged /invoices + q search + SQL /invoices/summary"`

---

### Task 6: Billing UI + e2e contract updates (GATE)

**Files:**
- Modify: `apps/web/src/lib/types.ts`, `apps/web/src/lib/hooks.ts` (replace `useInvoicesData` :476-488), `apps/web/src/app/(app)/billing/page.tsx`
- Modify: `apps/web/e2e/frontdesk_verify.cjs` (:103-106 + billing/subscriptions sections), `apps/web/e2e/gym_ops_verify.cjs` (:292, :332)

- [ ] **Step 1: Types**

In `types.ts` after `InvoiceOut`:

```ts
export interface InvoiceSummaryOut {
  outstanding_minor: number;
  collected_minor: number;
  overdue_minor: number;
}
```

In hooks.ts type imports add `InvoiceSummaryOut`.

- [ ] **Step 2: Hooks — replace `useInvoicesData`**

Delete `useInvoicesData` (:476-488) and add in its place:

```ts
export function useInvoicesPage(params: {
  page: number;
  pageSize: number;
  search?: string;
}): {
  invoices: InvoiceOut[];
  total: number;
  isLoading: boolean;
  isError: boolean;
} {
  const can = useCan();
  const q = useQuery({
    queryKey: ["invoices", "page", params],
    queryFn: () => {
      const sp = new URLSearchParams({
        page: String(params.page),
        page_size: String(params.pageSize),
      });
      if (params.search) sp.set("q", params.search);
      return apiFetch<PageOut<InvoiceOut>>(`/invoices?${sp.toString()}`);
    },
    placeholderData: keepPreviousData,
    enabled: can("billing.invoices.view"),
  });
  const page = q.data ?? { items: [] as InvoiceOut[], total: 0 };
  return {
    invoices: page.items,
    total: page.total ?? page.items.length,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

export function useInvoiceSummary(): {
  summary: InvoiceSummaryOut | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const can = useCan();
  const q = useQuery({
    queryKey: ["invoices", "summary"],
    queryFn: () => apiFetch<InvoiceSummaryOut>("/invoices/summary"),
    enabled: can("billing.invoices.view"),
  });
  return { summary: q.data, isLoading: q.isLoading, isError: q.isError };
}
```

(`usePayInvoice`/`useVoidInvoice` keep `["invoices"]` invalidations — react-query prefix-matches, so they also refresh `["invoices","summary"]` and `["invoices","page",…]`.)

- [ ] **Step 3: Rewrite billing/page.tsx**

1. Imports: drop `useInvoicesData`; add `useInvoiceSummary, useInvoicesPage`; add `useEffect` to the react import (:4).
2. Replace `SummaryCards` (:64-106):

```tsx
function SummaryCards() {
  const { summary, isLoading, isError } = useInvoiceSummary();

  return (
    <Async
      loading={isLoading}
      error={isError}
      skeleton={
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="p-4">
              <SkeletonText width="w-20" />
              <Skeleton className="mt-1.5 h-7 w-28" />
            </Card>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Outstanding", value: inr(summary?.outstanding_minor ?? 0), tone: "text-amber" },
          { label: "Collected", value: inr(summary?.collected_minor ?? 0), tone: "text-green" },
          { label: "Overdue", value: inr(summary?.overdue_minor ?? 0), tone: "text-red" },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <p className="text-[12px] font-medium text-ink-faint">{c.label}</p>
            <p className={`mt-1.5 text-[22px] font-semibold tracking-tight ${c.tone}`}>{c.value}</p>
          </Card>
        ))}
      </div>
    </Async>
  );
}
```

3. In `BillingPage` replace the data wiring (:112-136):

```tsx
  const PAGE_SIZE = 20;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { invoices, total, isLoading, isError } = useInvoicesPage({
    page,
    pageSize: PAGE_SIZE,
    search: search.trim() || undefined,
  });
```

Delete the `filtered` memo entirely (server-side search). Keep `memberMap`/`memberName`/`invoice`/`confirmPay`. Add the clamp effect (expenses idiom, expenses/page.tsx:76-78):

```tsx
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
```

4. Table body: `filtered.map` → `invoices.map` (:191); badge (:173-175):

```tsx
              <Badge tone="gray">
                {search.trim() ? `${invoices.length} of ${total}` : `${total} total`}
              </Badge>
```

Empty rows (:215-228): first condition `search.trim() && invoices.length === 0` text unchanged; second `!search.trim() && total === 0`.

5. After the closing `</table></Card></Async>` (:232), add the pager (expenses/page.tsx:184-195 idiom):

```tsx
      <Async loading={isLoading} error={isError} skeleton={null}>
        <div className="flex items-center justify-between px-1 text-[13px] text-ink-faint">
          <span>
            Page {page} of {totalPages}
          </span>
          <span className="flex gap-2">
            <Button variant="secondary" size="xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="secondary" size="xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </span>
        </div>
      </Async>
```

(Place the pager div INSIDE the existing table `<Async>` after the `</Card>` if nesting stays valid — either placement is fine as long as it renders under the table card region and is not gated on `totalPages > 1`.)

- [ ] **Step 4: e2e contract updates (same commit)**

`frontdesk_verify.cjs` :103-106:

```js
    const invA = await (
      await api.get(`${BASE}/api/v1/invoices?member_id=${memberA.body.id}&page_size=100`, { headers: auth })
    ).json();
    const invB = await (
      await api.get(`${BASE}/api/v1/invoices?member_id=${memberB.body.id}&page_size=100`, { headers: auth })
    ).json();
    const invAOpen = invA.items.find((i) => i.status === "open");
    const invBOpen = invB.items.find((i) => i.status === "open");
```

`gym_ops_verify.cjs` :292 and :332 (the two `invoices.find` sites; keep variable name `invoices`, it now holds the paged body):

```js
    let invoices = await (await api.get(`${BASE}/api/v1/invoices?page_size=100`, { headers: auth })).json();
    let openInv = invoices.items.find((i) => i.status === "open" || i.status === "overdue");
```

and in the `if (!openInv)` block's re-fetch (:331-333):

```js
      invoices = await (await api.get(`${BASE}/api/v1/invoices?page_size=100`, { headers: auth })).json();
      openInv = invoices.items.find((i) => i.status === "open" || i.status === "overdue");
```

- [ ] **Step 5: New e2e checks (same commit)**

`frontdesk_verify.cjs` — after the existing `check("billing page renders summary cards + invoices table", …)`:

```js
    await must("billing pager renders Page X of Y", page.getByText(/^Page \d+ of \d+$/).waitFor({ timeout: 10000 }));
```

In the subscriptions section, after `must("subscriptions page renders with count", …)`:

```js
    await must("subscriptions page shows Gym plan tier card", page.getByText("Gym plan", { exact: true }).waitFor({ timeout: 10000 }));
```

- [ ] **Step 6: Gates + commit**

```bash
cd apps/web && npx tsc --noEmit && npm test
NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs   # 22/22 (hooks.ts touched)
NODE_PATH="$(npm root -g)" node e2e/frontdesk_verify.cjs        # 23 + 2 new checks = 25
NODE_PATH="$(npm root -g)" node e2e/gym_ops_verify.cjs          # 30 (contract-only change)
```

Commit: `git add apps/web/src/lib/types.ts apps/web/src/lib/hooks.ts "apps/web/src/app/(app)/billing/page.tsx" apps/web/e2e/frontdesk_verify.cjs apps/web/e2e/gym_ops_verify.cjs && git commit -m "feat(billing): paged invoices UI + e2e .items contracts"`

---

### Task 7: Tenant unlabeled controls (a11y attributes)

**Files:**
- Modify: `apps/web/src/app/(app)/members/page.tsx`, `apps/web/src/app/(app)/members/[id]/page.tsx`, `apps/web/src/app/(app)/checkins/page.tsx`, `apps/web/src/app/(app)/page.tsx`, `apps/web/src/app/(app)/branches/page.tsx`

For every control below add `id="<kebab>"` + `aria-label="<visible Field label>"` matching the `fa3e0e5` convention (see `members/page.tsx:154-159` for the canonical pattern). Attribute-only — no layout/behavior changes.

- [ ] **Step 1: Apply attributes**

| File | Control (line) | id | aria-label |
|------|----------------|----|------------|
| members/page.tsx | `CountryCodeSelect` wrapper `Select` :34 | `member-country-code` | `Country code` |
| members/page.tsx | branch filter `Select` :164 | `members-branch-filter` | `Filter by branch` |
| members/page.tsx | Branch `Select` :328 | `member-branch` | `Branch` |
| members/page.tsx | Intended plan `Select` :340 | `member-plan` | `Intended plan` |
| members/[id]/page.tsx | `CountryCodeSelect` :55 | `member-detail-country-code` | `Country code` |
| members/[id]/page.tsx | inputs :514, :521, :528, :542, :623 | `member-edit-<field>` | matching Field label |
| members/[id]/page.tsx | `Select`s :550, :560, :590 | `member-edit-<field>` | matching Field label |
| checkins/page.tsx | branch `Select` :217 | `checkin-branch` | `Branch` |
| checkins/page.tsx | source `Select` :224 | `checkin-source` | `Source` |
| (app)/page.tsx | `Input` :153 | `quick-checkin-member` | `Member` |
| (app)/page.tsx | branch `Select` :188 | `quick-checkin-branch` | `Branch` |
| (app)/page.tsx | source `Select` :196 | `quick-checkin-source` | `Source` |
| branches/page.tsx | `CountryCodeSelect` :47 | `branch-country-code` | `Country code` |
| branches/page.tsx | timezone `Select`s :311, :370 | `branch-timezone` / `branch-edit-timezone` | `Timezone` |
| branches/page.tsx | modal inputs :295, :304, :319, :330, :338, :356, :364, :378, :388, :395 | `branch-<field>` / `branch-edit-<field>` | matching Field label |

(Open each file first — line numbers drift after earlier tasks; match by the Field label wrapping each control, same as members/page.tsx:288-320.)

- [ ] **Step 2: Gates + commit**

```bash
cd apps/web && npx tsc --noEmit && npm test
```

Commit: `git add "apps/web/src/app/(app)/members/page.tsx" "apps/web/src/app/(app)/members/[id]/page.tsx" "apps/web/src/app/(app)/checkins/page.tsx" "apps/web/src/app/(app)/page.tsx" "apps/web/src/app/(app)/branches/page.tsx" && git commit -m "fix(a11y): id + aria-label on remaining tenant controls"`

---

### Task 8: Platform unlabeled controls — attribute-only (GATE)

**Files:**
- Modify: `apps/web/src/app/(app)/platform/page.tsx`, `apps/web/src/app/(app)/platform/gyms/page.tsx`, `apps/web/src/app/(app)/platform/owners/page.tsx`, `apps/web/src/app/(app)/platform/subscriptions/page.tsx`

Attribute-only (`id` + `aria-label`) on exactly these controls — no other edits:

| File | Control | id | aria-label |
|------|---------|----|------------|
| platform/page.tsx :141 | inline Tier `Select` | `platform-tier-select` | `Tier` |
| platform/gyms/page.tsx :220-258 | provision modal: Gym name, Slug, Tier, Owner name, Owner email, Owner password | `gym-<field>` | matching Field label |
| platform/gyms/page.tsx :263-296 | edit modal: Gym name, Timezone, Currency, Tier | `gym-edit-<field>` | matching Field label |
| platform/owners/page.tsx :148-154 | Full name, Email, Reset password | `owner-<field>` | matching Field label |
| platform/subscriptions/page.tsx :129-177 | Code, Name, Monthly price, Max branches, Max members, Description | `tier-<field>` | matching Field label |

20 controls total. Example:

```tsx
                  <Select
                    value={form.tier_code}
                    id="gym-tier"
                    aria-label="Tier"
                    onChange={(e) => setForm({ ...form, tier_code: e.target.value })}
                  >
```

- [ ] **Step 1: Apply, verify, gate, commit**

```bash
cd apps/web && npx tsc --noEmit
NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs   # 22/22 REQUIRED
```

Commit: `git add "apps/web/src/app/(app)/platform/page.tsx" "apps/web/src/app/(app)/platform/gyms/page.tsx" "apps/web/src/app/(app)/platform/owners/page.tsx" "apps/web/src/app/(app)/platform/subscriptions/page.tsx" && git commit -m "fix(a11y): id + aria-label on platform controls (attribute-only)"`

---

### Task 9: Modal + Toast a11y (GATE)

**Files:**
- Modify: `apps/web/src/components/ui.tsx` (imports :1-2, `Modal` :316-352, `Toast` :363-387)

- [ ] **Step 1: Imports**

Change the head of `ui.tsx`:

```tsx
"use client";

import { forwardRef, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
```

- [ ] **Step 2: Modal**

Replace `Modal` (:316-352) with:

```tsx
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastActiveRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastActiveRef.current = (document.activeElement as HTMLElement) ?? null;
    const node = dialogRef.current;
    const focusables = node
      ? Array.from(
          node.querySelectorAll<HTMLElement>(
            'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        )
      : [];
    (focusables[0] ?? node)?.focus();
    return () => {
      lastActiveRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const node = dialogRef.current;
      if (!node) return;
      const focusables = Array.from(
        node.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[4px] animate-fade-in"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className={cn(
          "relative w-full rounded-2xl border border-line-strong bg-panel-strong p-6 shadow-2xl animate-modal-in focus:outline-none",
          width,
        )}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-ink-faint transition-colors hover:bg-fill hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className="mb-4">
          <h3 id="modal-title" className="font-display text-[16px] font-semibold tracking-tight">
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-faint">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
```

(Hooks are declared before the `!open` early return so the rules of hooks hold; the fixed-inset wrapper that e2e selects depend on is unchanged; backdrop-click and Cancel behavior unchanged.)

- [ ] **Step 3: Toast**

Before `Toast` (:363), add the singleton region + portal, and replace `Toast`:

```tsx
let toastRegion: HTMLElement | null = null;

function ensureToastRegion(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (toastRegion === null) {
    toastRegion = document.createElement("div");
    toastRegion.setAttribute("role", "status");
    toastRegion.setAttribute("aria-live", "polite");
    toastRegion.setAttribute("aria-atomic", "true");
    document.body.appendChild(toastRegion);
  }
  return toastRegion;
}

// Mount the live region at module load (client only) so assistive tech
// registers it before the first toast's content arrives.
if (typeof document !== "undefined") {
  ensureToastRegion();
}

export function Toast({
  type,
  message,
  onClose,
}: {
  type: "success" | "error" | "info";
  message: string;
  onClose: () => void;
}) {
  const tone =
    type === "success" ? "bg-green" : type === "error" ? "bg-red" : "bg-accent";
  const region = ensureToastRegion();
  if (!region) return null;
  return createPortal(
    <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full border border-line-strong bg-panel-strong/90 px-4 py-2.5 shadow-[0_12px_40px_var(--color-shadow)] backdrop-blur-xl animate-toast-in glass-edge">
        <span className={cn("h-2 w-2 rounded-full", tone)} />
        <span className="text-[13px] font-medium text-ink">{message}</span>
        <button onClick={onClose} aria-label="Dismiss" className="text-ink-faint hover:text-ink">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>,
    region,
  );
}
```

Zero call-site changes — platform pages keep `{toast && <Toast …/>}` and stay frozen.

- [ ] **Step 4: Gates + commit**

```bash
cd apps/web && npx tsc --noEmit && npm test
NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs   # 22/22 REQUIRED (ui.tsx shared)
NODE_PATH="$(npm root -g)" node e2e/expenses_verify.cjs         # 13 (Cancel-button close still true)
```

Commit: `git add apps/web/src/components/ui.tsx && git commit -m "fix(a11y): Modal focus trap/Escape/ARIA + persistent Toast live region"`

---

### Task 10: Ordering tiebreakers + tests (GATE)

**Files:**
- Modify (one-line `.order_by(...)` additions):
  - `backend/app/modules/attendance/service.py:186`
  - `backend/app/modules/members/service.py:226` and `:236` (timeline)
  - `backend/app/modules/membership/service.py:95` and `:373`
  - `backend/app/modules/notifications/service.py:55`
  - `backend/app/modules/tenancy/service.py:572` and `:639` (platform sold list — gate!)
- Test: `backend/tests/test_order_tiebreakers.py` (new)

(`billing/service.py:125` already landed in Task 5.)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_order_tiebreakers.py`:

```python
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import update

from app.db.session import get_sessionmaker
from app.modules.attendance.models import CheckIn
from app.modules.members.models import Member
from tests.helpers import login, provision_gym


async def test_members_pagination_stable_for_tied_created_at(client, platform_token):
    await provision_gym(client, platform_token, "memtie")
    tokens = await login(client, "owner-memtie@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    ids = []
    for i in range(3):
        res = await client.post(
            "/api/v1/members",
            headers=headers,
            json={
                "first_name": f"Tie{i}",
                "last_name": "Maker",
                "email": f"tie{i}-memtie@example.com",
                "gender": "Male",
                "status": "lead",
            },
        )
        assert res.status_code == 201, res.text
        ids.append(res.json()["id"])
    sm = get_sessionmaker()
    async with sm() as session:
        await session.execute(update(Member).values(created_at=datetime.now(UTC)))
        await session.commit()

    paged: list[str] = []
    for page in (1, 2):
        res = await client.get(
            "/api/v1/members", headers=headers, params={"page": page, "page_size": 2}
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["total"] >= 3
        paged.extend(m["id"] for m in body["items"] if m["id"] in set(ids))
    assert paged == sorted(ids, reverse=True)


async def test_checkins_pagination_stable_for_tied_recorded_at(client, platform_token):
    await provision_gym(client, platform_token, "checktie")
    tokens = await login(client, "owner-checktie@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    member = await client.post(
        "/api/v1/members",
        headers=headers,
        json={
            "first_name": "Check",
            "last_name": "Tie",
            "email": "check-tie-checktie@example.com",
            "gender": "Male",
            "status": "active",
        },
    )
    assert member.status_code == 201, member.text
    mid = member.json()["id"]
    ids = []
    for _ in range(3):
        res = await client.post(
            "/api/v1/attendance/check-ins",
            headers=headers,
            json={"member_id": mid},
        )
        assert res.status_code in (200, 201), res.text
        ids.append(res.json()["id"])
    sm = get_sessionmaker()
    async with sm() as session:
        await session.execute(update(CheckIn).values(recorded_at=datetime.now(UTC)))
        await session.commit()

    paged: list[str] = []
    for page in (1, 2):
        res = await client.get(
            "/api/v1/attendance/check-ins",
            headers=headers,
            params={"page": page, "page_size": 2},
        )
        assert res.status_code == 200, res.text
        paged.extend(c["id"] for c in res.json()["items"] if c["id"] in set(ids))
    assert paged == sorted(ids, reverse=True)
```

(Check the actual check-in route path/response id from `backend/app/modules/attendance/api.py` before running — adjust if the endpoint is `/attendance/checkins` or returns the row nested; the point of the test is coverage + id-DESC stability.)

- [ ] **Step 2: Apply the one-line orderings**

- attendance/service.py:186 → `.order_by(CheckIn.recorded_at.desc(), CheckIn.id.desc())`
- members/service.py:226 → `.order_by(Member.created_at.desc(), Member.id.desc())`
- members/service.py:236 (timeline) → `.order_by(MemberTimeline.created_at.desc(), MemberTimeline.id.desc())`
- membership/service.py:95 → `.order_by(MembershipPlan.amount_minor, MembershipPlan.id.desc())`
- membership/service.py:373 → `.order_by(Subscription.start_at.desc(), Subscription.id.desc())`
- notifications/service.py:55 → `.order_by(InAppNotification.created_at.desc(), InAppNotification.id.desc())`
- tenancy/service.py:572 → `.order_by(GymSubscriptionEvent.created_at.desc(), GymSubscriptionEvent.id.desc())`
- tenancy/service.py:639 → `.order_by(Subscription.start_at.desc(), Subscription.id.desc())`

- [ ] **Step 3: Gates + commit**

```bash
cd backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check app tests scripts
NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs   # 22/22 REQUIRED (tenancy sold list)
```

Expect 85 passed. Commit: `git add backend/app/modules/attendance/service.py backend/app/modules/members/service.py backend/app/modules/membership/service.py backend/app/modules/notifications/service.py backend/app/modules/tenancy/service.py backend/tests/test_order_tiebreakers.py && git commit -m "fix(order): secondary id tiebreakers on 9 list endpoints"`

---

### Task 11: Branches saveEdit in-flight guard

**Files:**
- Modify: `apps/web/src/app/(app)/branches/page.tsx` (:110-131 `saveEdit`, :403-404 submit button)

- [ ] **Step 1: Guard**

Add after the existing guards (`const addGuard = useInFlight();`, ~:64):

```ts
  const saveGuard = useInFlight();
```

Wrap `saveEdit` (:110-131):

```ts
  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    await saveGuard.run(async () => {
      try {
        await updateBranch.mutateAsync({
          branchId: editing.id,
          body: {
            name: editForm.name,
            code: editForm.code || undefined,
            address: editForm.address || undefined,
            phone: editForm.phone || undefined,
            country_code: editForm.country_code,
            gst_number: editForm.gst_number || undefined,
            timezone: editForm.timezone,
          },
        });
        setEditing(null);
        setToast({ type: "success", message: "Branch updated" });
      } catch {
        setToast({ type: "error", message: "Could not update branch" });
      }
    });
  }
```

Edit-modal submit button (:403-404):

```tsx
            <Button type="submit" disabled={saveGuard.busy || updateBranch.isPending}>
              {saveGuard.busy || updateBranch.isPending ? "Saving…" : "Save changes"}
            </Button>
```

- [ ] **Step 2: Gates + commit**

```bash
cd apps/web && npx tsc --noEmit && npm test
```

Commit: `git add "apps/web/src/app/(app)/branches/page.tsx" && git commit -m "fix(guards): synchronous in-flight guard on branch edit save"`

---

### Task 12: Granted-only member stats + unit test

**Files:**
- Modify: `apps/web/src/lib/adapters.ts:153`
- Test: `apps/web/src/lib/adapters.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `adapters.test.ts` (imports at top: add `toUiMember` to the adapters import and `MemberOut` + `CheckInOut` to types):

```ts
function member(overrides: Partial<MemberOut>): MemberOut {
  return {
    id: "mem-1",
    first_name: "Asha",
    last_name: "Rao",
    email: "asha@example.com",
    phone: null,
    country_code: "+91",
    gender: "Female",
    status: "active",
    is_active: true,
    avatar_path: null,
    branch_id: "br-1",
    joined_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  } as MemberOut;
}

function checkin(overrides: Partial<CheckInOut>): CheckInOut {
  return {
    id: "ci-1",
    member_id: "mem-1",
    branch_id: "br-1",
    result: "allowed",
    reason: null,
    recorded_at: new Date().toISOString(),
    ...overrides,
  } as CheckInOut;
}

test("member stats count only granted check-ins", () => {
  const today = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const ui = toUiMember(member({}), {
    subscriptions: [],
    invoices: [],
    checkins: [
      checkin({ id: "ci-1", result: "allowed", recorded_at: today }),
      checkin({ id: "ci-2", result: "denied", recorded_at: yesterday }),
    ],
  });
  assert.equal(ui.visits, 1);
  assert.equal(ui.streak, 1);
  assert.ok(ui.lastCheckIn);
});

test("denied-only member shows zero visits and no last check-in", () => {
  const ui = toUiMember(member({}), {
    subscriptions: [],
    invoices: [],
    checkins: [checkin({ result: "denied" })],
  });
  assert.equal(ui.visits, 0);
  assert.equal(ui.streak, 0);
  assert.equal(ui.lastCheckIn, null);
});
```

(Adjust the `member()` factory to the real `MemberOut` fields in `types.ts` — read it first; keep only real fields.)

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/web && npm test   # 8 pass → 2 failing new tests
```

- [ ] **Step 3: Filter**

In `adapters.ts` `toUiMember` (:153):

```ts
  const memberCheckins = ctx.checkins.filter(
    (c) => c.member_id === m.id && c.result === "allowed",
  );
```

This single point covers `visits` (:176), `streak` (`computeStreak` :128-144) and `lastCheckIn` (:154-158/:175). Denied rows stay visible in the Check-ins feed.

- [ ] **Step 4: Gates + commit**

```bash
cd apps/web && npx tsc --noEmit && npm test   # 10 pass
```

Commit: `git add apps/web/src/lib/adapters.ts apps/web/src/lib/adapters.test.ts && git commit -m "fix(members): visits/streak/last-checkin count granted check-ins only"`

---

### Task 13: E2E teardowns + platform tier retarget (GATE)

**Files:**
- Modify: `apps/web/e2e/frontdesk_verify.cjs`, `apps/web/e2e/gym_ops_verify.cjs`, `apps/web/e2e/member_account_verify.cjs`, `apps/web/e2e/platform_admin_verify.cjs`

- [ ] **Step 1: frontdesk teardown (2 members + 2 plans → +4 checks)**

1. Hoist capture vars above `try` (after the `ts`/name consts, ~:14): `let auth = null; let memberAId = null; let memberBId = null; let planAId = null; let planBId = null;`
2. Inside the try, after `const auth = …` (:64) — change to assignment `auth = { Authorization: ... }` (drop the inner `const`), and after each fixture creation assign: `memberAId = memberA.body.id;` etc. (before the `fixturesOk` check).
3. Replace the `finally` (:~237-240) with:

```js
  } finally {
    // Teardown: member deletes cascade subs/invoices/payments/check-ins.
    if (auth) {
      for (const [kind, id, label] of [
        ["members", memberAId, "member A"],
        ["members", memberBId, "member B"],
        ["plans", planAId, "plan A"],
        ["plans", planBId, "plan B"],
      ]) {
        if (!id) continue;
        try {
          const res = await api.delete(`${BASE}/api/v1/${kind}/${id}`, { headers: auth });
          check(`teardown: ${label} deleted`, res.status() === 204 || res.status() === 404, `status ${res.status()}`);
        } catch (e) {
          check(`teardown: ${label} deleted`, false, String(e).slice(0, 200));
        }
      }
    }
    await browser.close();
  }
```

(`api` must also be hoisted: `let api = null;` assigned at :59.)

- [ ] **Step 2: gym_ops teardown (role + conditional member/plan → 30 → 31, up to 33)**

1. Hoist: `let auth = null; let api = null; let roleId = null; let condMemberId = null; let condPlanId = null;` above `try`; convert the in-try `const api`/`const auth` (:59-64) to assignments.
2. After the "custom role visible in UI list" check, capture the role id via API:

```js
    const rolesList = await (await api.get(`${BASE}/api/v1/permissions/roles`, { headers: auth })).json();
    roleId = (rolesList.find((r) => r.name === ROLE_NAME) || {}).id || null;
```

3. In the conditional `if (!openInv)` block (:283-315), after creating the member/plan: `condMemberId = member.id; condPlanId = plan.id;`
4. Extend the `finally`:

```js
  } finally {
    if (auth && roleId) {
      try {
        const res = await api.delete(`${BASE}/api/v1/permissions/roles/${roleId}`, { headers: auth });
        check("teardown: E2E role deleted", res.status() === 204 || res.status() === 404, `status ${res.status()}`);
      } catch (e) {
        check("teardown: E2E role deleted", false, String(e).slice(0, 200));
      }
    }
    for (const [id, label] of [[condMemberId, "conditional member"], [condPlanId, "conditional plan"]]) {
      if (!auth || !id) continue;
      try {
        const kind = label.includes("member") ? "members" : "plans";
        const res = await api.delete(`${BASE}/api/v1/${kind}/${id}`, { headers: auth });
        check(`teardown: ${label} deleted`, res.status() === 204 || res.status() === 404, `status ${res.status()}`);
      } catch (e) {
        check(`teardown: ${label} deleted`, false, String(e).slice(0, 200));
      }
    }
    await browser.close();
  }
```

- [ ] **Step 3: member_account teardown (2 plans → 13 → 15)**

Hoist `let renewPlanId = null; let upgradePlanId = null; let api = null; let auth = null;` (assignments at :44-49 and after :79/:96). Extend `finally` with two plan DELETE checks (same pattern; label "Renew Plan", "Upgrade Plan").

- [ ] **Step 4: platform_admin tier retarget (22 unchanged)**

In `platform_admin_verify.cjs`, MOVE the tier block (:133-137) to immediately BEFORE the gyms-delete block (:124-131) and retarget the Verify Gym row:

```js
    // ── Subscriptions: change tier via overview dropdown (this run's gym only) ──
    await page.goto(`${BASE}/platform`);
    await page.getByText("Gym subscriptions").waitFor({ timeout: 10000 });
    const tierRow = page.locator("tr", { hasText: `Verify Gym ${ts}` }).first();
    await tierRow.waitFor({ timeout: 15000 });
    const tierSelect = tierRow.locator("select").first();
    await tierSelect.selectOption({ label: "Pro" });
    await must("subscription tier changed via overview dropdown", page.getByText("Subscription tier updated").waitFor({ timeout: 10000 }));
```

No foreign gym is mutated; the gyms-delete section then removes the Verify Gym as before. Check count stays 22.

- [ ] **Step 5: Gates + commit**

```bash
NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs   # 22 REQUIRED
NODE_PATH="$(npm root -g)" node e2e/frontdesk_verify.cjs        # 27 (23 + 4 teardown + pager + tier card = 29; record actual)
NODE_PATH="$(npm root -g)" node e2e/gym_ops_verify.cjs          # 31–33 (record actual)
NODE_PATH="$(npm root -g)" node e2e/member_account_verify.cjs   # 15
```

Commit: `git add apps/web/e2e/frontdesk_verify.cjs apps/web/e2e/gym_ops_verify.cjs apps/web/e2e/member_account_verify.cjs apps/web/e2e/platform_admin_verify.cjs && git commit -m "test(e2e): fixture teardowns + platform tier retarget to own gym"`

---

### Task 14: Full battery + final report

- [ ] **Step 1: Backend**

```bash
cd backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check app tests scripts
```

- [ ] **Step 2: Frontend**

```bash
cd apps/web && npx tsc --noEmit && npm test
```

- [ ] **Step 3: e2e, sequential**

```bash
cd apps/web
NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/plans_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/member_account_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/role_visibility_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/frontdesk_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/gym_ops_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/expenses_verify.cjs
```

- [ ] **Step 4: Post-battery cleanup**

Sweep `in_app_notifications` unread rows via `psql -U postgres -d gym_erp -c "..."` (same as prior rounds). Record post-battery data state (members/plans/invoices/roles/branches counts).

- [ ] **Step 5: Report + commit**

Deliver the final report: per-fix status, actual vs expected baselines, remaining known limitations (fetchPaged 2,000-row cap; permission-dependent stats; historical fixture purge deferred; notifications no delete). Commit any doc updates: `git add docs/... && git commit -m "docs: deferred-fixes round final report"`.
