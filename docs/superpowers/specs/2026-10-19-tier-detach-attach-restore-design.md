# Tier detach on delete + attach-on-restore — design

Date: 2026-10-19
Status: approved (verbal, in session)

## Problem

Two gaps left by the gym soft-delete recovery round:

1. `delete_tier` refuses to delete a tier that **any** gym references,
   including soft-deleted gyms (Task 2 of the recovery round). A tombstoned
   gym therefore keeps a tier pinned in the catalog forever — there is no
   API to re-point a deleted gym (`change_gym_tier` 404s on it).
2. If the tier a tombstoned gym referenced is deleted or disabled meanwhile,
   `restore_gym` hard-fails with `TIER_MISSING` / `TIER_DISABLED`. There is
   no way to re-activate the gym from the UI.

## Desired flow

- Deleting a gym releases its tier: `delete_tier` succeeds when only
  soft-deleted gyms reference the tier. Live gyms still block deletion.
- Re-activating (restoring) a gym whose old tier is gone or disabled asks
  the operator to **attach a subscription** from the list of active tiers.
- Restoring a gym whose old tier still exists and is active stays a
  one-click action (no new friction on the default path).

## Decisions (user-approved)

1. **Guard counts live gyms only** — `delete_tier` counts
   `Gym.tier_code == code AND Gym.deleted_at IS NULL`. Reverses the
   recovery round's Task 2 decision. Dangling `tier_code` strings on
   tombstoned gyms are acceptable: `Gym.tier_code` is a plain `String(40)`
   with no FK, and the gym is invisible while deleted.
2. **Attach at restore, not afterwards** — `POST /platform/gyms/{id}/restore`
   accepts an optional JSON body `{"tier_code": "..."}`.
   - No body: current behavior byte-identical — gym's existing tier must
     exist and be active, else 409 `TIER_MISSING` / `TIER_DISABLED`.
   - With body: tier must exist and be active (409 `UNKNOWN_TIER` /
     `TIER_DISABLED`, matching `change_gym_tier`), then `gym.tier_code` is
     updated, `_apply_tier` closes the old open entitlement and opens a new
     one, `_record_tier_change` writes a `GymSubscriptionEvent` with the
     actor — the same audit path as a normal tier change. Entitlement/event
     writes happen only when the supplied tier differs from the gym's
     current `tier_code` (same rule as `change_gym_tier`); supplying the
     tier it already has is valid and simply lets the restore proceed.
   - All validation runs **before** any un-tombstoning, so a rejected body
     never leaves a half-restored gym.
3. **UI prompts conditionally** — on Restore click the gyms page looks up
   `gym.tier_code` in its already-loaded `usePlatformTiers()` list:
   - exists and `is_active` → silent restore (today's behavior).
   - missing or inactive → open an "Attach a subscription" modal with a
     dropdown of active tiers only; confirm sends
     `restore({ gymId, tierCode })`.
   - Race fallback: if a silent restore still returns 409 `TIER_MISSING` /
     `TIER_DISABLED` (tier deleted between page load and click), open the
     attach modal instead of a generic error toast.

## Components touched

| Layer  | File | Change |
|--------|------|--------|
| backend | `app/modules/tenancy/service.py` | `delete_tier` live-only count + reverted message; `restore_gym(gym_id, tier_code=None, actor_user_id, actor_email)` |
| backend | `app/modules/tenancy/schemas.py` | `RestoreGymRequest { tier_code: str \| None }` |
| backend | `app/modules/tenancy/api.py` | restore endpoint accepts optional body, passes actor |
| backend | `tests/test_platform_management.py` | invert soft-delete tier test; attach tests |
| web | `src/lib/hooks.ts` | `useRestoreGym` accepts `{ gymId, tierCode? }`, sends body only when present |
| web | `src/app/(app)/platform/gyms/page.tsx` | conditional attach modal + 409 catch |
| e2e | `e2e/platform_admin_verify.cjs` | tier-delete-after-gym-delete + attach-on-restore scenario |

## Error codes

- `TIER_IN_USE` (409) — only a **live** gym references the tier.
- `UNKNOWN_TIER` (409) — supplied `tier_code` not found (shared with `change_gym_tier`).
- `TIER_DISABLED` (409) — target tier inactive.
- `TIER_MISSING` (409) — no body supplied and gym's own tier was deleted.
- `GYM_NOT_DELETED` (409), `NOT_FOUND` (404) — unchanged.

## Non-goals

- `change_gym_tier` still 404s on deleted gyms; restore is the only re-attach path.
- `TenantEntitlement` / `GymSubscriptionEvent` rows keep old tier codes as audit history.
- No DB migration (plain strings, no FK).
- Platform admin panel changes are explicitly approved for this feature
  (frozen-surface exception); default paths must remain byte-identical and
  the platform gate must stay green.

## Testing

- Unit (pytest): inverted `delete_tier` test (204 for deleted-only refs,
  409 for live refs); restore-with-supplied-`tier_code` updates tier + writes event;
  invalid body leaves gym deleted; no-body path regression.
- E2E (platform gate): existing silent-restore check unchanged; new
  scenario creates custom tier `gymt-${ts}`, assigns, deletes gym, deletes
  that tier (must succeed), Show deleted → Restore → attach modal → pick
  active tier → toast → gym reappears. Full 7-script battery after.

## Addendum: usage guard on tier disable (2026-10-19 follow-up)

`update_tier` gains the same live-gym check `delete_tier` already has:
a **disable transition** (`is_active: false` while the tier is currently
active) counts live gyms (`deleted_at IS NULL`) on the tier → 409
`TIER_IN_USE`, message *"Tier is still referenced by
gyms; re-point those gyms before disabling"*. Re-enabling and all other
field edits (name/price/limits) stay unguarded.

- UI: subscriptions-page toggle appends the server message to its error
  toast (`Could not update tier: …`) so the operator sees why; the switch
  already reverts (server-driven state).
- E2E: platform gate +1 check — toggling the in-use `starter` tier shows
  the error toast and leaves the switch on (28 → 29).
- Tests: new pytest for the 409; `test_disabled_tier_blocks_assignment`
  reworked onto its own unused custom tier (it previously disabled `pro`,
  which a live gym references).
