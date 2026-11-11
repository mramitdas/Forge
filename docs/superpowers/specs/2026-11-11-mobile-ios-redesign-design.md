# Mobile iOS HIG redesign

**Date:** 2026-11-11 · **Status:** approved · **Approach:** A — custom iOS HIG kit in Expo

Redesign `apps/mobile` from a 7-tab gray utility app into a light, minimal iOS Human Interface Guidelines product. Full product pass: visual system, navigation, and each screen’s layout. Same Expo 58 app, same FastAPI `/api/v1` client, same TanStack Query. No backend changes. No new UI library.

Does not replace `docs/superpowers/specs/2026-11-11-mobile-erp-design.md` (that spec is the ERP surface). This spec is the visual and navigation product for that surface.

## Goal

Forge mobile should feel like a first-party iOS app: large titles, grouped inset lists, system tint, SF-style type, and a 3+More tab bar. Owners and front-desk staff complete Home, Members, Subscriptions, Check-In, Billing, Expenses, Notifications, and Settings without learning a custom chrome language.

## Non-goals

- Dark mode / follow-system appearance
- Member create or edit
- Subscription create, renew, or upgrade
- Push notifications
- Offline write queue
- Changes to web `DESIGN.md` or the web app
- Hand-authored `ios/` or `android/` native folders
- New npm UI kits (React Native Paper, NativeBase, Tamagui, etc.)

## Approaches considered

A. Custom iOS HIG kit in Expo (chosen). Tokens + primitives in `src/ui/`. Exact HIG, Expo 58 safe.
B. Third-party iOS kit. Faster chrome, weaker control, SDK risk.
C. NativeWind iOS theme. Fast restyle, never true HIG.

## Navigation & shell

Tab bar has four items (HIG 3 primary + More). Translucent tab bar, system-blue `#007AFF` active tint, secondary gray inactive, SF-style icons via `@expo/vector-icons` (SF Symbols names where Ionicons/MaterialCommunityIcons match; otherwise the closest iOS-like glyph).

| Tab | Route | Icon intent |
| --- | --- | --- |
| Home | `/(tabs)/home` | house |
| Members | `/(tabs)/members` | person.2 |
| Subscriptions | `/(tabs)/subscriptions` | rectangle.stack |
| More | `/(tabs)/more` | ellipsis.circle |

Large titles on every root screen. Nested screens push onto that tab’s stack with the iOS back chevron. The tab bar stays visible on every screen inside `(tabs)` — including pushed details and More children — matching `UITabBarController`. It is hidden only on the login stack.

### Route map

```
src/app/_layout.tsx                 Stack: index, (auth)/login, (tabs)
src/app/(auth)/login.tsx
src/app/(tabs)/_layout.tsx          Tabs: home, members, subscriptions, more
src/app/(tabs)/home.tsx
src/app/(tabs)/members/_layout.tsx  Stack
src/app/(tabs)/members/index.tsx
src/app/(tabs)/members/[id].tsx
src/app/(tabs)/subscriptions/_layout.tsx  Stack
src/app/(tabs)/subscriptions/index.tsx
src/app/(tabs)/subscriptions/[id].tsx
src/app/(tabs)/more/_layout.tsx     Stack
src/app/(tabs)/more/index.tsx
src/app/(tabs)/more/checkin.tsx
src/app/(tabs)/more/billing.tsx
src/app/(tabs)/more/billing/[id].tsx
src/app/(tabs)/more/expenses.tsx
src/app/(tabs)/more/notifications.tsx
src/app/(tabs)/more/settings.tsx
src/app/(tabs)/more/settings-password.tsx
```

Delete the old tab files: `(tabs)/dashboard.tsx`, `(tabs)/checkin.tsx`, `(tabs)/billing.tsx`, `(tabs)/expenses.tsx`, `(tabs)/notifications.tsx`, `(tabs)/settings.tsx`. Rename `screens/dashboard.tsx` → `screens/home.tsx`. Add `screens/subscriptions.tsx`, `screens/more.tsx`, and member/subscription/invoice detail screens.

Cross-tab links (Home Outstanding → Billing) use `router.push("/(tabs)/more/billing")`.

### More hub

Large title **More**. Grouped inset tables, this exact grouping and order:

