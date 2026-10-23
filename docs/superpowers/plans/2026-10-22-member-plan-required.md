# Plan Required When Adding a Member — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Shipped:** implemented (commits `5bdc499`, `7e87222`, `cbb4c91`, `67a9d30`, `f73b276`, `04f20a7`, `741ae0a`); all gates green, frontdesk 33/33.

**Goal:** `POST /api/v1/members` requires `plan_id` and atomically creates + activates a subscription; the Add-member modal cannot submit without a valid plan.

**Architecture:** One backend cutover (schema gains required `plan_id`; the `create` endpoint orchestrates existing `membership.service.create_subscription` + `activate_subscription` in the same session/transaction — no validation is re-implemented), a mechanical pytest/e2e fixture ripple (every member create gains `plan_id`; now-redundant manual subscribe/activate calls are removed where the auto-created subscription covers them), and the add-modal UI (required plan select filtered to active/branch-compatible plans, dead `status` key removed, copy updated).

**Tech Stack:** FastAPI + SQLAlchemy (session dependency commits/rolls back per request — `deps.py:98-101`), Next.js/React Query, pytest + house e2e scripts.

**Spec:** `docs/superpowers/specs/2026-10-22-member-plan-required-design.md`

**Environment rules:** dev servers (`make dev` :8000, `make web` :3000) stay running — never restart. Playwright `workers: 1` only. House e2e scripts strictly sequential (shared dev DB). Node for unit tests: `PATH="/var/folders/_g/6d1ch_hn6q3446y1r_y_vhp80000gn/T/opencode/node-v24.22.1-darwin-arm64/bin:$PATH" npm test`. Never `git add -A` — stage listed paths only. Retry once on index.lock. No new comments in code (existing style).

**Current baselines:** pytest **120**, ruff clean, tsc clean, npm **22**, `make e2e` **59 passed/1 skipped**, e2e-frontdesk **29**, e2e-member **15**, e2e-roles **18**, e2e-plans **9**, e2e-gym **36**. After Task 1: pytest **125** (5 new). After Task 3: e2e-frontdesk **32** (2 new UI checks; final 33 with the roster regression check).

**Key facts the implementer must know:**
- Plan validation already lives in `create_subscription` (`backend/app/modules/membership/service.py:184-192`): missing/soft-deleted/foreign plan → `NotFoundError("Plan not found", code="NOT_FOUND")` (404); `not plan.is_active` → `ConflictError("Plan is disabled", code="PLAN_DISABLED")` (409); branch-specific plan vs branch → `ConflictError(..., code="PLAN_BRANCH_MISMATCH")` (409). DO NOT re-implement — let these bubble.
- A member who already has an active subscription gets a QUEUED continuation (`service.py:202-218`), never a 409.
- `create_subscription` also creates an OPEN INVOICE (`service.py:242-244`).
- `activate_subscription` (`service.py:257-268`) sets sub `active` and forces member `active` (member created via `create_member` with default status is already active, so the member-side branch is a no-op; `joined_at` is set by `create_member` at `members/service.py:62`).
- Error shape: `response.json()["error"]["code"]` (top-level `error`, not `detail`).
- `GET /plans/subscriptions` returns a plain LIST (not paged) and accepts `member_id` (`membership/api.py:101-110`).
- `PATCH /api/v1/plans/{plan_id}` exists and accepts `is_active` (`membership/api.py:59`; `_PLAN_DETAIL_FIELDS` includes `is_active` at `membership/service.py:148`).
- UI `Plan` type (`mock.ts:44-59`) has `isActive: boolean` and `branchId: string | null` (mapped in `adapters.ts:94-95`).
- `MemberOut.status: string`; `provision_gym(client, platform_token, slug)` creates owner `owner-{slug}@example.com` / `owner-pass-123` (see `test_billing_pagination.py:16-17`).

---

### Task 1: Backend cutover + pytest ripple (single commit)

