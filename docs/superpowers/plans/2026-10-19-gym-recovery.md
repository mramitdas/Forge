# Gym Soft-Delete Recovery + Integrity Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two soft-delete integrity gaps (incomplete `Member` cascade on gym delete, tier-delete guard that orphans soft-deleted gyms) and add full recovery for soft-deleted gyms with an opt-in list view.

**Architecture:** Three backend changes in `backend/app/modules/tenancy/service.py` + `api.py` + `schemas.py` (cascade fix, guard widening, restore service + endpoint + list param), plus a frontend toggle + Restore action in `apps/web`. Restore un-tombstones by matching the shared `deleted_at` timestamp that `delete_gym` stamps across gym/users/branches/members, so it revives exactly what that delete cascaded.

**Tech Stack:** FastAPI + SQLAlchemy async, Pydantic v2, pytest (async, `client`/`platform_token` fixtures), React 18 + TanStack Query + `apiFetch`, `tsc --noEmit` + vitest for FE gates.

**Spec:** `docs/superpowers/specs/2026-10-19-gym-recovery-design.md`

---

## Context You Need (read before starting)

- Backend runs from `backend/`. Gates: `.venv/bin/python -m pytest -q`, `.venv/bin/ruff check app tests scripts`. Current pytest baseline **85** (will grow), ruff clean.
- Frontend runs from `apps/web/`. Gates: `npx tsc --noEmit`, `npm test` (10 unit tests). Platform e2e gate: `cd apps/web && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs` — **must stay 22/22**.
- Dev servers are ALREADY RUNNING on :8000/:3000 — do NOT restart them.
- Frozen platform surface (AGENTS.md): `/platform/**` behavior must stay byte-identical when new params/actions are off. All new backend behavior is opt-in (`include_deleted` defaults false; restore is a new endpoint). The UI toggle defaults off. After ANY change to platform pages, run the platform e2e gate.
- Platform-only nav/routes live in `apps/web/src/app/(app)/platform/**`. Gym Owner is the only locked role (422 `ROLE_LOCKED`).
- `Gym`, `User`, `Branch`, `Member` all inherit `SoftDeleteMixin` (`deleted_at`, `deleted_by`). `delete_gym` currently cascades `User` + `Branch` with a single shared `now = datetime.now(UTC)`.
- Test DB is rebuilt per pytest session via `conftest.py:migrated_database` (autouse, session-scoped) — no manual migration step needed for a new column; but a real alembic migration IS required for the `GymOut` field? No — `GymOut` is a response schema, not a DB column. `deleted_at` already exists on the `Gym` model. No migration needed anywhere in this plan.
- Pytest async tests need `@pytest.mark.anyio`? No — check existing tests: `test_platform_management.py` defines plain `async def test_...` with no decorator, and `conftest.py` supplies `anyio_backend` (session) + `client` (session). Match that style exactly.
- Never `git add -A`. Stage specific paths.

---

### Task 1: Cascade `Member` in `delete_gym`

**Files:**
- Modify: `backend/app/modules/tenancy/service.py:186-219` (`delete_gym`)
- Test: `backend/tests/test_platform_management.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_platform_management.py` (imports at top already include everything needed via `tests.helpers`):

```python
async def test_delete_gym_cascades_members(client, platform_token):
    """Gym delete must tombstone members, not just users + branches."""
    gym = await provision_gym(client, platform_token, "delcasc")
    owner = await login(client, "owner-delcasc@example.com", "owner-pass-123")
    oh = {"Authorization": f"Bearer {owner['access_token']}"}

    branch = await client.post(
        "/api/v1/branches",
        headers=oh,
        json={"name": "Main", "code": "DC", "timezone": "Asia/Kolkata", "country_code": "+91"},
    )
    assert branch.status_code == 201, branch.text
    member = await client.post(
        "/api/v1/members",
        headers=oh,
        json={
            "first_name": "Casc", "last_name": "Member",
            "email": "casc-member@example.com", "phone": "9000000000",
            "country_code": "+91", "branch_id": branch.json()["id"], "status": "active",
        },
    )
    assert member.status_code == 201, member.text

    deleted = await client.delete(
        f"/api/v1/platform/gyms/{gym['id']}",
        headers={"Authorization": f"Bearer {platform_token}"},
    )
    assert deleted.status_code == 204

    # The member row must be soft-deleted. Verify via direct DB read (the
    # member list endpoint scopes through the gym, so it would hide the row
    # either way).
    from app.db.session import get_sessionmaker
    from app.modules.members.models import Member

    maker = get_sessionmaker()
    async with maker() as session:
        row = await session.get(Member, member.json()["id"])
        assert row is not None
        assert row.deleted_at is not None
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_platform_management.py::test_delete_gym_cascades_members -v`
Expected: FAIL with `AssertionError` on `row.deleted_at is not None` (member not tombstoned).