```
CHECK-IN
  Check In

MONEY
  Billing
  Expenses

ACTIVITY
  Notifications          trailing unread count as a red numeric badge when count > 0

ACCOUNT
  Settings               subtitle = signed-in full name
```

Each row: leading 29pt rounded-square glyph, title, chevron. Tapping pushes the child screen.

## Visual system

Light-only true iOS HIG. No Midnight Graphite. No periwinkle. No Space Grotesk.

### Color

| Token | Value | Use |
| --- | --- | --- |
| canvas | `#F2F2F7` | grouped background |
| surface | `#FFFFFF` | lists, cards, fields |
| separator | `#C6C6C8` | hairlines |
| label | `#000000` | primary text |
| secondary | `#3C3C43` at 60% | subtitles, captions |
| tertiary | `#3C3C43` at 30% | placeholders |
| tint | `#007AFF` | primary actions, active tab, links, search cancel |
| green | `#34C759` | Active / paid / allowed |
| amber | `#FF9500` | Pending / due |
| red | `#FF3B30` | Overdue / destructive / denied |

Tint covers ≤10% of any screen: the primary action, the active tab, links, and focus. Semantic hues are status and destructive only.

### Type (system SF stack)

`-apple-system, SF Pro Text, system-ui`. No Space Grotesk anywhere on mobile.

| Style | Size / weight | Use |
| --- | --- | --- |
| Large title | 34 / 700 | root screen titles |
| Title | 17 / 600 | row titles, nav titles |
| Body | 17 / 400 | form values, descriptions |
| Subhead | 15 / 400 | row subtitles |
| Footnote | 13 / 400 | metrics captions, empty states, errors |
| Caption | 12 / 400 | timestamps, trailing status |

### Shape & space

- Grouped inset radius: 10
- List row: 44pt minimum height
- Screen inset: 16pt
- Group gap: 8pt (section to section), 35pt from large title to first group
- 4pt spacing scale: 4 / 8 / 12 / 16 / 20 / 24
- Circular avatars: 36pt in lists, 60pt on member detail

### Chrome

- Large titles collapse to an inline nav title on scroll
- Tab bar translucent over canvas
- Nav bar: hairline bottom, no custom background color (system default)
- Search is the iOS search field (rounded gray fill `#E3E3E8`, 10pt radius, magnifying-glass leading, no 1px border)
- Segmented control: 32pt track, 8pt radius, selected segment white with a light shadow
- Primary button: 50pt height, 12pt radius, tint fill, white 17/600 label
- Destructive button: red label on white grouped row, not a filled red button except Log Out confirm
- No pill badges. Status is a trailing tinted caption
- No nested cards. One grouped list, or a summary card that is not inside another card

### Motion

250ms push/pop. Pull-to-refresh on every list root. No decorative animation.

## Components (`src/ui/`)

The only shared chrome. Screens do not invent their own colors, radii, or row heights.

| Primitive | Responsibility |
| --- | --- |
| `tokens.ts` | colors, type, space, radius — the single source |
| `Screen` | canvas, safe area, optional large title via stack options |
| `GroupedList` | inset grouped table: 16pt horizontal inset, 10pt radius, white fill |
| `GroupedRow` | 44pt row, optional leading (avatar/glyph), title, subtitle, trailing, chevron; separator inset past the leading element |
| `SearchBar` | iOS search field |
| `Segmented` | iOS segmented control |
| `StatusCaption` | trailing 12/400 tinted status (green/amber/red/secondary) |
| `SummaryCard` | Home metric: large number + footnote caption, 10pt radius, white, 16pt padding |
| `Skeleton` | SummaryCard and GroupedRow placeholders |
| `Empty` | centered secondary footnote (`No Members`) |
| `ErrorRetry` | footnote + tint **Try Again** |

On iOS, each root screen sets `headerLargeTitle: true` on the native stack. On Android and web, native large titles do not exist: `Screen` renders a 34/700 title at the top of the scroll view so those platforms still match the layout. Pushed screens use an inline 17/600 nav title on all platforms.

## Screens

### Login (`(auth)/login`)

White canvas (not grouped gray). Large **Forge** (34/700), subhead **Sign in to your gym**. Two grouped fields (Email, Password) in one inset group. Full-width tint **Sign In**. Loading replaces the label with a white spinner. 401 → iOS alert `Login Failed` / `Invalid email or password.` Other errors → iOS alert with the API message. Authenticated users redirect to `/(tabs)/home`.