**Files:**
- Modify: `backend/app/modules/members/schemas.py:9-20`
- Modify: `backend/app/modules/members/api.py:1-64`
- Modify: `backend/tests/test_member_account.py` (new tests, `_create_plan` helper, `_create_member` signature, all call sites, remove now-redundant manual subscribe/activate in `test_member_enable_disable_toggles_checkin` and `test_member_soft_delete`'s cascade neighbor)
- Modify: `backend/tests/test_notifications.py:28-50` (it imports `_create_member` from test_member_account)
- Modify: `backend/tests/test_billing_pagination.py:14-68`
- Modify: `backend/tests/test_auth.py` (~:403), `backend/tests/test_isolation.py` (:21-35, call sites ~:42,:71), `backend/tests/test_members_search.py` (creates ~:30,:45,:61), `backend/tests/test_order_tiebreakers.py` (~:38,:74), `backend/tests/test_slice.py` (~:47), `backend/tests/test_tenant_tier.py` (~:36), `backend/tests/test_branches.py` (~:38 + its `_create_member` helper), `backend/tests/test_plans.py` (~:133), `backend/tests/test_platform_management.py` (~:420,:481)

- [ ] **Step 1: Append the failing regression tests + `_create_plan` helper to `backend/tests/test_member_account.py`**

Add after the existing `_create_member` helper (matching its style):

```python
async def _create_plan(client, token: str, slug: str, **overrides) -> dict:
    payload = {
        "name": "Acct Monthly",
        "slug": slug,
        "billing_period": "monthly",
        "amount_minor": 100000,
        "entry_fee_minor": 0,
        "tax_rate_bp": 1800,
        "duration_months": 1,
        "auto_renew": True,
    }
    payload.update(overrides)
    response = await client.post(
        "/api/v1/plans", headers=_headers(token), json=payload
    )
    assert response.status_code == 201, response.text
    return response.json()
```

Append at end of file:

```python
async def test_member_create_requires_plan(client, gym_acct):
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    response = await client.post(
        "/api/v1/members",
        headers=_headers(token),
        json={"first_name": "No", "last_name": "Plan", "branch_id": branch["id"]},
    )
    assert response.status_code == 422, response.text


async def test_member_create_with_plan_activates_subscription(client, gym_acct):
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    plan = await _create_plan(client, token, "req-plan-a")
    member = await client.post(
        "/api/v1/members",
        headers=_headers(token),
        json={
            "first_name": "Sub",
            "last_name": "Bee",
            "branch_id": branch["id"],
            "plan_id": plan["id"],
        },
    )
    assert member.status_code == 201, member.text
    assert member.json()["status"] == "active"
    subs = await client.get(
        "/api/v1/plans/subscriptions",
        headers=_headers(token),
        params={"member_id": member.json()["id"]},
    )
    assert subs.status_code == 200, subs.text
    body = subs.json()
    assert len(body) == 1, body
    assert body[0]["status"] == "active", body
    assert body[0]["plan_id"] == plan["id"], body


async def test_member_create_rejects_disabled_plan(client, gym_acct):
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    plan = await _create_plan(client, token, "req-plan-disabled")
    patched = await client.patch(
        f"/api/v1/plans/{plan['id']}",
        headers=_headers(token),
        json={"is_active": False},
    )
    assert patched.status_code == 200, patched.text
    response = await client.post(
        "/api/v1/members",
        headers=_headers(token),
        json={
            "first_name": "Dis",
            "last_name": "Abled",
            "branch_id": branch["id"],
            "plan_id": plan["id"],
        },
    )
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "PLAN_DISABLED"


async def test_member_create_rejects_wrong_branch_plan(client, gym_acct):
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch_a = await _create_branch(client, token, "WA")
    branch_b = await _create_branch(client, token, "WB")
    plan = await _create_plan(client, token, "req-plan-scope", branch_id=branch_a["id"])
    response = await client.post(
        "/api/v1/members",
        headers=_headers(token),
        json={
            "first_name": "Wrong",
            "last_name": "Branch",
            "branch_id": branch_b["id"],
            "plan_id": plan["id"],
        },
    )
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "PLAN_BRANCH_MISMATCH"


async def test_member_create_rejects_foreign_plan(client, gym_acct, platform_token):
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    await provision_gym(client, platform_token, "foreignplan")
    foreign_owner = await login(client, "owner-foreignplan@example.com", "owner-pass-123")
    foreign_plan = await _create_plan(
        client, foreign_owner["access_token"], "foreign-only-plan"
    )
    response = await client.post(
        "/api/v1/members",
        headers=_headers(token),
        json={
            "first_name": "For",
            "last_name": "Eign",
            "branch_id": branch["id"],
            "plan_id": foreign_plan["id"],
        },
    )
    assert response.status_code == 404, response.text
    assert response.json()["error"]["code"] == "NOT_FOUND"
```

(`platform_token` and `provision_gym` are already used by this file's `gym_acct` fixture — imports exist.)

- [ ] **Step 2: Run the new tests — expect FAIL**

Run: `cd backend && .venv/bin/python -m pytest tests/test_member_account.py::test_member_create_requires_plan tests/test_member_account.py::test_member_create_with_plan_activates_subscription -v`
Expected: FAIL — `plan_id` is currently ignored, so the first returns 201 (not 422) and the second finds zero subscriptions.

- [ ] **Step 3: Edit `backend/app/modules/members/schemas.py` — add required `plan_id` to `MemberCreate`**

After the `branch_id: uuid.UUID` line:

```python
    plan_id: uuid.UUID
```

- [ ] **Step 4: Edit `backend/app/modules/members/api.py` — orchestrate create + subscribe + activate**

Add to the imports (alphabetical, alongside the existing `app.modules.members.service` import block):

```python
from app.modules.membership.service import (
    activate_subscription,
    create_subscription,
)
```

Replace the `create` endpoint body with (keep the existing `create_member(...)` call exactly as-is between the scope check and the new calls):

```python
@router.post("", response_model=MemberOut, status_code=201)
async def create(
    body: MemberCreate,
    actor: Annotated[Actor, Depends(require_permission("members.create"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> MemberOut:
    perms = await get_effective_permissions(session, actor.user_id)
    assert_branch_in_scope(perms, "members.create", body.branch_id)
    member = await create_member(
        session,
        tenant_id=actor.tenant_id,
        branch_id=body.branch_id,
        first_name=body.first_name,
        last_name=body.last_name,
        email=str(body.email) if body.email else None,
        phone=body.phone,
        country_code=body.country_code,
        gender=body.gender,
        status=body.status,
        is_active=body.is_active,
        notes=body.notes,
    )
    sub = await create_subscription(
        session,
        tenant_id=actor.tenant_id,
        member_id=member.id,
        plan_id=body.plan_id,
        branch_id=body.branch_id,
    )
    await activate_subscription(session, sub.id)
    return MemberOut.model_validate(member)
```

(The session dependency commits on success / rolls back on any raised error (`deps.py:98-101`), so the member, subscription, and invoice are one atomic unit — if plan validation raises, nothing persists.)

- [ ] **Step 5: Re-run the new tests — expect PASS**

Run: `cd backend && .venv/bin/python -m pytest tests/test_member_account.py::test_member_create_requires_plan tests/test_member_account.py::test_member_create_with_plan_activates_subscription tests/test_member_account.py::test_member_create_rejects_disabled_plan tests/test_member_account.py::test_member_create_rejects_wrong_branch_plan tests/test_member_create_rejects_foreign_plan -v`
Expected: `5 passed`

- [ ] **Step 6: Update `backend/tests/test_member_account.py` for the new contract**

6a. Change the `_create_member` helper signature and payload — plan_id becomes a required parameter (remove the now-meaningless `"status": "active"` line; the default is active):

```python
async def _create_member(
    client, token: str, branch_id: str, plan_id: str, **overrides
) -> dict:
    global _counter
    _counter += 1
    payload = {
        "first_name": "Ada",
        "last_name": "Lovelace",
        "email": f"ada-acct-{_counter}@example.com",
        "phone": "9000000000",
        "country_code": "+91",
        "gender": "Female",
        "branch_id": branch_id,
        "plan_id": plan_id,
    }
    payload.update(overrides)
    response = await client.post(
        "/api/v1/members", headers=_headers(token), json=payload
    )
    assert response.status_code == 201, response.text
    return response.json()
```

6b. Fix EVERY `_create_member(...)` call site in the file (search: `rg -n "_create_member\(" tests/test_member_account.py`). Recipe per call site: create a plan immediately before (unique slug — reuse the file's `_counter` pattern or a per-test literal slug; plans are per-gym so a literal slug per TEST is fine as long as it is unique within the `acct` gym), then pass `plan["id"]`:

```python
    plan = await _create_plan(client, token, "<unique-slug-per-test>")
    member = await _create_member(client, token, branch["id"], plan["id"])
```

Apply to the tests around lines 64 (defaults), 81 (enable/disable), 149 (soft delete), 168 (update), 182 (cascade).

6c. `test_member_create_defaults_is_active` — the helper now sends an explicit plan; keep the raw-create sub-test working by adding `plan_id` to the raw payload (still NO `status`, so it still asserts the default):

```python
    plan = await _create_plan(client, token, "defaults-raw-plan")
    raw = await client.post(
        "/api/v1/members",
        headers=_headers(token),
        json={
            "first_name": "Default",
            "last_name": "Status",
            "branch_id": branch["id"],
            "plan_id": plan["id"],
        },
    )
    assert raw.status_code == 201, raw.text
    assert raw.json()["status"] == "active"
```

6d. `test_member_enable_disable_toggles_checkin` — delete the now-redundant manual plan POST + subscribe + activate block (the member create already produced an active subscription); keep everything from `me = await client.get(...)` onward.

6e. The cascade test (soft-delete cascade around lines 181-220) — after creating the member with a plan, delete the manual `_subscribe(...)` + activate POST lines; the auto-created active subscription is what the cascade assertions should use. Keep the `_subscribe` helper itself if other tests in the file still use it (`rg "_subscribe\(" tests/test_member_account.py` first — if no remaining callers, delete the helper too).

- [ ] **Step 7: Update `backend/tests/test_notifications.py` (imports the shared helper)**

Reorder: create the plan BEFORE the member; pass `plan_id`; delete the manual subscribe block (lines ~30-50). Target shape:

```python
    branch = await _create_branch(client, token, name="Notify")
    plan = await client.post(
        "/api/v1/plans",
        headers=headers,
        json={
            "name": "Notify Monthly",
            "slug": "notify-monthly",
            "billing_period": "monthly",
            "amount_minor": 100000,
        },
    )
    assert plan.status_code == 201, plan.text
    member = await _create_member(client, token, branch["id"], plan.json()["id"])
```

(The subsequent invoice lookup at :52-53 still finds the member's auto-created invoice.)

- [ ] **Step 8: Update `backend/tests/test_billing_pagination.py`**

In `_seed_gym_with_invoices`: add `"plan_id": plan.json()["id"]` to the member payload (line ~42-49) and DELETE the manual subscribe block (lines ~52-61). The auto-created subscription yields exactly one open invoice per member, which is what the helper already fetches (`items[0]`) and what the `total >= 3` / `outstanding == unit_total * 3` / `q=buddy1 total==1` assertions expect.

- [ ] **Step 9: Update the remaining nine test files**

For each file: run `rg -n '"/api/v1/members"' <file>` to find every POST create (ignore GETs). Add a `_create_plan` helper (copy the Task 1 Step 1 helper, adjusting the default slug prefix to the file), create a plan in the test before the member POST, add `"plan_id": plan["id"]` to the payload, and (where present) delete any now-redundant manual `/plans/subscribe` + activate calls made FOR THAT MEMBER. Per file:

- `test_auth.py` (~:403): one create inside the auth/permissions test — plan + plan_id. Keep the `"status": "inactive"` line (status field still exists; this test only needs a member row).
- `test_isolation.py` (:21-35): local `_create_member(client, token, branch_id, first_name)` helper — extend to `_create_member(client, token, branch_id, plan_id, first_name)`, plan created per test (two tests at ~:42,:71; each provisions its own gym via `provision_gym`, so slug per test e.g. `iso-plan-a`/`iso-plan-b`).
- `test_members_search.py` (~:30,:45,:61): one plan per test, all member creates in the test share it.
- `test_order_tiebreakers.py` (~:38,:74): two tests, each creates a branch inline — add an inline plan POST before each member loop; all members in a loop share the one plan. If the test then posts `/plans/subscribe` for a member (~:92 area is a checkin — verify with `rg "subscribe" tests/test_order_tiebreakers.py`), remove it only if it was creating the member's sole subscription.
- `test_slice.py` (~:47), `test_tenant_tier.py` (~:36), `test_plans.py` (~:133 — has `_create_plan` already, just pass its id), `test_platform_management.py` (~:420,:481 — owner-context creates; add a plan POST before each, unique slugs) — same recipe.
- `test_branches.py` (~:38): if the file has a local `_create_member` helper, extend it like 6a; otherwise inline plan + plan_id.

Watch for assertion shifts: any test asserting subscription/invoice COUNTS after member creates now sees the auto-created subscription + invoice. If a suite failure reveals one, prefer adapting the assertion to the new world (member create ⇒ 1 active sub + 1 open invoice) over weakening it.

- [ ] **Step 10: Full backend suite + lint — expect 125 passed, ruff clean**

Run: `cd backend && .venv/bin/python -m pytest`
Expected: `125 passed` (120 baseline + 5 new)

Run: `cd backend && .venv/bin/python -m ruff check app tests`
Expected: `All checks passed!`

- [ ] **Step 11: Commit**

```bash
git add backend/app/modules/members/schemas.py backend/app/modules/members/api.py \
  backend/tests/test_member_account.py backend/tests/test_notifications.py \
  backend/tests/test_billing_pagination.py backend/tests/test_auth.py \
  backend/tests/test_isolation.py backend/tests/test_members_search.py \
  backend/tests/test_order_tiebreakers.py backend/tests/test_slice.py \
  backend/tests/test_tenant_tier.py backend/tests/test_branches.py \
  backend/tests/test_plans.py backend/tests/test_platform_management.py
git commit -m "feat(members): create requires plan and activates subscription atomically"
```

(If Step 9's sweep finds the file list differs — e.g. an additional file with a POST create found by the greps — add it to the staging list; never stage with `git add -A`.)

---

### Task 2: Frontend — add modal requires a plan

**Files:**
- Modify: `apps/web/src/lib/hooks.ts:680-698` (`useCreateMember` body type)
- Modify: `apps/web/src/app/(app)/members/page.tsx` (imports :21-31, hook instances :88-89, form init :96-104, `addMember` :118-148, plans filter near :93, branch select :439-447, plan field :449-461, subtitle + submit button in the add modal)

- [ ] **Step 1: `apps/web/src/lib/hooks.ts` — `useCreateMember` body type**

Replace the inline body type with:

```ts
    mutationFn: (body: {
      first_name: string;
      last_name?: string;
      email?: string;
      phone?: string;
      country_code?: string;
      gender?: string;
      branch_id: string;
      plan_id: string;
    }) => apiFetch<MemberOut>("/members", { method: "POST", body: JSON.stringify(body) }),
```

(`status?` is gone; `plan_id` is required. Confirm the only caller is `members/page.tsx` — `rg "useCreateMember" apps/web/src`.)

- [ ] **Step 2: `members/page.tsx` — remove the dead subscribe/activate flow and unused form key**

- Delete the `useSubscribe` and `useActivateSubscription` imports (:28-29) and their instances (:88-89).
- Delete the `status: "active",` line from the `form` useState init (:113) — the add modal has no status control and the create body no longer sends it (verify with `rg "form\.status" "apps/web/src/app/(app)/members/page.tsx"` → no hits after removal).
- Replace the `addMember` body (the `createMember.mutateAsync` + `if (form.planId)` subscribe/activate block) with:

```ts
  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    const nameParts = form.name.trim().split(/\s+/);
    if (!nameParts[0] || !form.planId) return;
    await addGuard.run(async () => {
      try {
        await createMember.mutateAsync({
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(" ") || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
          country_code: form.countryCode || undefined,
          gender: form.gender,
          branch_id: form.branchId,
          plan_id: form.planId,
        });
        setOpen(false);
        setToast({ type: "success", message: `${form.name.trim()} added` });
        setForm({ name: "", email: "", countryCode: "+91", phone: "", gender: "Male", branchId: form.branchId, planId: "" });
      } catch {
        setToast({ type: "error", message: "Failed to add member" });
      }
    });
  }
```

- [ ] **Step 3: Filtered plan options + required select**

Add after `const branchMap = byId(branches);` (~:94):

```ts
  const visiblePlans = plans.filter(
    (p) => p.isActive && (p.branchId === null || p.branchId === form.branchId),
  );
```

Branch select `onChange` (~:441) — clear an incompatible plan selection:

```tsx
                onChange={(e) => setForm({ ...form, branchId: e.target.value, planId: "" })}
```

Replace the whole `<Field label="Intended plan">…</Field>` block with:

```tsx
            <Field label="Plan">
              <Select
                id="member-plan"
                aria-label="Plan"
                value={form.planId}
                onChange={(e) => setForm({ ...form, planId: e.target.value })}
              >
                {visiblePlans.length === 0 ? (
                  <option value="">No plans — create one first</option>
                ) : (
                  <option value="" disabled>
                    Select a plan…
                  </option>
                )}
                {visiblePlans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
```

Add-modal subtitle (search for `subtitle="Members can subscribe to a plan later."`):

```tsx
      <Modal open={open} onClose={() => setOpen(false)} title="Add member" subtitle="Subscription starts immediately.">
```

Add-modal submit button:

```tsx
            <Button type="submit" disabled={addGuard.busy || !form.planId}>
```

(Keep the `addGuard.busy ? "Adding…" : "Add member"` label as-is.)

- [ ] **Step 4: Typecheck + unit tests + platform suite (hooks.ts is shared)**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output

Run: `cd apps/web && PATH="/var/folders/_g/6d1ch_hn6q3446y1r_y_vhp80000gn/T/opencode/node-v24.22.1-darwin-arm64/bin:$PATH" npm test`
Expected: `pass 22`, `fail 0`

Run (repo root): `make e2e`
Expected: `59 passed`, `1 skipped`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/hooks.ts "apps/web/src/app/(app)/members/page.tsx"
git commit -m "feat(web): add-member modal requires plan, drops client-side subscribe"
```

---

### Task 3: e2e adaptations (frontdesk, member_account, gym_ops)

**Files:**
- Modify: `apps/web/e2e/frontdesk_verify.cjs` (:53-135 fixture block, :264-269 pending locator, new add-member UI check, teardown list)
- Modify: `apps/web/e2e/member_account_verify.cjs` (:47-91)
- Modify: `apps/web/e2e/gym_ops_verify.cjs` (:296-335)

- [ ] **Step 1: `frontdesk_verify.cjs` — fixture block**

Replace the `// ── API fixtures` section so plans come first, members carry `plan_id` (no `status`), and member B gets its pending sub by a second, queued subscribe to plan A:

```js
    const planA = await post("/plans", {
      name: PLAN_A,
      slug: `fd-plan-a-${ts}`,
      billing_period: "monthly",
      amount_minor: 120000,
    });
    const planB = await post("/plans", {
      name: PLAN_B,
      slug: `fd-plan-b-${ts}`,
      billing_period: "monthly",
      amount_minor: 90000,
    });
    const memberA = await post("/members", {
      first_name: MEMBER_A,
      last_name: "Roster",
      email: `fd-alpha-${ts}@example.com`,
      phone: "9000000001",
      country_code: "+91",
      gender: "Male",
      branch_id: branchId,
      plan_id: planA.body.id,
    });
    const memberB = await post("/members", {
      first_name: MEMBER_B,
      last_name: "Roster",
      email: `fd-beta-${ts}@example.com`,
      phone: "9000000002",
      country_code: "+91",
      gender: "Female",
      branch_id: branchId,
      plan_id: planB.body.id,
    });
    // Queued continuation: member B's active term stays; this pending sub is
    // the Activate-button fixture below.
    const pendingSubB = await post("/plans/subscribe", {
      member_id: memberB.body.id,
      plan_id: planA.body.id,
      branch_id: branchId,
    });
```

(Delete the old memberA/memberB/planA/planB/subA/actA/subB ordering — plans now precede members.)

Replace the `fixturesOk` block and its `check` with:

```js
    const fixturesOk =
      memberA.status === 201 &&
      memberB.status === 201 &&
      planA.status === 201 &&
      planB.status === 201 &&
      pendingSubB.status === 201 &&
      !!invAOpen &&
      !!invBOpen;
    check(
      "API fixtures ready (2 members, 2 plans, activated + pending subs, open invoices)",
      fixturesOk,
      `members ${memberA.status}/${memberB.status} pendingSub ${pendingSubB.status} inv ${invAOpen?.number}/${invBOpen?.number}`,
    );
```

(The invoice fetches `invA`/`invB` stay after the member creates — each auto-created subscription already produced an open invoice.)

- [ ] **Step 2: `frontdesk_verify.cjs` — pending-activation locators**

Member B now has TWO subscription rows (active plan B + pending plan A). Scope the row locators by badge text:

```js
    const subRowB = page
      .locator("tbody tr", { hasText: MEMBER_B })
      .filter({ hasText: "Pending" });
    await subRowB.first().waitFor({ timeout: 15000 });
    await subRowB.first().getByRole("button", { name: "Activate" }).click();
    await page.getByText("subscription activated").waitFor({ timeout: 15000 });
    const subRowBActive = page
      .locator("tbody tr", { hasText: MEMBER_B })
      .filter({ hasText: "Active" });
    await must(
      "member B pending subscription activated via UI",
      subRowBActive.first().getByText("Active", { exact: true }).waitFor({ timeout: 10000 }),
    );
```

(`subRowA` stays unchanged — member A has a single active row.)

- [ ] **Step 3: `frontdesk_verify.cjs` — add-member UI requires a plan (2 new checks)**

Declare `let uiMemberId = null;` next to the other id lets (~:40-43). Immediately after the members-list render check ("members page renders with total count + Add member"), insert:

```js
    // Add-member modal cannot submit without a plan.
    await page.getByRole("button", { name: "Add member" }).click();
    const addModal = page.locator("form").last();
    await addModal.locator("input").first().fill(`FD UI ${ts}`);
    check(
      "add-member submit disabled without a plan",
      await addModal.getByRole("button", { name: "Add member" }).isDisabled(),
    );
    await addModal.locator('select[aria-label="Plan"]').selectOption(planB.body.id);
    await addModal.getByRole("button", { name: "Add member" }).click();
    await page.getByText(`FD UI ${ts} added`).waitFor({ timeout: 15000 });
    check("add-member with plan succeeds (toast + auto subscription)", true);
    const uiCreated = await (
      await api.get(`${BASE}/api/v1/members?search=FD%20UI%20${ts}`, { headers: auth })
    ).json();
    uiMemberId = uiCreated.items[0]?.id ?? null;
```

Extend the teardown list with `["members", uiMemberId, "UI-created member"],` after the member B entry.

- [ ] **Step 4: `member_account_verify.cjs` — plan before member, no manual subscribe**

Replace the member-create + plan + subscribe + activate section (~:47-91) with:

```js
    // Create a plan first; member creation now requires and auto-activates it.
    const planRes = await api.post(`${BASE}/api/v1/plans`, {
      headers: auth,
      data: {
        name: `Renew Plan ${ts}`,
        slug: `renew-plan-${ts}`,
        billing_period: "monthly",
        amount_minor: 100000,
        auto_renew: false,
      },
    });
    const plan = await planRes.json();
    renewPlanId = plan.id;
    const created = await api.post(`${BASE}/api/v1/members`, {
      headers: auth,
      data: {
        first_name: "E2E",
        last_name: `Acct ${ts}`,
        email: `e2e-acct-${ts}@example.com`,
        phone: "9000000000",
        country_code: "+91",
        gender: "Male",
        branch_id: branchId,
        plan_id: plan.id,
      },
    });
    const member = await created.json();
    check("member created via API with plan", created.status() === 201, member.id);
    check("plan created", planRes.status() === 201, plan.slug);
```

(Delete the `/plans/subscribe` + activate POSTs and the `check("plan + subscription created", ...)` line they fed. The upgrade-plan creation at ~:93-104 stays.)

- [ ] **Step 5: `gym_ops_verify.cjs` — fallback fixture**

Inside the `if (!openInv)` block (~:296-335): create the plan BEFORE the member, add `plan_id: plan.id` to the member payload (drop `status`), delete the subscribe + activate POSTs, keep the `condMemberId`/`condPlanId` assignments and the invoice refetch:

```js
      const plan = await (
        await api.post(`${BASE}/api/v1/plans`, {
          headers: auth,
          data: {
            name: `E2E Ops Plan ${ts}`,
            slug: `e2e-ops-plan-${ts}`,
            billing_period: "monthly",
            amount_minor: 100000,
          },
        })
      ).json();
      const member = await (
        await api.post(`${BASE}/api/v1/members`, {
          headers: auth,
          data: {
            first_name: "E2E",
            last_name: `Ops ${ts}`,
            email: `e2e-ops-${ts}@example.com`,
            phone: "9000000000",
            country_code: "+91",
            gender: "Male",
            branch_id: branches[0].id,
            plan_id: plan.id,
          },
        })
      ).json();
      condMemberId = member.id;
      condPlanId = plan.id;
      invoices = await (await api.get(`${BASE}/api/v1/invoices?page_size=100`, { headers: auth })).json();
      openInv = invoices.items.find((i) => i.status === "open" || i.status === "overdue");
```

- [ ] **Step 6: Run the five house e2e scripts, strictly sequential**

Run one at a time from repo root, waiting for each:

```bash
make e2e-frontdesk   # expected 33/33 (29 + 2 new add-member checks + roster regression)
make e2e-member      # expected 15/15
make e2e-roles       # expected 18/18
make e2e-plans       # expected 9/9
make e2e-gym         # expected 36/36
```

If a script fails: read the failing check's name/output, diagnose against the spec (the product now auto-subscribes+activates on member create), fix minimally (test-side adaptation preferred where the old assertion encoded the old two-step world), re-run THAT script to green, then continue.

- [ ] **Step 7: Commit**

```bash
git add apps/web/e2e/frontdesk_verify.cjs apps/web/e2e/member_account_verify.cjs \
  apps/web/e2e/gym_ops_verify.cjs
git commit -m "test: adapt e2e fixtures to plan-required member creation"
```

(If fallout fixes touched other files, stage those specifically too.)

---

### Task 4: Full gate run

**Files:** none (verification only; fix fallout in the file that caused it and commit with its own message)

- [ ] **Step 1: Backend gates**

Run: `cd backend && .venv/bin/python -m pytest`
Expected: `125 passed`

Run: `cd backend && .venv/bin/python -m ruff check app tests`
Expected: `All checks passed!`

- [ ] **Step 2: Frontend gates**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output

Run: `cd apps/web && PATH="/var/folders/_g/6d1ch_hn6q3446y1r_y_vhp80000gn/T/opencode/node-v24.22.1-darwin-arm64/bin:$PATH" npm test`
Expected: `pass 22`, `fail 0`

- [ ] **Step 3: Platform suite**

Run: `make e2e`
Expected: `59 passed`, `1 skipped`

- [ ] **Step 4: House e2e scripts, strictly sequential**

```bash
make e2e-frontdesk   # expected 33/33
make e2e-member      # expected 15/15
make e2e-roles       # expected 18/18
make e2e-plans       # expected 9/9
make e2e-gym         # expected 36/36
```

- [ ] **Step 5: Commit any fallout fixes**

```bash
git add <specific files fixed>
git commit -m "test: adapt <domain> to plan-required member creation"
```

(No commit needed if every gate passed on the first run.)

---

## Self-review notes (plan vs spec)

- Spec §API contract → Task 1 Steps 3-4 (required `plan_id`, one transaction via the session dependency, existing validation codes bubble: NOT_FOUND / PLAN_DISABLED / PLAN_BRANCH_MISMATCH, `members.create` alone suffices).
- Spec §backend implementation → Task 1 Step 4; `members/service.py` untouched; `import_gms.py`/`seed_dev.py` untouched (service-layer callers).
- Spec §frontend → Task 2 (single POST, filtered plan select, branch-clears-plan, empty-list message, subtitle, dead form key removed; status select was already absent from the add modal — only the dead `status: "active"` form-state key remains, removed in Step 2).
- Spec §pytest ripple → Task 1 Steps 6-9 (~15 creates / 11 files + the helper-importing test_notifications); new tests cover all five contract cases (Task 1 Step 1); invoice/subscription count hazards called out in Steps 8-9.
- Spec §e2e ripple → Task 3 (frontdesk/member_account/gym_ops + frontdesk add-member UI checks covering the "cannot submit without a plan" success criterion; plans/roles/expenses/platform audited — no member creates).
- Spec §out of scope → no detail-page button, no service-layer enforcement, plans Subscribe flow untouched.
- Type consistency: `plan_id` naming identical across schema (`uuid.UUID`), API orchestration, hook body type (`string`), e2e payloads, and pytest payloads; UI uses `isActive`/`branchId` (UI Plan shape), backend uses `is_active`/`branch_id` (API shape) — no cross-contamination.
- Deviation noted: spec said "status dropdown removed from the add modal" — investigation during planning showed the add modal never had one (only the two EDIT modals do, and they keep it per spec's out-of-scope section); the plan instead removes the dead form-state key, which is the only add-modal trace.