- [ ] **Step 3: Implement the cascade**

In `backend/app/modules/tenancy/service.py`, `delete_gym` — add the member loop after the branches loop (after line ~210, before `await session.flush()`). `Member` is imported at line 18; `Branch` at line 21. Insert:

```python
    members = await session.scalars(
        select(Member)
        .join(Branch, Member.branch_id == Branch.id)
        .where(Branch.gym_id == gym_id, Member.deleted_at.is_(None))
    )
    for member in members:
        member.deleted_at = now
        member.deleted_by = actor_id
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_platform_management.py::test_delete_gym_cascades_members -v`
Expected: PASS

- [ ] **Step 5: Run full backend suite (no regressions)**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: all pass (count now 86). If any pre-existing test asserted members survive a gym delete, update it — but none should, since the cascade was incomplete before.

- [ ] **Step 6: Commit**

```bash
git add backend/app/modules/tenancy/service.py backend/tests/test_platform_management.py
git commit -m "fix(tenancy): cascade Member soft-delete on gym delete"
```

---

### Task 2: Widen `delete_tier` guard to block on any referencing gym

**Files:**
- Modify: `backend/app/modules/tenancy/service.py:548-563` (`delete_tier`)
- Test: `backend/tests/test_platform_management.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_platform_management.py`:

```python
async def test_delete_tier_blocked_by_soft_deleted_gym(client, platform_token):
    """A soft-deleted gym still referencing a tier must block its deletion."""
    created = await client.post(
        "/api/v1/platform/tiers",
        headers={"Authorization": f"Bearer {platform_token}"},
        json={"code": "ghost", "name": "Ghost", "max_branches": 1, "max_members": 10},
    )
    assert created.status_code == 201, created.text

    gym = await provision_gym(client, platform_token, "ghostgym")
    changed = await client.patch(
        f"/api/v1/platform/subscriptions/{gym['id']}",
        headers={"Authorization": f"Bearer {platform_token}"},
        json={"tier_code": "ghost"},
    )
    assert changed.status_code == 200, changed.text

    deleted_gym = await client.delete(
        f"/api/v1/platform/gyms/{gym['id']}",
        headers={"Authorization": f"Bearer {platform_token}"},
    )
    assert deleted_gym.status_code == 204

    # The gym is soft-deleted but still references 'ghost'. Deletion of the
    # tier must be refused.
    blocked = await client.delete(
        "/api/v1/platform/tiers/ghost",
        headers={"Authorization": f"Bearer {platform_token}"},
    )
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "TIER_IN_USE"

    # A soft-deleted gym can't be re-pointed via the API (change_gym_tier
    # returns 404 for deleted gyms), so re-point it with a direct DB write —
    # this mirrors an operator cleaning up tombstoned rows before deleting a
    # tier. Then the tier becomes deletable.
    from app.db.session import get_sessionmaker
    from app.modules.tenancy.models import Gym

    maker = get_sessionmaker()
    async with maker() as session:
        row = await session.get(Gym, gym["id"])
        row.tier_code = "starter"
        await session.commit()

    allowed = await client.delete(
        "/api/v1/platform/tiers/ghost",
        headers={"Authorization": f"Bearer {platform_token}"},
    )
    assert allowed.status_code == 204
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_platform_management.py::test_delete_tier_blocked_by_soft_deleted_gym -v`
Expected: FAIL with `AssertionError` on `blocked.status_code == 409` (currently returns 204 because the guard ignores deleted gyms).

- [ ] **Step 3: Implement the guard widening**

In `backend/app/modules/tenancy/service.py`, `delete_tier` — change the count query to drop the `deleted_at` filter and update the message. Replace lines ~552-561 with:

```python
    in_use = await session.scalar(
        select(func.count())
        .select_from(Gym)
        .where(Gym.tier_code == code)
    )
    if in_use:
        raise ConflictError(
            "Tier is still referenced by gyms (including deleted ones); "
            "re-point those gyms before deleting",
            code="TIER_IN_USE",
        )
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_platform_management.py::test_delete_tier_blocked_by_soft_deleted_gym -v`
Expected: PASS

- [ ] **Step 5: Run the pre-existing tier-delete test**

Run: `cd backend && .venv/bin/python -m pytest tests/test_platform_management.py::test_tier_in_use_cannot_be_deleted tests/test_platform_management.py::test_tier_crud -v`
Expected: both PASS (`test_tier_crud` deletes a `boutique` tier that no gym references — still allowed; `test_tier_in_use_cannot_be_deleted` blocks `starter`, which live gyms reference — still allowed).

- [ ] **Step 6: Run full backend suite**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: all pass (87). ruff: `cd backend && .venv/bin/ruff check app tests scripts` — clean.

- [ ] **Step 7: Commit**

```bash
git add backend/app/modules/tenancy/service.py backend/tests/test_platform_management.py
git commit -m "fix(tenancy): block tier delete when any gym (live or deleted) references it"
```

---

### Task 3: Add `deleted_at` to `GymOut` + `include_deleted` on `list_gyms`

**Files:**
- Modify: `backend/app/modules/tenancy/schemas.py:20-31` (`GymOut`)
- Modify: `backend/app/modules/tenancy/api.py:89-98` (`list_gyms`)
- Test: `backend/tests/test_platform_management.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_platform_management.py`:

```python
async def test_list_gyms_include_deleted_flag(client, platform_token):
    """Default list hides deleted gyms; include_deleted=true shows them."""
    gym = await provision_gym(client, platform_token, "listdel")
    headers = {"Authorization": f"Bearer {platform_token}"}

    deleted = await client.delete(f"/api/v1/platform/gyms/{gym['id']}", headers=headers)
    assert deleted.status_code == 204

    default = await client.get("/api/v1/platform/gyms", headers=headers)
    assert default.status_code == 200
    assert all(g["slug"] != "listdel" for g in default.json())

    with_deleted = await client.get(
        "/api/v1/platform/gyms?include_deleted=true", headers=headers
    )
    assert with_deleted.status_code == 200
    row = next(g for g in with_deleted.json() if g["slug"] == "listdel")
    assert row["deleted_at"] is not None


async def test_gym_out_live_gym_has_null_deleted_at(client, platform_token):
    """A live gym still serializes deleted_at=None (response shape unchanged)."""
    gym = await provision_gym(client, platform_token, "livedel")
    headers = {"Authorization": f"Bearer {platform_token}"}
    listing = await client.get("/api/v1/platform/gyms", headers=headers)
    row = next(g for g in listing.json() if g["slug"] == "livedel")
    assert row["deleted_at"] is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_platform_management.py::test_list_gyms_include_deleted_flag tests/test_platform_management.py::test_gym_out_live_gym_has_null_deleted_at -v`
Expected: FAIL — `row["deleted_at"]` raises `KeyError` (field not in `GymOut` yet).

- [ ] **Step 3: Add `deleted_at` to `GymOut`**

In `backend/app/modules/tenancy/schemas.py`, `GymOut` — add after `created_at` (line 29):

```python
    deleted_at: datetime | None = None
```

`datetime` is already imported at the top of `schemas.py` (used by `created_at`).

- [ ] **Step 4: Add `include_deleted` to `list_gyms`**

In `backend/app/modules/tenancy/api.py`, `list_gyms` — change the signature and query. Replace lines ~89-98 with:

```python
@platform_router.get("/gyms", response_model=list[GymOut])
async def list_gyms(
    actor: Annotated[Actor, Depends(require_permission("platform.gyms.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
    include_deleted: bool = False,
) -> list[Gym]:
    stmt = select(Gym)
    if not include_deleted:
        stmt = stmt.where(Gym.deleted_at.is_(None))
    result = await session.scalars(stmt.order_by(Gym.name))
    return list(result)
```