### Home — Health-style Summary

Large title **Summary**. Footnote under the title: `{tenant_name} · {weekday D Mon}` (example `Ironworks · Wed 11 Nov`).

Three stacked `SummaryCard`s, full width, 12pt gap:

| Card | Value | Caption | Tap |
| --- | --- | --- | --- |
| Members | `GET /members?page_size=1` → `total` | on file | `/(tabs)/members` |
| Outstanding | `GET /invoices/summary` → `outstanding_minor` via `formatMoney` | unpaid invoices | `/(tabs)/more/billing` |
| Overdue | `overdue_minor` via `formatMoney`; label color red if > 0 else label | past due | `/(tabs)/more/billing` |

No rings. Numbers are 34/700; captions are footnote secondary.

Then a grouped list **RECENTS**: last 10 check-ins from `GET /checkin?page_size=10`. Title is the member full name resolved from `GET /members?page_size=50` joined on `member_id`; unresolved names render `Member`. Subtitle is `{result} · {time}` via `formatTime`. Result caption: `allowed` green, otherwise red. Empty: `No check-ins yet.` No shortcut buttons. Check-In is not on Home.

Pull-to-refresh invalidates members, invoices/summary, and checkins. Loading: three `SummaryCard` skeletons plus six row skeletons. Error: `ErrorRetry` under the title.

### Members

Large title **Members**. Native-style `SearchBar` (`Search members`). `GET /members?page_size=50` plus `search` when the field is non-empty (existing query key `["members", "list", search]`).

One grouped inset table, not a card per row:

- 36pt circular initial avatar (system gray 5 fill, 15/600 label)
- Title: `full_name`
- Subtitle: phone, else email, else `No contact`
- Trailing `StatusCaption`: `active` → green `Active`; any other status → secondary, title-cased
- Separator inset past the avatar

Tap → `/(tabs)/members/[id]`. Pull-to-refresh. Empty: `No Members`. Loading: eight row skeletons.

**Member detail** (read-only). Loads `GET /members/{id}` (not the list cache alone). Inline nav title is the member’s full name. 60pt initial avatar centered above the first group. Groups:

```
CONTACT
  Phone
  Email

STATUS
  Status          StatusCaption
  Branch          name from me.branches match on branch_id, else —

DATES
  Joined          formatDate(joined_at) or —
```

No edit, no check-in from this screen.

### Subscriptions

Port of web `/subscriptions`. Large title **Subscriptions**. Segmented control: **All | Active | Pending | Expired | Cancelled**. `frozen` is not a segment; frozen rows appear only in All with a secondary `Frozen` caption.

Queries:

- `GET /plans/subscriptions?page_size=50` plus `status` when not All (existing web path; not `/subscriptions`)
- `GET /plans` for plan names (`PlanOut`: copy from `apps/web/src/lib/types.ts`)
- `GET /members?page_size=50` for member names

`SubscriptionOut` is added to `apps/mobile/src/lib/types.ts` with the web shape: `id`, `member_id`, `plan_id`, `branch_id`, `status`, `start_at`, `end_at`, `auto_renew`, `price_minor`, `currency`.

Grouped list:

- Title: member name, else `Member`
- Subtitle: `{plan name} · {formatDate(start_at)}–{formatDate(end_at) or "open"}`
- Trailing: `StatusCaption` (Active green, Pending amber, Expired/Cancelled/Frozen secondary)
- Pending rows: if `me.permissions` includes `membership.manage`, a trailing tint 13pt **Activate**. Press → action sheet `Activate subscription?` / Activate / Cancel. Confirm → `POST /plans/subscriptions/{id}/activate`. Success: the row updates (invalidate `["subscriptions"]`). 403 or other error: iOS alert with the API message

Tap a row (not Activate) → `/(tabs)/subscriptions/[id]`. Pull-to-refresh. Empty: `No Subscriptions`. Loading: eight row skeletons.

**Subscription detail.** There is no `GET /plans/subscriptions/{id}`. The screen reads the row from the TanStack Query cache (`["subscriptions", …]`) and 404s to a `ErrorRetry` if missing (user opened a stale URL). Groups:

