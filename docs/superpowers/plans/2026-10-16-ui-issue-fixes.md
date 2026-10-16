# UI Issue Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four UI issues found by the e2e sweep: stale invoice detail after pay/void, no-op Settings profile save, missing create-role form, and the minor bundle (nested button, billing search, mark-read toast).

**Architecture:** Pure frontend fixes for issues 1/3/4; issue 2 needs one new self-service backend endpoint (`PATCH /auth/me`) plus a partial-update extension of `PATCH /settings`. No migrations. All new behavior is test-first via the existing Playwright e2e scripts and pytest.

**Tech Stack:** Next.js 15 (app router), React Query v4/v5 mutations, FastAPI + SQLAlchemy, pytest + Playwright.

---

## Issue → Task map

| # | Issue | Task(s) |
|---|---|---|
| 1 | Invoice detail badge stays stale after void/pay (`usePayInvoice`/`useVoidInvoice` don't invalidate `["invoice", id]`) | Task 1 |
| 2 | Settings profile "Save changes" is a no-op; gym name/timezone not editable | Tasks 2a–2d |
| 3 | No create-role form in the UI (API-only) | Task 3 |
| 4a | Nested `<button>` in role card headers (invalid HTML / a11y) | Task 4a |
| 4b | Billing list has no search | Task 4b |
| 4c | Single mark-read has no toast feedback | Task 4c |

**Shared-file rule (AGENTS.md):** Tasks 1, 2b and 3 modify `apps/web/src/lib/hooks.ts` → run the platform gate after each. Tenancy edits in Task 2c touch only `/api/v1/settings` (never `/api/v1/platform/*`), so the frozen platform panel is unaffected; the gate re-verifies that.

**Environment:** backend `:8000`, web `:3000`, dev DB seeded. Run backend tests from `backend/`, everything else from `apps/web/`.

---

### Task 1: Refresh invoice detail after pay/void

**Files:**
- Modify: `apps/web/src/lib/hooks.ts:665-689` (`usePayInvoice`, `useVoidInvoice`)
- Test: `apps/web/e2e/frontdesk_verify.cjs:195-203`

- [ ] **Step 1: Write the failing e2e check**

In `apps/web/e2e/frontdesk_verify.cjs` replace the block at lines 195–203:

```js
    await page.getByRole("button", { name: "Void invoice" }).click();
    await page.getByText(`${invBOpen.number} voided`).waitFor({ timeout: 15000 });
    // The detail query must refresh after void — no navigation needed.
    await page.getByText("Void", { exact: true }).first().waitFor({ timeout: 15000 });
    check("invoice B void: detail badge updates in place", true, invBOpen.number);
    await page.locator('main a[href="/billing"]').click();
    await page.waitForURL(/\/billing$/, { timeout: 10000 });
    const voidRow = page.locator("tbody tr", { hasText: invBOpen.number });
    await voidRow.first().getByText("Void", { exact: true }).waitFor({ timeout: 15000 });
    check("invoice B voided via detail UI (Void badge on billing list)", true, invBOpen.number);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node e2e/frontdesk_verify.cjs`
Expected: FAIL at `invoice B void: detail badge updates in place` (16s timeout — detail card still shows `Open`); all other checks pass.

- [ ] **Step 3: Fix the invalidations**

In `apps/web/src/lib/hooks.ts` replace `usePayInvoice` (line 665) and `useVoidInvoice` (line 680) with:

```ts
export function usePayInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { invoice_id: string; method: string; idempotency_key: string }) =>
      apiFetch<PaymentCaptureResult>(`/invoices/${body.invoice_id}/pay`, {
        method: "POST",
        body: JSON.stringify({ method: body.method, idempotency_key: body.idempotency_key }),
      }),
    onSuccess: (_data, body) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", body.invoice_id] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useVoidInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) =>
      apiFetch<InvoiceOut>(`/invoices/${invoiceId}/void`, { method: "POST" }),
    onSuccess: (_data, invoiceId) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes + typecheck**

Run: `node e2e/frontdesk_verify.cjs`
Expected: `19/19 checks passed` (the original 18, plus the new in-place detail check; the old list-badge check is retained as the second assertion).

Run: `npx tsc --noEmit` → exit 0.

- [ ] **Step 5: Run the platform gate (shared file)**

Run: `NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs`
Expected: `22/22 checks passed`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/hooks.ts apps/web/e2e/frontdesk_verify.cjs
git commit -m "fix(billing): refresh invoice detail query after pay/void"
```

---

### Task 2a: Backend `PATCH /auth/me` (profile self-update)

**Files:**
- Modify: `backend/app/modules/identity/schemas.py` (after `MeOut`, line 66)
- Modify: `backend/app/modules/identity/service.py` (after `authenticate`, ~line 110)
- Modify: `backend/app/modules/identity/api.py` (`/me` route at line 72 + new PATCH route)
- Test: `backend/tests/test_auth.py` (append)

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_auth.py`:

```python
async def test_update_me_profile(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {owner['access_token']}"}

    before = await client.get("/api/v1/auth/me", headers=headers)
    assert before.status_code == 200
    original_name = before.json()["user"]["full_name"]

    response = await client.patch(
        "/api/v1/auth/me", headers=headers, json={"full_name": "Renamed Owner"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["user"]["full_name"] == "Renamed Owner"

    me = await client.get("/api/v1/auth/me", headers=headers)
    assert me.json()["user"]["full_name"] == "Renamed Owner"

    # Email belonging to another user → 409.
    emp = await client.post(
        "/api/v1/employees",
        headers=headers,
        json={
            "email": "taken-me-profile@example.com",
            "full_name": "Temp Employee",
            "password": "temp-pass-123",
        },
    )
    assert emp.status_code == 201, emp.text
    conflict = await client.patch(
        "/api/v1/auth/me", headers=headers, json={"email": "taken-me-profile@example.com"}
    )
    assert conflict.status_code == 409, conflict.text

    # Restoring the original name keeps the suite state clean for gym_a.
    restore = await client.patch(
        "/api/v1/auth/me", headers=headers, json={"full_name": original_name}
    )
    assert restore.status_code == 200, restore.text
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_auth.py::test_update_me_profile -q`
Expected: FAIL — 405 Method Not Allowed (no PATCH `/auth/me`).

- [ ] **Step 3: Add the schema**

In `backend/app/modules/identity/schemas.py`, after `MeOut` (line 66):

```python
class MeUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=200)
    email: EmailStr | None = None

    @field_validator("full_name")
    @classmethod
    def normalize_name(cls, v: str | None) -> str | None:
        return v.strip() if v is not None else v
```

(`Field`, `EmailStr`, `field_validator` are already imported in that file — verify `Field` import; add it if missing.)

- [ ] **Step 4: Add the service function**

In `backend/app/modules/identity/service.py`, after `authenticate` (~line 110):

```python
async def update_me(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    full_name: str | None = None,
    email: str | None = None,
) -> User:
    user = await session.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise NotFoundError("User not found", code="NOT_FOUND")
    if full_name is not None:
        user.full_name = full_name.strip()
    if email is not None:
        normalized = email.lower()
        if normalized != user.email:
            # Email is the global login key — uniqueness is cross-tenant.
            existing = await session.scalar(
                select(User.id).where(
                    User.email == normalized,
                    User.id != user.id,
                    User.deleted_at.is_(None),
                )
            )
            if existing is not None:
                raise ConflictError("User already exists", code="EMAIL_TAKEN")
        user.email = normalized
    await session.flush()
    return user
```

Verify `NotFoundError` is imported in `service.py` (it is used by `create_employee`'s peers — check imports; add alongside existing `ConflictError` import if missing).

- [ ] **Step 5: Add the route (extract shared payload helper)**

In `backend/app/modules/identity/api.py`, replace the body of the `me` route (lines 72–98) with a helper plus thin routes:

```python
async def _me_payload(
    session: AsyncSession, actor: Actor, user: User
) -> MeOut:
    perms = await identity_svc.get_effective_permissions(session, actor.user_id)
    tenant_name = None
    branches: list[dict] = []
    if not actor.is_platform:
        gym_row = await session.get(Gym, actor.tenant_id)
        tenant_name = gym_row.name if gym_row else None
        branch_rows = await session.scalars(
            select(Branch).where(
                Branch.gym_id == actor.tenant_id, Branch.deleted_at.is_(None)
            )
        )
        branches = [{"id": str(b.id), "name": b.name} for b in branch_rows]
    return MeOut(
        user=UserOut.model_validate(user),
        tenant_id=actor.tenant_id,
        tenant_name=tenant_name,
        is_platform=actor.is_platform,
        permissions=sorted(perms.keys()),
        branches=branches,
    )


@router.get("/me", response_model=MeOut)
async def me(
    actor: Annotated[Actor, Depends(get_actor_context)],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> MeOut:
    user = await session.get(User, actor.user_id)
    return await _me_payload(session, actor, user)


@router.patch("/me", response_model=MeOut)
async def update_me_route(
    body: MeUpdateRequest,
    actor: Annotated[Actor, Depends(get_actor_context)],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> MeOut:
    user = await identity_svc.update_me(
        session,
        user_id=actor.user_id,
        full_name=body.full_name,
        email=body.email,
    )
    return await _me_payload(session, actor, user)
```

No permission dependency: any authenticated user may edit their own profile. Ensure `MeUpdateRequest` is added to the schemas import line in `api.py`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_auth.py -q`
Expected: all pass (exit 0).

- [ ] **Step 7: Commit**

```bash
git add backend/app/modules/identity/schemas.py backend/app/modules/identity/service.py backend/app/modules/identity/api.py backend/tests/test_auth.py
git commit -m "feat(auth): PATCH /auth/me for profile self-update"
```

---

### Task 2b: Wire the Settings profile form + expose `refreshMe`

**Files:**
- Modify: `apps/web/src/lib/auth.tsx` (expose `refreshMe`)
- Modify: `apps/web/src/lib/hooks.ts` (add `useUpdateMe`)
- Modify: `apps/web/src/app/(app)/settings/page.tsx` (save handler)
- Test: `apps/web/e2e/gym_ops_verify.cjs` (settings section, after line 183)

- [ ] **Step 1: Write the failing e2e checks**

In `apps/web/e2e/gym_ops_verify.cjs`, insert after line 183 (`check("settings: cross-branch toggle restored to original", ...)`):

```js
    // ── Profile save persists (was a local-toast no-op) ──
    const profileCard = page
      .locator("div.glass", { has: page.getByText("Your account details across the organization") })
      .first();
    await profileCard.waitFor({ timeout: 15000 });
    const nameInput = profileCard.locator("input").first();
    const origName = await nameInput.inputValue();
    await nameInput.fill(`${origName} E2E`);
    await profileCard.getByRole("button", { name: "Save changes" }).click();
    await page.getByText("Profile updated").waitFor({ timeout: 10000 });
    await page.locator("aside").getByText(`${origName} E2E`).waitFor({ timeout: 15000 });
    check("settings: profile name save persists (sidebar refreshes)", true);
    await nameInput.fill(origName);
    await profileCard.getByRole("button", { name: "Save changes" }).click();
    await page.getByText("Profile updated").waitFor({ timeout: 10000 });
```

- [ ] **Step 2: Run to verify it fails**

Run: `node e2e/gym_ops_verify.cjs`
Expected: FAIL at `settings: profile name save persists (sidebar refreshes)` — sidebar keeps the old name (me never reloads).

- [ ] **Step 3: Expose `refreshMe` in the auth context**

In `apps/web/src/lib/auth.tsx`:

```ts
interface AuthContextValue {
  me: MeOut | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<MeOut>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}
```

and in the provider:

```tsx
    <AuthContext.Provider value={{ me, loading, login, logout, refreshMe: loadMe }}>
```

- [ ] **Step 4: Add the `useUpdateMe` hook**

Append to `apps/web/src/lib/hooks.ts` (near the other auth-adjacent mutations, e.g. after `useMarkNotificationRead`):

```ts
export function useUpdateMe() {
  return useMutation({
    mutationFn: (body: { full_name?: string; email?: string }) =>
      apiFetch<MeOut>("/auth/me", { method: "PATCH", body: JSON.stringify(body) }),
  });
}
```

(`MeOut` must be in the type import list at the top of `hooks.ts` — add it if missing.)

- [ ] **Step 5: Wire the save handler in the settings page**

In `apps/web/src/app/(app)/settings/page.tsx`:

```tsx
  const { me, refreshMe } = useAuth();  // replaces the existing `const { me } = useAuth();` (line 19)
  const updateMe = useUpdateMe();
  const [savingProfile, setSavingProfile] = useState(false);

  async function saveProfile() {
    setSavingProfile(true);
    try {
      await updateMe.mutateAsync({ full_name: name.trim(), email: email.trim() });
      await refreshMe();
      setToast("Profile updated");
    } catch {
      setToast("Could not save profile — the email may be taken");
    } finally {
      setSavingProfile(false);
    }
  }
```

Replace the button at line 53:

```tsx
        <div className="mt-4 flex justify-end">
          <Button onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save changes"}
          </Button>
        </div>
```

- [ ] **Step 6: Run to verify it passes + typecheck + gate**

Run: `node e2e/gym_ops_verify.cjs`
Expected: all checks pass incl. `settings: profile name save persists (sidebar refreshes)`.

Run: `npx tsc --noEmit` → exit 0.

Run: `NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs` → `22/22 checks passed`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/auth.tsx apps/web/src/lib/hooks.ts "apps/web/src/app/(app)/settings/page.tsx" apps/web/e2e/gym_ops_verify.cjs
git commit -m "fix(settings): persist profile save via PATCH /auth/me"
```

---

### Task 2c: Backend `PATCH /settings` partial update (name + timezone)

**Files:**
- Modify: `backend/app/modules/tenancy/schemas.py:34-36` (`GymSettingsUpdate`)
- Modify: `backend/app/modules/tenancy/api.py:486-504` (`update_settings`)
- Test: `backend/tests/test_settings.py` (new file)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_settings.py`:

```python
from __future__ import annotations

from tests.helpers import login


async def test_gym_settings_partial_updates(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {owner['access_token']}"}

    initial = await client.get("/api/v1/settings", headers=headers)
    assert initial.status_code == 200, initial.text
    original = initial.json()

    renamed = await client.patch(
        "/api/v1/settings",
        headers=headers,
        json={"name": "Gym A Renamed", "timezone": "Asia/Dubai"},
    )
    assert renamed.status_code == 200, renamed.text
    body = renamed.json()
    assert body["name"] == "Gym A Renamed"
    assert body["timezone"] == "Asia/Dubai"
    assert body["cross_branch_access"] == original["cross_branch_access"]

    # Partial PATCH (only cross_branch_access) must not reset name/timezone.
    partial = await client.patch(
        "/api/v1/settings", headers=headers, json={"cross_branch_access": True}
    )
    assert partial.status_code == 200, partial.text
    assert partial.json()["name"] == "Gym A Renamed"
    assert partial.json()["cross_branch_access"] is True

    # Short name is rejected.
    bad = await client.patch("/api/v1/settings", headers=headers, json={"name": "x"})
    assert bad.status_code == 422, bad.text

    # Restore gym_a for other tests sharing the fixture.
    restore = await client.patch(
        "/api/v1/settings",
        headers=headers,
        json={
            "name": original["name"],
            "timezone": original["timezone"],
            "cross_branch_access": original["cross_branch_access"],
        },
    )
    assert restore.status_code == 200, restore.text
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_settings.py -q`
Expected: FAIL — `GymSettingsUpdate` ignores `name`/`timezone` (422 extra-forbidden or name unchanged). Note: Pydantic default ignores extra fields, so PATCH succeeds but `name` stays original → assertion fails.

- [ ] **Step 3: Extend the schema**

In `backend/app/modules/tenancy/schemas.py` replace:

```python
class GymSettingsUpdate(BaseModel):
    cross_branch_access: bool = False
```

with:

```python
class GymSettingsUpdate(BaseModel):
    # All fields optional: PATCH is partial, omitted fields stay unchanged.
    cross_branch_access: bool | None = None
    name: str | None = Field(default=None, min_length=2, max_length=200)
    timezone: str | None = None
```

(`Field` is already imported in this file — line 10 uses it.)

- [ ] **Step 4: Make the route partial**

In `backend/app/modules/tenancy/api.py`, `update_settings` (line 486) — replace the single assignment:

```python
    gym.cross_branch_access = body.cross_branch_access
    await session.flush()
```

with:

```python
    if body.name is not None:
        gym.name = body.name.strip()
    if body.timezone is not None:
        gym.timezone = body.timezone
    if body.cross_branch_access is not None:
        gym.cross_branch_access = body.cross_branch_access
    await session.flush()
```

- [ ] **Step 5: Run to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_settings.py tests/test_auth.py -q` → exit 0.

Run: `.venv/bin/ruff check app tests` → `All checks passed!`

- [ ] **Step 6: Commit**

```bash
git add backend/app/modules/tenancy/schemas.py backend/app/modules/tenancy/api.py backend/tests/test_settings.py
git commit -m "feat(settings): partial PATCH accepts gym name + timezone"
```

---

### Task 2d: Gym profile card in Settings UI

**Files:**
- Modify: `apps/web/src/lib/hooks.ts` (`useUpdateGymSettings` body type, line ~989)
- Modify: `apps/web/src/app/(app)/settings/page.tsx`
- Test: `apps/web/e2e/gym_ops_verify.cjs`

- [ ] **Step 1: Write the failing e2e check**

In `apps/web/e2e/gym_ops_verify.cjs`, insert directly after the profile block added in Task 2b:

```js
    // ── Gym profile save persists (name + timezone) ──
    const gymCard = page.locator("div.glass", { hasText: "Gym profile" }).first();
    await gymCard.waitFor({ timeout: 15000 });
    const gName = gymCard.locator("input").first();
    const gTz = gymCard.locator("select").first();
    const origGymName = await gName.inputValue();
    const origTz = await gTz.inputValue();
    await gName.fill(`${origGymName} E2E`);
    await gTz.selectOption("Asia/Dubai");
    await gymCard.getByRole("button", { name: /save gym profile/i }).click();
    await page.getByText("Gym profile updated", { exact: true }).waitFor({ timeout: 10000 });
    // Sidebar tenant name must refresh WITHOUT a reload — proves the save landed
    // and refreshMe ran (adjust the locator to the actual sidebar element if its
    // text isn't exactly the gym name).
    await page.locator("aside").getByText(`${origGymName} E2E`, { exact: true }).waitFor({ timeout: 15000 });
    check("settings: gym profile save refreshes sidebar tenant name", true);
    await page.reload();
    await settle(page);
    const gymCard2 = page.locator("div.glass", { hasText: "Gym profile" }).first();
    const persistedName = await gymCard2.locator("input").first().inputValue();
    const persistedTz = await gymCard2.locator("select").first().inputValue();
    check(
      "settings: gym name + timezone persist after reload",
      persistedName === `${origGymName} E2E` && persistedTz === "Asia/Dubai",
      `${persistedName} / ${persistedTz}`,
    );
    await gymCard2.locator("input").first().fill(origGymName);
    await gymCard2.locator("select").first().selectOption(origTz);
    await gymCard2.getByRole("button", { name: /save gym profile/i }).click();
    // Toast does NOT auto-dismiss — waiting for text here would match the stale
    // pre-restore toast. Assert the restored name in the sidebar instead.
    await page.locator("aside").getByText(origGymName, { exact: true }).waitFor({ timeout: 15000 });
    check("settings: gym profile restored", true);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node e2e/gym_ops_verify.cjs`
Expected: FAIL at `settings: gym name + timezone persist after reload` — the "Gym profile" card does not exist yet (timeout waiting for it).

- [ ] **Step 3: Widen the mutation type**

In `apps/web/src/lib/hooks.ts`, `useUpdateGymSettings` (line ~989):

```ts
    mutationFn: (body: {
      cross_branch_access?: boolean;
      name?: string;
      timezone?: string;
    }) =>
      apiFetch<GymSettingsOut>("/settings", { method: "PATCH", body: JSON.stringify(body) }),
```

(The existing `toggleCrossBranch` call in the settings page keeps working — it passes `cross_branch_access` only.)

- [ ] **Step 4: Add the Gym profile card**

In `apps/web/src/app/(app)/settings/page.tsx`:

1. Imports — add `Select` from `@/components/ui` and `TIMEZONES` from `@/lib/timezones`; change the `react` import (currently `useState` only) to `import { useEffect, useRef, useState } from "react";`.
2. State + one-time seed (alongside the other state):

```tsx
  const [gymName, setGymName] = useState("");
  const [gymTimezone, setGymTimezone] = useState("Asia/Kolkata");
  const settingsSeededRef = useRef(false);

  useEffect(() => {
    if (gymSettings && !settingsSeededRef.current) {
      settingsSeededRef.current = true;
      setGymName(gymSettings.name);
      setGymTimezone(gymSettings.timezone);
    }
  }, [gymSettings]);
```

3. Save handler next to `toggleCrossBranch`:

```tsx
  async function saveGymProfile() {
    try {
      const updated = await updateGymSettings.mutateAsync({
        name: gymName.trim(),
        timezone: gymTimezone,
      });
      // Feed the PATCH response into the auth context (pattern from Task 2b) —
      // the sidebar's tenant_name comes from `me`, and a plain refreshMe() GET
      // would be an extra round trip with a partial-failure window.
      if (me) await refreshMe({ ...me, tenant_name: updated.name });
      setToast("Gym profile updated");
    } catch {
      setToast("Could not save gym profile");
    }
  }
```

(`me` and `refreshMe` are already destructured in the settings page from Task 2b. If `useUpdateGymSettings` response typing doesn't expose `name`, widen its return type — it resolves to `GymSettingsOut` which includes `name`.)

4. Card — insert **inside** the existing `{can("tenancy.settings.manage") && (...)}` block, as a sibling of the Branch access card, wrapping both in the existing `Async` (move `Async` to wrap a `<div className="space-y-6">` containing both cards):

```tsx
          <div className="space-y-6">
            <Card className="p-6">
              <SectionTitle
                title="Gym profile"
                subtitle="Name and timezone shown across the workspace"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Gym name">
                  <Input value={gymName} onChange={(e) => setGymName(e.target.value)} />
                </Field>
                <Field label="Timezone">
                  <Select value={gymTimezone} onChange={(e) => setGymTimezone(e.target.value)}>
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={saveGymProfile} disabled={updateGymSettings.isPending}>
                  {updateGymSettings.isPending ? "Saving…" : "Save gym profile"}
                </Button>
              </div>
            </Card>

            <Card className="p-6">
              {/* existing Branch access card unchanged */}
            </Card>
          </div>
```

(The `SectionTitle` subtitle renders in a `div`, not a `p` — the existing `getByText("Profile", { exact: true })` check stays unambiguous.)

- [ ] **Step 5: Run to verify it passes + typecheck + gate**

Run: `node e2e/gym_ops_verify.cjs` → all checks pass (incl. both new settings checks).
Run: `npx tsc --noEmit` → exit 0.
Run: `NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs` → `22/22 checks passed`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/hooks.ts "apps/web/src/app/(app)/settings/page.tsx" apps/web/e2e/gym_ops_verify.cjs
git commit -m "feat(settings): gym profile card (name + timezone)"
```

---

### Task 3: Create-role form in the UI

**Files:**
- Modify: `apps/web/src/lib/hooks.ts` (add `useCreateRole`)
- Modify: `apps/web/src/app/(app)/roles/page.tsx`
- Test: `apps/web/e2e/gym_ops_verify.cjs:113-131` (replace API-create block)

- [ ] **Step 1: Write the failing e2e check**

In `apps/web/e2e/gym_ops_verify.cjs` replace lines 113–131 (the API-create block ending at `check("roles: custom role visible in UI list", true);`) with:

```js
    // Create the custom role through the UI form.
    await page.getByRole("button", { name: /new role/i }).click();
    const roleModal = page.locator("div.fixed.inset-0"); // Modal root, unique while open
    await roleModal.getByPlaceholder("Front Desk Lead").fill(ROLE_NAME);
    await roleModal.getByPlaceholder("Optional").fill("E2E custom role");
    await roleModal.getByRole("switch", { name: "members.view" }).click();
    await roleModal.getByRole("switch", { name: "notifications.view" }).click();
    await roleModal.getByRole("button", { name: /^Create role \(/ }).click();
    await page.getByText(`Created ${ROLE_NAME}`).waitFor({ timeout: 15000 });
    check("roles: custom role created via UI form", true);

    await page.reload();
    await settle(page);
    const roleCard = page
      .locator("div.glass", { has: page.getByRole("heading", { name: ROLE_NAME, exact: true }) })
      .first();
    await roleCard.waitFor({ timeout: 15000 });
    await roleCard.getByText("2 permissions", { exact: true }).waitFor({ timeout: 10000 });
    check("roles: custom role visible in UI list", true);
```

(The `page.reload()` keeps the rest of the section unchanged — the roles page collapses every card on first load, so the permission-edit steps that follow still work.)

- [ ] **Step 2: Run to verify it fails**

Run: `node e2e/gym_ops_verify.cjs`
Expected: FAIL — no `New role` button (timeout).

- [ ] **Step 3: Add the `useCreateRole` hook**

Append to `apps/web/src/lib/hooks.ts` after `useUpdateRole`:

```ts
export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string; permission_codes: string[] }) =>
      apiFetch<RoleOut>("/permissions/roles", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
    },
  });
}
```

- [ ] **Step 4: Add the modal to the roles page**

In `apps/web/src/app/(app)/roles/page.tsx`:

1. Imports: add `Input`, `Modal` from `@/components/ui`; add `useCreateRole` from `@/lib/hooks`; add `useCan` from `@/lib/permissions` only if gating is desired (skip — page content is already permission-gated by the layout).
2. State + mutation:

```tsx
  const createRole = useCreateRole();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPerms, setNewPerms] = useState<Set<string>>(new Set());

  function toggleNewPerm(code: string) {
    setNewPerms((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function submitNewRole() {
    if (newName.trim().length < 2) {
      setToast("Role name must be at least 2 characters");
      return;
    }
    try {
      await createRole.mutateAsync({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        permission_codes: [...newPerms],
      });
      setCreating(false);
      setNewName("");
      setNewDesc("");
      setNewPerms(new Set());
      setToast(`Created ${newName.trim()}`);
    } catch {
      setToast("Could not create role");
    }
  }
```

3. Header — wrap the intro paragraph and add the button (replaces lines 91–93):

```tsx
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] text-ink-faint">
          Tune what each staff role can view, edit and delete. The Gym Owner role is locked.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          New role
        </Button>
      </div>
```

4. Modal — add just before the closing toast (line ~205):

```tsx
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New role"
        subtitle="Pick the permissions this role starts with"
        width="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Name</span>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Front Desk Lead"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Description</span>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>
          <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
            {Object.entries(byModule).map(([module, perms]) => (
              <div key={module}>
                <p className="kicker mb-1.5">{MODULE_LABELS[module] ?? module}</p>
                <div className="grid gap-x-5 gap-y-1 sm:grid-cols-2">
                  {perms.map((p) => (
                    <div
                      key={p.code}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleNewPerm(p.code)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleNewPerm(p.code);
                        }
                      }}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-fill"
                    >
                      <span className={`block text-[13px] ${newPerms.has(p.code) ? "text-ink" : "text-ink-faint"}`}>
                        {p.description}
                      </span>
                      <span onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={newPerms.has(p.code)}
                          onChange={() => toggleNewPerm(p.code)}
                          label={p.code}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={submitNewRole} disabled={createRole.isPending}>
              {createRole.isPending ? "Creating…" : `Create role (${newPerms.size} perms)`}
            </Button>
          </div>
        </div>
      </Modal>
```

The `stopPropagation` span around `Switch` mirrors the existing card rows (line 181) — without it the row's own `onClick` would double-toggle.

- [ ] **Step 5: Run to verify it passes + typecheck + gate**

Run: `node e2e/gym_ops_verify.cjs` → all checks pass incl. `roles: custom role created via UI form`.
Run: `npx tsc --noEmit` → exit 0.
Run: `NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs` → `22/22 checks passed`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/hooks.ts "apps/web/src/app/(app)/roles/page.tsx" apps/web/e2e/gym_ops_verify.cjs
git commit -m "feat(roles): create-role form with permission picker"
```

---

### Task 4a: Remove nested `<button>` in role card headers

**Files:**
- Modify: `apps/web/src/app/(app)/roles/page.tsx:103-151`
- Test: `apps/web/e2e/gym_ops_verify.cjs` (roles section)

- [ ] **Step 1: Write the failing e2e check**

In `apps/web/e2e/gym_ops_verify.cjs`, insert after `check("roles: Gym Owner shows Locked badge + locked empty state", true);` (line 111):

```js
    // The header's Save button only renders when a card has unsaved edits —
    // make Receptionist dirty so the nested-button bug is observable.
    const recvCard = page
      .locator("div.glass", { has: page.getByRole("heading", { name: "Receptionist", exact: true }) })
      .first();
    await page.getByRole("heading", { name: "Receptionist", exact: true }).click();
    await recvCard.getByRole("switch", { name: "reports.view" }).click();
    await recvCard.getByRole("button", { name: /^Save \(/ }).waitFor({ timeout: 10000 });
    const nestedButtons = await page.locator("button button").count();
    check("roles: no nested <button> elements", nestedButtons === 0, `count=${nestedButtons}`);
    // Revert the toggle without saving so the card is clean again.
    await recvCard.getByRole("switch", { name: "reports.view" }).click();
    await recvCard.getByRole("button", { name: /^Save \(/ }).waitFor({ state: "detached", timeout: 10000 });
```

The check fails with the bug (`count>=1`: the header `<button>` wraps the Save `<Button>`) and passes after Step 3.

- [ ] **Step 2: Run to verify it fails**

Run: `node e2e/gym_ops_verify.cjs`
Expected: FAIL with `count>=1` — the card header `<button>` wraps the Save `<Button>`.

- [ ] **Step 3: Convert the header button to a div**

In `apps/web/src/app/(app)/roles/page.tsx` (line numbers shifted by Task 3 — match by the exact code, not the line number), replace the opening header element:

```tsx
            <button
              type="button"
              onClick={() => toggleCollapsed(role.id)}
              className="flex w-full items-center justify-between gap-3 border-b border-line bg-fill px-5 py-4 text-left transition-colors hover:bg-fill-strong"
            >
```

with:

```tsx
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleCollapsed(role.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleCollapsed(role.id);
                }
              }}
              className="flex w-full cursor-pointer items-center justify-between gap-3 border-b border-line bg-fill px-5 py-4 text-left transition-colors hover:bg-fill-strong"
            >
```

and its closing `</button>` (line 151) with `</div>`. This mirrors the keyboard-accessible `div role="button"` pattern already used by the permission rows in the same file (lines 163–172).

- [ ] **Step 4: Run to verify it passes**

Run: `node e2e/gym_ops_verify.cjs` → all checks pass incl. `roles: no nested <button> elements`.
The comment at lines 136–138 in the script (`accessible name embeds the nested Save label`) can be simplified to remove the stale "nested" rationale — optional.

- [ ] **Step 5: Commit (no shared files → no gate)**

```bash
git add "apps/web/src/app/(app)/roles/page.tsx" apps/web/e2e/gym_ops_verify.cjs
git commit -m "fix(roles): header is div[role=button], no nested buttons"
```

---

### Task 4b: Billing list search

**Files:**
- Modify: `apps/web/src/app/(app)/billing/page.tsx` (state at 107–114, header at 145–148, tbody at 162)
- Test: `apps/web/e2e/frontdesk_verify.cjs:160`

- [ ] **Step 1: Write the failing e2e check**

In `apps/web/e2e/frontdesk_verify.cjs`, after `check("billing page renders summary cards + invoices table", true);` (line 160) insert:

```js
    const searchBox = page.getByPlaceholder(/search/i);
    await searchBox.fill(invAOpen.number);
    await page.locator("tbody tr", { hasText: invAOpen.number }).first().waitFor({ timeout: 10000 });
    const rowsWithB = await page.locator("tbody tr", { hasText: invBOpen.number }).count();
    check("billing search narrows to one invoice", rowsWithB === 0, `other rows=${rowsWithB}`);
    await searchBox.fill("");
    await page.locator("tbody tr", { hasText: invBOpen.number }).first().waitFor({ timeout: 10000 });
    check("billing search clear restores rows", true);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node e2e/frontdesk_verify.cjs`
Expected: FAIL — no search input (placeholder not found).

- [ ] **Step 3: Implement the filter**

In `apps/web/src/app/(app)/billing/page.tsx`:

1. Imports: add `Input` to the `@/components/ui` import.
2. State (next to `paying`):

```tsx
  const [search, setSearch] = useState("");
```

3. Filtered list (after `memberName` definition):

```tsx
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return invoices;
    return invoices.filter(
      (i) =>
        i.number.toLowerCase().includes(needle) ||
        memberName(i.memberId).toLowerCase().includes(needle),
    );
  }, [invoices, search, memberMap]);
```

4. Header (replace lines 145–148):

```tsx
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold tracking-tight">Invoices</h2>
            <div className="flex items-center gap-3">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search invoice # or member"
                className="h-8 w-52 text-[12px]"
              />
              <Badge tone="gray">
                {search.trim() ? `${filtered.length} of ${invoices.length}` : `${invoices.length} total`}
              </Badge>
            </div>
          </div>
```

5. Table body — `invoices.map(...)` becomes `filtered.map(...)`, and inside `tbody` after the map add:

```tsx
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-[13px] text-ink-faint">
                    No invoices match “{search}”.
                  </td>
                </tr>
              )}
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `node e2e/frontdesk_verify.cjs` → all checks pass incl. both search checks.
Run: `npx tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/billing/page.tsx" apps/web/e2e/frontdesk_verify.cjs
git commit -m "feat(billing): search invoices by number or member"
```

---

### Task 4c: Toast on single mark-read

**Files:**
- Modify: `apps/web/src/app/(app)/notifications/page.tsx:63-66`
- Test: `apps/web/e2e/gym_ops_verify.cjs:241-245`

- [ ] **Step 1: Write the failing e2e check**

In `apps/web/e2e/gym_ops_verify.cjs`, after `check("notifications: mark-read clears unread indicator", ...)` (line 245) insert:

```js
    await page.getByText("Notification marked as read").waitFor({ timeout: 10000 });
    check("notifications: single mark-read shows toast", true);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node e2e/gym_ops_verify.cjs`
Expected: FAIL — no toast after clicking a single notification.

- [ ] **Step 3: Add the toast**

In `apps/web/src/app/(app)/notifications/page.tsx` replace `markOne`:

```tsx
  function markOne(n: Notification) {
    if (n.read) return;
    markRead.mutate(n.id);
    setToast("Notification marked as read");
  }
```

(The success `Toast` at line 122 already renders any non-null `toast`.)

- [ ] **Step 4: Run to verify it passes**

Run: `node e2e/gym_ops_verify.cjs` → all checks pass incl. `notifications: single mark-read shows toast`.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/notifications/page.tsx" apps/web/e2e/gym_ops_verify.cjs
git commit -m "fix(notifications): toast on single mark-read"
```

---

## Final verification (all tasks)

- [ ] `cd backend && .venv/bin/python -m pytest -q` → exit 0 (59 + 2 new = 61 tests)
- [ ] `cd backend && .venv/bin/ruff check app tests scripts` → clean
- [ ] `cd apps/web && npx tsc --noEmit` → exit 0
- [ ] `cd apps/web && node e2e/platform_admin_verify.cjs` → 22/22
- [ ] `cd apps/web && for s in plans_verify member_account_verify role_visibility_verify frontdesk_verify gym_ops_verify expenses_verify; do node e2e/$s.cjs | tail -1; done` → all green (frontdesk ≥21, gym_ops ≥24)
- [ ] `make test` → exit 0