(The exact dependency names — `Actor`, `require_permission`, `get_session_for_actor` — must match whatever the existing `list_gyms` already uses; only the query + new param change. Read the current function first and preserve its existing imports/deps verbatim, adding only `include_deleted: bool = False` and the `if not include_deleted:` branch.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_platform_management.py::test_list_gyms_include_deleted_flag tests/test_platform_management.py::test_gym_out_live_gym_has_null_deleted_at -v`
Expected: both PASS

- [ ] **Step 6: Run full backend suite + ruff**

Run: `cd backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check app tests scripts`
Expected: all pass (89), ruff clean.

- [ ] **Step 7: Commit**

```bash
git add backend/app/modules/tenancy/schemas.py backend/app/modules/tenancy/api.py backend/tests/test_platform_management.py
git commit -m "feat(tenancy): expose GymOut.deleted_at + opt-in include_deleted list"
```

---

### Task 4: `restore_gym` service + `POST /platform/gyms/{id}/restore` endpoint

**Files:**
- Modify: `backend/app/modules/tenancy/service.py` (new `restore_gym` after `delete_gym`, ~line 220)
- Modify: `backend/app/modules/tenancy/api.py` (new endpoint after `remove_gym`, ~line 129)
- Test: `backend/tests/test_platform_management.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_platform_management.py`:

```python
async def test_restore_gym_full_cascade(client, platform_token):
    """Restore un-tombstones the gym + users + branches + members."""
    gym = await provision_gym(client, platform_token, "restgym")
    owner = await login(client, "owner-restgym@example.com", "owner-pass-123")
    oh = {"Authorization": f"Bearer {owner['access_token']}"}
    headers = {"Authorization": f"Bearer {platform_token}"}

    branch = await client.post(
        "/api/v1/branches", headers=oh,
        json={"name": "Main", "code": "RG", "timezone": "Asia/Kolkata", "country_code": "+91"},
    )
    assert branch.status_code == 201, branch.text
    member = await client.post(
        "/api/v1/members", headers=oh,
        json={
            "first_name": "Rest", "last_name": "Member",
            "email": "rest-member@example.com", "phone": "9000000000",
            "country_code": "+91", "branch_id": branch.json()["id"], "status": "active",
        },
    )
    assert member.status_code == 201, member.text

    deleted = await client.delete(f"/api/v1/platform/gyms/{gym['id']}", headers=headers)
    assert deleted.status_code == 204

    restored = await client.post(
        f"/api/v1/platform/gyms/{gym['id']}/restore", headers=headers
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["deleted_at"] is None

    # Owner can log in again (user un-tombstoned).
    allowed = await login(client, "owner-restgym@example.com", "owner-pass-123")
    assert allowed["access_token"]

    # Member is alive again.
    from app.db.session import get_sessionmaker
    from app.modules.members.models import Member

    maker = get_sessionmaker()
    async with maker() as session:
        row = await session.get(Member, member.json()["id"])
        assert row.deleted_at is None


async def test_restore_gym_later_deleted_member_stays_deleted(client, platform_token):
    """A member deleted AFTER the gym delete (different timestamp) stays deleted."""
    gym = await provision_gym(client, platform_token, "restdiff")
    owner = await login(client, "owner-restdiff@example.com", "owner-pass-123")
    oh = {"Authorization": f"Bearer {owner['access_token']}"}
    headers = {"Authorization": f"Bearer {platform_token}"}

    branch = await client.post(
        "/api/v1/branches", headers=oh,
        json={"name": "Main", "code": "RD", "timezone": "Asia/Kolkata", "country_code": "+91"},
    )
    assert branch.status_code == 201, branch.text
    member = await client.post(
        "/api/v1/members", headers=oh,
        json={
            "first_name": "Diff", "last_name": "Member",
            "email": "diff-member@example.com", "phone": "9000000001",
            "country_code": "+91", "branch_id": branch.json()["id"], "status": "active",
        },
    )
    assert member.status_code == 201, member.text

    assert (await client.delete(f"/api/v1/platform/gyms/{gym['id']}", headers=headers)).status_code == 204

    # Soft-delete the member independently (simulates a later manual delete).
    # This happens after the gym delete, so its deleted_at differs.
    from app.db.session import get_sessionmaker
    from app.modules.members.models import Member
    from datetime import UTC, datetime

    maker = get_sessionmaker()
    async with maker() as session:
        row = await session.get(Member, member.json()["id"])
        row.deleted_at = datetime.now(UTC)
        await session.commit()

    restored = await client.post(
        f"/api/v1/platform/gyms/{gym['id']}/restore", headers=headers
    )
    assert restored.status_code == 200, restored.text

    async with maker() as session:
        row = await session.get(Member, member.json()["id"])
        assert row.deleted_at is not None  # the later delete is preserved


async def test_restore_gym_errors(client, platform_token):
    """Restore: 404 missing gym, 409 live gym, 409 disabled tier."""
    headers = {"Authorization": f"Bearer {platform_token}"}

    missing = await client.post(
        "/api/v1/platform/gyms/00000000-0000-0000-0000-000000000000/restore", headers=headers
    )
    assert missing.status_code == 404

    gym = await provision_gym(client, platform_token, "restlive")
    live = await client.post(f"/api/v1/platform/gyms/{gym['id']}/restore", headers=headers)
    assert live.status_code == 409
    assert live.json()["detail"]["code"] == "GYM_NOT_DELETED"

    # Disable the gym's tier, then delete + restore the gym -> 409 TIER_DISABLED.
    disabled = await client.patch(
        "/api/v1/platform/tiers/starter",
        headers=headers,
        json={"is_active": False},
    )
    assert disabled.status_code == 200
    assert (await client.delete(f"/api/v1/platform/gyms/{gym['id']}", headers=headers)).status_code == 204
    blocked = await client.post(f"/api/v1/platform/gyms/{gym['id']}/restore", headers=headers)
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "TIER_DISABLED"
    # Re-enable for other tests.
    await client.patch("/api/v1/platform/tiers/starter", headers=headers, json={"is_active": True})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_platform_management.py -k restore -v`
Expected: FAIL — 404/`AttributeError` (endpoint doesn't exist yet).

- [ ] **Step 3: Implement `restore_gym` service**

In `backend/app/modules/tenancy/service.py`, add after `delete_gym` (after line ~219). `NotFoundError`/`ConflictError` are imported (line 10); `Member` (18), `Branch` (21), `Gym` (22) imported; `bus` (12) imported.

```python
async def restore_gym(
    session: AsyncSession,
    *,
    gym_id: uuid.UUID,
) -> Gym:
    """Un-soft-delete a gym and everything `delete_gym` cascaded.

    Restores only rows whose `deleted_at` matches the gym's `deleted_at`
    exactly — i.e. the set tombstoned by that single delete. Rows a user
    deleted later (different timestamp) are left deleted.
    """
    gym = await session.get(Gym, gym_id)
    if gym is None:
        raise NotFoundError("Gym not found", code="NOT_FOUND")
    if gym.deleted_at is None:
        raise ConflictError("Gym is not deleted", code="GYM_NOT_DELETED")

    stamp = gym.deleted_at

    tier = await session.get(SubscriptionTier, gym.tier_code)
    if tier is None:
        raise ConflictError("Gym's tier no longer exists", code="TIER_MISSING")
    if not tier.is_active:
        raise ConflictError("Gym's tier is disabled", code="TIER_DISABLED")

    users = await session.scalars(
        select(User).where(User.tenant_id == gym_id, User.deleted_at == stamp)
    )
    for user in users:
        user.deleted_at = None
        user.deleted_by = None

    branches = await session.scalars(
        select(Branch).where(Branch.gym_id == gym_id, Branch.deleted_at == stamp)
    )
    branch_ids = []
    for branch in branches:
        branch.deleted_at = None
        branch.deleted_by = None
        branch_ids.append(branch.id)

    members = await session.scalars(
        select(Member).where(Member.branch_id.in_(branch_ids), Member.deleted_at == stamp)
    ) if branch_ids else []
    for member in members:
        member.deleted_at = None
        member.deleted_by = None

    gym.deleted_at = None
    gym.deleted_by = None
    await session.flush()
    await bus.emit(
        session,
        tenant_id=gym_id,
        aggregate_type="gym",
        aggregate_id=gym_id,
        event_type="tenancy.gym.restored",
        payload={"gym_id": str(gym_id)},
    )
    return gym
```

- [ ] **Step 4: Implement the endpoint**

In `backend/app/modules/tenancy/api.py`, add after `remove_gym` (~line 129). Import `restore_gym` alongside the other service imports at the top (where `delete_gym` is imported). Match the exact dependency style of `remove_gym` (read it first — `Actor`, `require_permission`, `get_session_for_actor`). Add:

```python
@platform_router.post("/gyms/{gym_id}/restore", response_model=GymOut)
async def restore_gym_endpoint(
    gym_id: str,
    actor: Annotated[Actor, Depends(require_permission("platform.gyms.update"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> Gym:
    return await restore_gym(session, gym_id=gym_id)
```

(If `remove_gym` uses a different session dependency or actor type, copy it verbatim — only the service call and path/response differ.)

- [ ] **Step 5: Run the restore tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_platform_management.py -k restore -v`
Expected: all three PASS.

- [ ] **Step 6: Run full backend suite + ruff**

Run: `cd backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check app tests scripts`
Expected: all pass (92), ruff clean.

- [ ] **Step 7: Commit**

```bash
git add backend/app/modules/tenancy/service.py backend/app/modules/tenancy/api.py backend/tests/test_platform_management.py
git commit -m "feat(tenancy): restore_gym service + POST /platform/gyms/{id}/restore"
```

---

### Task 5: Frontend — types, hooks, UI toggle + Restore action

**Files:**
- Modify: `apps/web/src/lib/types.ts:189-199` (`GymOut`)
- Modify: `apps/web/src/lib/hooks.ts` (`usePlatformGyms`, new `useRestoreGym`)
- Modify: `apps/web/src/app/(app)/platform/gyms/page.tsx`

- [ ] **Step 1: Add `deleted_at` to the `GymOut` TS type**

In `apps/web/src/lib/types.ts`, `GymOut` — add after `created_at: string;` (line 198):

```typescript
  deleted_at?: string | null;
```

- [ ] **Step 2: Parameterize `usePlatformGyms` + add `useRestoreGym`**

In `apps/web/src/lib/hooks.ts`:

Replace `usePlatformGyms` (lines 839-848) with:

```typescript
export function usePlatformGyms(includeDeleted = false): {
  gyms: GymOut[];
  isLoading: boolean;
  isError: boolean;
} {
  const q = useQuery({
    queryKey: ["platform", "gyms", includeDeleted],
    queryFn: () =>
      apiFetch<GymOut[]>(
        `/platform/gyms${includeDeleted ? "?include_deleted=true" : ""}`,
      ),
  });
  return useMemo(
    () => ({ gyms: q.data ?? [], isLoading: q.isLoading, isError: q.isError }),
    [q.data, q.isLoading, q.isError],
  );
}
```

Add `useRestoreGym` right after `useDeleteGym` (after line ~921), matching `useDeleteGym`'s style (read it first — invalidation list, `apiFetch`):

```typescript
export function useRestoreGym() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (gymId: string) =>
      apiFetch<GymOut>(`/platform/gyms/${gymId}/restore`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform", "gyms"] }),
  });
}
```

- [ ] **Step 3: Wire the UI toggle + Restore action**

In `apps/web/src/app/(app)/platform/gyms/page.tsx`:

- Import `useRestoreGym` alongside the other hook imports (line ~20, next to `useDeleteGym`).
- Add state next to `deleteGym` (line ~33): `const [showDeleted, setShowDeleted] = useState(false);` and `const restoreGym = useRestoreGym();`
- Change the gyms query call (find where `usePlatformGyms()` is called) to `usePlatformGyms(showDeleted)`.
- Add the toggle near the header/table. Insert immediately before the `<table>` (line ~139), inside the same container:

```tsx
        <label className="flex items-center gap-2 text-[13px] text-ink-soft">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)}
            className="accent-accent"
          />
          Show deleted
        </label>
```

- In the table body's Actions cell (the `<td>` around line ~187-205 that renders Edit/Suspend/Delete buttons), branch on `gym.deleted_at`. Read the existing Actions cell first and preserve the live-row buttons verbatim; render Restore only for deleted rows. Insert at the top of the Actions cell's conditional logic:

```tsx
                        {gym.deleted_at ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={restoreGym.isPending}
                            onClick={() =>
                              restoreGym.mutate(gym.id, {
                                onSuccess: () => setToast(`${gym.name} restored`),
                                onError: () => setToast("Could not restore gym"),
                              })
                            }
                          >
                            {restoreGym.isPending ? "Restoring…" : "Restore"}
                          </Button>
                        ) : (
                          /* existing Edit / Suspend / Delete buttons, unchanged */
                        )}
```

- Dim deleted rows: on the `<tr>` (or the gym-name `<td>`), if `gym.deleted_at` is set add `className="opacity-60"`. Preserve existing row classes.

- [ ] **Step 4: Frontend type gate**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean (no output).

- [ ] **Step 5: Frontend unit gate**

Run: `cd apps/web && npm test`
Expected: 10 pass, 0 fail (these hooks/type changes shouldn't affect existing unit tests).

- [ ] **Step 6: Platform e2e gate (frozen surface)**

Run: `cd apps/web && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs`
Expected: 22/22. The toggle defaults off, so the default gym list is unchanged and all existing checks (provision/edit/suspend/enable/delete) must still pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/lib/hooks.ts "apps/web/src/app/(app)/platform/gyms/page.tsx"
git commit -m "feat(platform/gyms): Show deleted toggle + Restore action"
```

---

### Task 6: E2E — delete a gym, restore it via the toggle

**Files:**
- Modify: `apps/web/e2e/platform_admin_verify.cjs` (extend the gyms section, after the existing delete check ~line 139)

- [ ] **Step 1: Read the existing gyms-delete block**

Read `apps/web/e2e/platform_admin_verify.cjs` around lines 121-139 (the `// ── Gyms: delete ... ──` block that ends with `check("gym deleted from table", ...)`). Note the exact variable names (`ts`, `BASE`, `page`, `check`, `must`) and how the row is located (`page.locator("tr", { hasText: \`Verify Gym ${ts}\` })`).

- [ ] **Step 2: Append the restore e2e steps**

Immediately after the existing `check("gym deleted from table", stillThere === 0, ...)` line (still inside the same try block, before the subscriptions section), insert:

```javascript
    // ── Gyms: restore the just-deleted gym via "Show deleted" ──
    const showDeleted = page.locator('label:has-text("Show deleted") input');
    await showDeleted.check();
    const deletedRow = page.locator("tr", { hasText: `Verify Gym ${ts}` }).first();
    await deletedRow.waitFor({ timeout: 15000 });
    await deletedRow.getByRole("button", { name: "Restore" }).click();
    await must(
      "gym restored via Show deleted toggle",
      page.getByText(new RegExp(`Verify Gym ${ts} restored`)).waitFor({ timeout: 10000 }),
    );
    await showDeleted.uncheck();
    const backRow = page.locator("tr", { hasText: `Verify Gym ${ts}` }).first();
    await backRow.waitFor({ timeout: 15000 });
    check("restored gym reappears in live list", (await backRow.count()) > 0);
```

- [ ] **Step 3: Run the platform e2e gate**

Run: `cd apps/web && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs`
Expected: 24/24 (22 existing + 2 new). If the count differs, inspect which check failed and fix before proceeding.

- [ ] **Step 4: Run the full e2e battery (all scripts)**

Run each sequentially from `apps/web`, one at a time (never in parallel):

```bash
NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/plans_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/member_account_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/role_visibility_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/frontdesk_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/gym_ops_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/expenses_verify.cjs
```

Expected: every script passes (platform 24/24; others at or above their baselines — plans 9, member_account 15, role_visibility 18, frontdesk 29, gym_ops 33, expenses 13).

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/platform_admin_verify.cjs
git commit -m "test(e2e): gym restore via Show deleted toggle"
```

---

### Task 7: Full battery + final verification

- [ ] **Step 1: Backend battery**

Run: `cd backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check app tests scripts`
Expected: all tests pass (92), ruff clean.

- [ ] **Step 2: Frontend battery**

Run: `cd apps/web && npx tsc --noEmit && npm test`
Expected: tsc clean, 10 unit tests pass.

- [ ] **Step 3: Platform e2e gate (must be green — frozen surface touched)**

Run: `cd apps/web && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs`
Expected: 24/24.

- [ ] **Step 4: Confirm working tree clean**

Run: `git status --short`
Expected: empty (all changes committed across Tasks 1-6).

- [ ] **Step 5: Deliver summary**

Report: per-task commit SHAs, final pytest count, e2e baselines (actual), and the one behavior change worth flagging — `delete_tier` now refuses to delete a tier that any soft-deleted gym still references, so operators must re-point those gyms first (new error message reflects this).