```
MEMBER
  Name            resolved member name

PLAN
  Plan            resolved plan name
  Price           formatMoney(price_minor)

STATUS
  Status          StatusCaption
  Auto-renew      On / Off

DATES
  Start           formatDate(start_at)
  End             formatDate(end_at) or Open

BRANCH
  Branch          name from me.branches, else —
```

If pending and `membership.manage`, a grouped tint **Activate** row at the bottom that uses the same action sheet.

No create, renew, or upgrade in this pass.

### Check In (`more/checkin`)

Large title **Check In**. Footnote: `Branch: {name}` or `No branch assigned`. `SearchBar` (`Search member`). Member picker is a grouped list from `GET /members?page_size=20` with search (existing query). Selected member: the row shows a tint checkmark trailing; a **Change** is not needed — tapping another row changes selection, tapping the selected row clears it.

Pinned above the home indicator: full-width tint **Check In**, disabled until `memberId` and `branchId` are set. Submit: `POST /checkin` with `{ member_id, branch_id, source: "manual" }` (unchanged). Result `allowed` → iOS alert `Checked In` / `Member checked in.` Any other result → iOS alert `Not Allowed` / `reason` or `Result: {result}`. API error → iOS alert `Check-in failed` / message.

**RECENTS** grouped list under the picker: last 10 from `GET /checkin?page_size=10`, same name/result/time treatment as Home. Pull-to-refresh. `refetchInterval: 15000` stays.

### Billing (`more/billing`)

Large title **Billing**. Segmented: **All | Pending | Overdue | Paid**. `GET /invoices?page_size=50` plus `status` when not All (existing).

Grouped list:

- Title: invoice `number`
- Subtitle: `Due {formatDate(due_date)}`
- Trailing: `formatMoney(total_minor - paid_minor)` when not paid, else `formatMoney(total_minor)`; plus `StatusCaption`

Tap any row → `more/billing/[id]`. Unpaid rows (pending/overdue) also expose a swipe trailing **Pay** (green) that opens the same confirm action sheet as the detail screen, without navigating. Detail groups: Number, Member (id fallback), Status, Issued, Due, Total, Paid, Outstanding, plus a tint **Pay Cash** row. Confirm action sheet: `Record cash payment?` / Pay / Cancel. Confirm → existing `POST /invoices/{id}/pay` with `{ method: "cash", idempotency_key: "mob-{timestamp}-{rand}" }`. Success: iOS alert `Payment captured` / `Invoice marked as paid.` Error: iOS alert with the API message.

Pull-to-refresh. Empty: `No Invoices`. Loading: eight row skeletons.

### Expenses (`more/expenses`)

Large title **Expenses**. Trailing nav label is the current calendar year (non-interactive, no year picker). Data: existing `GET /expenses?page_size=50`.

List: grouped by month from `ExpenseYearOut.expenses`. Section header is the month name. Rows: title = category (title-cased), subtitle = description or `formatDate(paid_at)`, trailing = `formatMoney(amount_minor)`.

Trailing nav **Add** (tint) opens a modal sheet **Add Expense**: grouped fields Category (segmented or picker rows over the existing `CATEGORIES`), Amount (decimal pad), Method (existing `METHODS`), Description (optional). **Save** in the sheet nav bar, disabled until `parseFloat(amount) > 0`. Submit is the existing `POST /expenses` body. Success: dismiss sheet, invalidate `["expenses"]`. Error: iOS alert on the sheet.

Pull-to-refresh. Empty: `No Expenses`. Loading: eight row skeletons.

### Notifications (`more/notifications`)

Large title **Notifications**. Trailing **Mark All Read** (tint, footnote) when unread count > 0, calling existing `POST /notifications/mark-all`.

Grouped list from `GET /notifications?page_size=50`. Title = `title`, subtitle = body (1 line) or `formatTime(created_at)`. Unread: 8pt tint leading dot; separator inset past the dot. Tap unread → `POST /notifications/{id}/read`. `refetchInterval: 30000` stays. Unread count on the More row uses `GET /notifications/unread-count`.

Empty: `No Notifications`. Loading: eight row skeletons.

### Settings (`more/settings`)

Large title **Settings**.

