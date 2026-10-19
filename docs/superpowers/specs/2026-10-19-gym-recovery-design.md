# Gym soft-delete recovery + integrity fixes

Date: 2026-10-19
Status: Approved (design)

## Problem

Three related gaps in the tenancy soft-delete model:

1. **Incomplete cascade.** `delete_gym` tombstones `Gym`, `User`, and `Branch`
   rows but not `Member`. Members stay `deleted_at = NULL` and are only
   invisible because queries scope through the gym/tenant. Inconsistent with
   `delete_branch`, which does cascade members.
2. **Tier orphan.** `delete_tier`'s in-use guard counts only live gyms
   (`deleted_at IS NULL`). A tier can be hard-deleted while soft-deleted gyms
   still reference it via `Gym.tier_code`, leaving dangling references. (All
   current consumers tolerate a missing tier, so this is integrity-only, not a
   crash — but it should not be possible.)
3. **No recovery.** There is no path to un-soft-delete a gym. `delete_gym` is
   irreversible from the API.

## Decisions (locked)

- **Full restore** on recovery: un-tombstone the gym, its users, its branches,
  and its members — exactly the set `delete_gym` cascades.
- **Tier delete guard widens** to block on *any* referencing gym, live or
  deleted. A tier is undeletable while any gym row points at it.
- **Visibility** for deleted gyms via an opt-in query param
  `GET /platform/gyms?include_deleted=true`, not a separate endpoint. Default
  behavior (param absent/false) is unchanged.

## Design

### 1. Cascade `Member` in `delete_gym`

`backend/app/modules/tenancy/service.py` — `delete_gym` gains a third cascade
loop, matching the users/branches pattern. Members have `branch_id` (not
`gym_id`), so reach them by joining through `Branch`:

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

This runs before `session.flush()`, alongside the existing user/branch loops,
so the whole cascade shares the same `now` timestamp.

### 2. Widen `delete_tier` guard

`backend/app/modules/tenancy/service.py` — `delete_tier` drops the
`deleted_at.is_(None)` filter so soft-deleted gyms also block:

```python
in_use = await session.scalar(
    select(func.count()).select_from(Gym).where(Gym.tier_code == code)
)
if in_use:
    raise ConflictError(
        "Tier is still referenced by gyms (including deleted ones); "
        "re-point those gyms before deleting",
        code="TIER_IN_USE",
    )
```

Consequence: to delete a tier, every gym that ever used it (live or deleted)
must first be moved to another tier. This makes the tier orphan impossible.

### 3. Restore service

`backend/app/modules/tenancy/service.py` — new `restore_gym`:

- **Lookup:** fetch the gym; `NotFoundError` if missing; `ConflictError`
  (`GYM_NOT_DELETED`) if `deleted_at is None` (can't restore a live gym).
- **Timestamp match:** capture `gym.deleted_at`. Un-tombstone only rows whose
  `deleted_at` equals that exact timestamp. This revives precisely what that
  delete cascaded and leaves alone anything a user deleted by hand afterward
  (different timestamp).
- **Gym:** `deleted_at = None`, `deleted_by = None`.
- **Users:** `tenant_id == gym_id AND deleted_at == stamp`.
- **Branches:** `gym_id == gym_id AND deleted_at == stamp`.
- **Members:** `branch_id IN (gym's branches) AND deleted_at == stamp`.
- **Tier check:** the gym's `tier_code` must still resolve to an existing,
  `is_active` tier; otherwise `ConflictError` (`TIER_DISABLED` /
  `TIER_MISSING`) so we never resurrect a gym on a dead tier.
- **Event:** `bus.emit(... event_type="tenancy.gym.restored" ...)`.

All four models (`Gym`, `User`, `Branch`, `Member`) use `SoftDeleteMixin`
(`deleted_at`/`deleted_by`), so restore is uniform: set both to `None`.

### 4. Restore endpoint

`backend/app/modules/tenancy/api.py`:

```
POST /platform/gyms/{gym_id}/restore   →  200 GymOut
```

- Permission: `platform.gyms.update` (inverse of delete, which uses the same).
- Session: `get_session_for_actor`.

### 5. List visibility

`backend/app/modules/tenancy/api.py` — `list_gyms` accepts
`include_deleted: bool = False`. When true, the `deleted_at IS NULL` filter is
omitted so live + deleted gyms return.

`GymOut` (`schemas.py:20`) does not currently expose `deleted_at`, so it gains
`deleted_at: datetime | None = None`. The UI uses it to tell live from deleted
rows, render deleted rows distinctly, and show only the Restore action on them.
Default `None` keeps existing responses unchanged for live gyms.

Default (param absent/false) is byte-identical to current behavior, so the
frozen platform surface is unaffected unless the toggle is on.

### 6. UI

`apps/web/src/app/(app)/platform/gyms/page.tsx`:

- "Show deleted" toggle near the table header.
- When on, deleted gyms render (dimmed) with a "Restore" action; live gyms keep
  existing Edit/Suspend/Delete actions.
- Restore calls the new endpoint, then refreshes; a restored gym rejoins the
  normal live list.
- Platform-only nav/routes are frozen for v1 — this adds a new action + a
  default-off toggle, which does not change existing behavior when off.

## Error handling

| Case | Result |
| --- | --- |
| Restore a live gym | 409 `GYM_NOT_DELETED` |
| Restore a gym whose tier was deleted | 409 `TIER_MISSING` |
| Restore a gym whose tier is disabled | 409 `TIER_DISABLED` |
| Delete a tier referenced by any gym (live or deleted) | 409 `TIER_IN_USE` |
| Restore a gym id that doesn't exist | 404 `NOT_FOUND` |

## Testing

Backend (pytest, `backend/tests/`):

- `delete_gym` cascades members (gym with branch + members → after delete, all
  members tombstoned with the same `deleted_at`).
- `delete_tier` blocked by a *soft-deleted* gym still referencing it (409).
- `delete_tier` succeeds once all referencing gyms (live and deleted) are
  re-pointed.
- `restore_gym` full restore: gym + users + branches + members all un-tombstoned;
  a member the user deleted *after* the gym delete (different timestamp) stays
  deleted.
- `restore_gym` on a live gym → 409; on a missing gym → 404; on a gym whose
  tier is disabled/missing → 409.
- `list_gyms` default excludes deleted; `include_deleted=true` includes them.

E2E (`apps/web/e2e/platform_admin_verify.cjs`): extend the gym section to
delete a gym, toggle "Show deleted", restore it, and assert it returns to the
live list. Existing gate must stay green (default list behavior unchanged).

Gates after implementation: backend pytest + ruff; `apps/web` `tsc --noEmit` +
unit tests; full battery, with the platform gate required to stay 22/22 (its
default-path assertions are unaffected).

## Out of scope

- Hard delete of gyms (still not exposed; manual SQL only).
- Recovering gyms deleted before this feature existed in a way that didn't
  share a cascade timestamp — the timestamp-match rule only guarantees restore
  of cascades performed by the fixed `delete_gym`.
- Reversing `tenancy.gym.removed` outbox events (restore emits a new
  `restored` event rather than deleting the `removed` one).