```
ACCOUNT
  Name            me.user.full_name
  Email           me.user.email
  Gym             me.tenant_name
  Role            me.role_name
  Branch          me.branches[0].name or —

SECURITY
  Change Password     chevron → settings-password

LOG OUT
  Log Out             red label, centered. Action sheet
                      "Sign out of Forge on this device?"
                      Log Out (destructive) / Cancel
```

**Change Password** pushed screen. Large title **Password**. Grouped secure fields Current Password, New Password. Nav trailing **Update**, disabled until current is non-empty and new length ≥ 8. Existing `POST /auth/change-password` then `completePasswordChange(tokens)`. Success: iOS alert `Password changed` / `Your password was updated.` then pop. Error: iOS alert with the API message.

## Data

Existing queries and mutations stay. New:

| Call | Used by |
| --- | --- |
| `GET /plans/subscriptions?page_size=50&status=` | Subscriptions list |
| `POST /plans/subscriptions/{id}/activate` | Activate |
| `GET /plans` | Plan name map |

Home Recents and Check-In Recents join `CheckInOut.member_id` to `MemberOut` from `GET /members?page_size=50`. Unresolved → `Member`. This pass does not fetch per-check-in member records.

No offline queue in this pass. 401 still uses the existing auth refresh/logout path in `lib/api.ts`.

Permissions: screens stay visible (same as today’s 7-tab app). Activate is the one control gated on `membership.manage`. Failed loads (403/5xx/network) render `ErrorRetry`, not a modal.

## Errors & empty states

- Replace every `Alert.alert` with the iOS `Alert` API (already RN) using title/message/button styles matching the copy in each screen above. Confirmations that have a destructive or commit choice use an action sheet (`Alert` with Cancel + confirm, or `ActionSheetIOS` on iOS and `Alert` on Android so Android still functions).
- Failed list loads: `ErrorRetry` on that screen. Never a blocking modal for fetch failure.
- Empty states: centered secondary footnote, exact strings: `No Members`, `No Subscriptions`, `No Invoices`, `No Expenses`, `No Notifications`, `No check-ins yet.`, `No members match.`
- No illustrated empties.

## Testing

Must not break `src/__tests__/auth.test.tsx` or `src/__tests__/api.test.ts`.

Add:

- Tab layout test: the tab bar exposes **Home**, **Members**, **Subscriptions**, **More** and does not expose Dashboard, Check-In, Billing, Expenses, Notifications, or Settings as tabs.
- Subscriptions query test: list calls `/plans/subscriptions` and activate calls `/plans/subscriptions/{id}/activate`.

Screen tests stay query-level. No screenshot tests.

Gates: `npx tsc --noEmit` and `npm test` in `apps/mobile` (see `apps/mobile/AGENTS.md`). No `make test-web` / Playwright requirement for this mobile-only change.

## File touch list

- `apps/mobile/src/ui/tokens.ts` (new) and the primitives listed above
- `apps/mobile/src/lib/types.ts` — add `SubscriptionOut`, `PlanOut`
- `apps/mobile/src/app/(tabs)/_layout.tsx` — four tabs
- New route files per the route map; delete the six old tab files
- `apps/mobile/src/screens/*` — restyle every screen; add home, more, subscriptions, details
- `apps/mobile/src/app/(auth)/login.tsx` — restyle; authenticated redirect → `/(tabs)/home`
- `apps/mobile/src/app/index.tsx` — authenticated redirect → `/(tabs)/home` (was `/(tabs)/dashboard`)
- `apps/mobile/src/app/_layout.tsx` — light status bar stays (`style="dark"` content)
- Tests under `apps/mobile/src/__tests__/`

## Acceptance

1. Tab bar is Home, Members, Subscriptions, More — four items, tint active.
2. Every root screen uses a large title, grouped canvas `#F2F2F7`, and grouped inset white lists.
3. Home is Summary + three stacked metric cards + Recents. No Check-In shortcut.
4. Check-In, Billing, Expenses, Notifications, Settings are reachable only from More (or from Home metric taps into Billing).
5. Subscriptions lists `GET /plans/subscriptions` with the five-segment filter and Activate on pending when permitted.
6. No periwinkle, no Midnight Graphite, no Space Grotesk, no pill badges, no per-row cards on lists.
7. Existing auth and API tests pass; new tab-layout and subscriptions query tests pass; `tsc --noEmit` is clean.
