# Mobile iOS HIG Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `apps/mobile` into a light, minimal iOS HIG app: custom tokens/primitives, 3+More tab bar (Home / Members / Subscriptions / More), Health-style Summary, ported Subscriptions, and a full layout pass on every screen. Same Expo 58 app, same FastAPI `/api/v1` client, same TanStack Query. No backend changes. No new UI library.

**Spec:** `docs/superpowers/specs/2026-11-11-mobile-ios-redesign-design.md`

**Architecture:** Visual-only + nav restructure. Chrome lives in `apps/mobile/src/ui/`. Screens keep existing queries/mutations. New calls: `GET /plans/subscriptions`, `POST /plans/subscriptions/{id}/activate`, `GET /plans`, `GET /members/{id}`.

**Tech stack:** Expo 58, React Native 0.88, Expo Router, TanStack Query, `@expo/vector-icons`. No NativeWind usage in this pass even though `tailwindcss` is in `package.json`.

**Ground rules:**

- Work on a feature branch `feat/mobile-ios-redesign` targeting `dev`. Do not push to `dev`/`stag`/`prod`.
- One task = one commit. Stage only that task’s files. Never `git add -A`.
- No comments in code unless the user asked.
- Do not add npm packages except `react-native-gesture-handler` if `Swipeable` cannot be imported from the Expo Router transitive tree. If adding: `npx expo install react-native-gesture-handler` from `apps/mobile`.
- Do not edit `ios/` or `android/`. Do not change web or backend.
- After every task, from `apps/mobile`: `npx tsc --noEmit` and `npm test`. Both must pass. Do not pin or update expected counts.
- Existing tests that must stay green: `src/__tests__/auth.test.tsx`, `src/__tests__/api.test.ts`.
- Auth 401 refresh/logout path in `lib/api.ts` is frozen.
- Empty-state copy is exact: `No Members`, `No Subscriptions`, `No Invoices`, `No Expenses`, `No Notifications`, `No check-ins yet.`, `No members match.`
- No periwinkle, Midnight Graphite, Space Grotesk, pill badges, or per-row cards on lists.

**Task map:**

| Spec | Task |
| --- | --- |
| Tokens, primitives, types | 1 |
| 4-tab shell + route map + redirects | 2 |
| Login | 3 |
| Home / Summary | 4 |
| Members list + detail | 5 |
| Subscriptions list + detail | 6 |
| More hub | 7 |
| Check In | 8 |
| Billing list + detail | 9 |
| Expenses list + add sheet | 10 |
| Notifications + Settings + password | 11 |
| Tab-layout + subscriptions tests, leftover cleanup | 12 |

---

## Task 1 — Tokens, primitives, types

**Files:**

- Create: `apps/mobile/src/ui/tokens.ts`
- Create: `apps/mobile/src/ui/Screen.tsx`
- Create: `apps/mobile/src/ui/GroupedList.tsx`
- Create: `apps/mobile/src/ui/GroupedRow.tsx`
- Create: `apps/mobile/src/ui/SearchBar.tsx`
- Create: `apps/mobile/src/ui/Segmented.tsx`
- Create: `apps/mobile/src/ui/StatusCaption.tsx`
- Create: `apps/mobile/src/ui/SummaryCard.tsx`
- Create: `apps/mobile/src/ui/Skeleton.tsx`
- Create: `apps/mobile/src/ui/Empty.tsx`
- Create: `apps/mobile/src/ui/ErrorRetry.tsx`
- Create: `apps/mobile/src/ui/index.ts`
- Create: `apps/mobile/src/ui/confirm.ts`
- Modify: `apps/mobile/src/lib/types.ts`
- Modify: `apps/mobile/src/lib/money.ts`

**Steps:**

- [ ] **1.1** Add to `types.ts` (copy field-for-field from `apps/web/src/lib/types.ts` L50–63 and L150–161):

```ts
export interface PlanOut {
  id: string;
  name: string;
  slug: string;
  branch_id: string | null;
  description: string | null;
  billing_period: string;
  amount_minor: number;
  entry_fee_minor: number;
  tax_rate_bp: number;
  duration_months: number | null;
  auto_renew: boolean;
  is_active: boolean;
}

export interface SubscriptionOut {
  id: string;
  member_id: string;
  plan_id: string;
  branch_id: string;
  status: string;
  start_at: string;
  end_at: string | null;
  auto_renew: boolean;
  price_minor: number;
  currency: string;
}
```

- [ ] **1.2** Add `formatDay(d = new Date())` to `money.ts`: `Wed 11 Nov` via `toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })`.

- [ ] **1.3** `tokens.ts` — exact values from the spec:

```ts
export const colors = {
  canvas: "#F2F2F7",
  surface: "#FFFFFF",
  separator: "#C6C6C8",
  label: "#000000",
  secondary: "rgba(60,60,67,0.6)",
  tertiary: "rgba(60,60,67,0.3)",
  tint: "#007AFF",
  green: "#34C759",
  amber: "#FF9500",
  red: "#FF3B30",
  searchFill: "#E3E3E8",
  gray5: "#E5E5EA",
};

export const type = {
  largeTitle: { fontSize: 34, fontWeight: "700" as const, color: colors.label },
  title: { fontSize: 17, fontWeight: "600" as const, color: colors.label },
  body: { fontSize: 17, fontWeight: "400" as const, color: colors.label },
  subhead: { fontSize: 15, fontWeight: "400" as const, color: colors.secondary },
  footnote: { fontSize: 13, fontWeight: "400" as const, color: colors.secondary },
  caption: { fontSize: 12, fontWeight: "400" as const, color: colors.secondary },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };
export const radius = { sm: 8, md: 10, lg: 12, full: 999 };
export const rowMinHeight = 44;
```

- [ ] **1.4** Primitives (screens must import these; no raw hex in later tasks):

  - `Screen`: `flex:1`, `backgroundColor: colors.canvas`. Props: `title?: string` (Android/web only — `Platform.OS !== "ios"` renders 34/700 title inside the scroll header; iOS uses native `headerLargeTitle`), `children`, optional `onRefresh`/`refreshing` wrapping a `ScrollView` with `RefreshControl` tint `#007AFF`. Also export a non-scrolling variant (`scroll=false`) for FlatList screens.
  - `GroupedList`: 16pt horizontal margin, 10pt radius, white fill, overflow hidden. Optional uppercase 13/400 secondary section `header` 35pt above first group / 8pt between groups, 16pt side inset. Children are `GroupedRow`s.
  - `GroupedRow`: minHeight 44, horizontal 16, vertical 10. Props: `title`, `subtitle?`, `leading?`, `trailing?`, `onPress?`, `chevron?: boolean`, `destructive?: boolean` (red centered 17/600 title), `last?: boolean` (hide separator). Separator is 1px `#C6C6C8` inset 16pt, or 60pt when `leading` is set (avatar inset).
  - `SearchBar`: height 36, fill `#E3E3E8`, radius 10, Ionicons `search` 16pt tertiary leading, placeholder tertiary, body 17 label. No border.
  - `Segmented`: 32pt track, radius 8, fill `#E5E5EA`, selected segment white + `{ shadowColor:"#000", shadowOpacity:0.12, shadowRadius:4, shadowOffset:{width:0,height:1}, elevation:2 }`. Equal-width segments. Props: `values: string[]`, `value: string`, `onChange(v: string)`.
  - `StatusCaption`: 12/400. Map: `active|paid|allowed` → green; `pending` → amber; `overdue|denied|cancelled|expired` → red for overdue/denied else secondary; default secondary. Title-case the label.
  - `SummaryCard`: white, radius 10, padding 16. `value` 34/700 (optional `valueColor`), `caption` footnote, `onPress`.
  - `Skeleton`: gray5 pulse via opacity 0.4. `SummaryCardSkeleton` (height 88) and `RowSkeleton` (height 44).
  - `Empty`: centered footnote, padding 32. Prop `label: string`.
  - `ErrorRetry`: footnote `Could not load.` + tint `Try Again` `onPress`.
  - `confirm.ts`: `confirmAction({ title, message?, confirm, destructive?: boolean }): Promise<boolean>`. iOS: `ActionSheetIOS.showActionSheetWithOptions` (Cancel + confirm). Android: `Alert.alert` with Cancel + confirm. Resolve true only on confirm.
  - `index.ts` re-exports all of the above plus tokens.

- [ ] **1.5** Gate: `npx tsc --noEmit` and `npm test` in `apps/mobile`.

- [ ] **1.6** Commit: `feat: add iOS HIG tokens and primitives`

---

## Task 2 — Four-tab shell and route map

**Files:**

- Modify: `apps/mobile/src/app/(tabs)/_layout.tsx`
- Modify: `apps/mobile/src/app/index.tsx`
- Modify: `apps/mobile/src/app/(auth)/login.tsx` (redirect only this task)
- Create: `apps/mobile/src/app/(tabs)/home.tsx`
- Create: `apps/mobile/src/app/(tabs)/members/_layout.tsx`
- Create: `apps/mobile/src/app/(tabs)/members/index.tsx`
- Create: `apps/mobile/src/app/(tabs)/members/[id].tsx`
- Create: `apps/mobile/src/app/(tabs)/subscriptions/_layout.tsx`
- Create: `apps/mobile/src/app/(tabs)/subscriptions/index.tsx`
- Create: `apps/mobile/src/app/(tabs)/subscriptions/[id].tsx`
- Create: `apps/mobile/src/app/(tabs)/more/_layout.tsx`
- Create: `apps/mobile/src/app/(tabs)/more/index.tsx`
- Create: `apps/mobile/src/app/(tabs)/more/checkin.tsx`
- Create: `apps/mobile/src/app/(tabs)/more/billing.tsx`
- Create: `apps/mobile/src/app/(tabs)/more/billing/[id].tsx`
- Create: `apps/mobile/src/app/(tabs)/more/expenses.tsx`
- Create: `apps/mobile/src/app/(tabs)/more/notifications.tsx`
- Create: `apps/mobile/src/app/(tabs)/more/settings.tsx`
- Create: `apps/mobile/src/app/(tabs)/more/settings-password.tsx`
- Delete: `apps/mobile/src/app/(tabs)/dashboard.tsx`
- Delete: `apps/mobile/src/app/(tabs)/checkin.tsx`
- Delete: `apps/mobile/src/app/(tabs)/billing.tsx`
- Delete: `apps/mobile/src/app/(tabs)/expenses.tsx`
- Delete: `apps/mobile/src/app/(tabs)/notifications.tsx`
- Delete: `apps/mobile/src/app/(tabs)/settings.tsx`
- Delete: `apps/mobile/src/app/(tabs)/members.tsx` (replaced by `members/` directory)

**Steps:**

- [ ] **2.1** Tab layout — four screens only. `headerShown: false` at Tabs level (each nested stack owns headers). Active tint `#007AFF`, inactive `rgba(60,60,67,0.6)`, `tabBarStyle: { backgroundColor: "rgba(249,249,249,0.94)" }`. Icons via `Ionicons` from `@expo/vector-icons`: Home `home-outline` / `home` (focused), Members `people-outline` / `people`, Subscriptions `albums-outline` / `albums`, More `ellipsis-horizontal-circle-outline` / `ellipsis-horizontal-circle`. Titles: `Home`, `Members`, `Subscriptions`, `More`. Keep the existing `loading`/`!me` redirect to `/(auth)/login`.

- [ ] **2.2** Each nested `_layout.tsx` is an Expo Router `Stack` with `headerLargeTitle: true` on the index route, `headerTintColor: colors.tint`, `headerBackTitle: "Back"`, `contentStyle: { backgroundColor: colors.canvas }`. Pushed screens (`[id]`, `checkin`, `billing`, etc.) set `headerLargeTitle: false`.

- [ ] **2.3** Temporary route bodies so the tree typechecks: `home.tsx` renders existing `DashboardScreen`; `members/index.tsx` → `MembersScreen`; `more/checkin.tsx` → `CheckInScreen`; `more/billing.tsx` → `BillingScreen`; `more/expenses.tsx` → `ExpensesScreen`; `more/notifications.tsx` → `NotificationsScreen`; `more/settings.tsx` → `SettingsScreen`; `more/index.tsx` a `View` with `Text` `More` (replaced in Task 7); `subscriptions/index.tsx` a `View` with `Text` `Subscriptions` (Task 6); `[id].tsx` / `billing/[id].tsx` / `settings-password.tsx` a `View` with `Text` `…` (replaced in later tasks).

- [ ] **2.4** Change authenticated redirects in `index.tsx` and `login.tsx` from `/(tabs)/dashboard` to `/(tabs)/home`.

- [ ] **2.5** Gate: `npx tsc --noEmit` and `npm test`.

- [ ] **2.6** Commit: `feat: restructure mobile tabs to 3+More`

---

## Task 3 — Login

**Files:**

- Modify: `apps/mobile/src/app/(auth)/login.tsx`

**Steps:**

- [ ] **3.1** White canvas (`colors.surface`), centered column, 24pt padding. 34/700 `Forge`, footnote `Sign in to your gym`. One `GroupedList` of two fields (Email, Password) — use `TextInput` inside the group, 17 body, no 1px border, separator between them. Full-width tint button 50pt / radius 12 / white 17/600 `Sign In`. Loading: white `ActivityIndicator` in the button, `opacity` 0.6, disabled.

- [ ] **3.2** Keep existing `login()` / 401 / other-error `Alert.alert` copy (`Login Failed` / `Invalid email or password. Please try again.`). Redirect stays `/(tabs)/home`.

- [ ] **3.3** Gate + commit: `feat: restyle mobile login to iOS HIG`

---

## Task 4 — Home / Summary

**Files:**

- Create: `apps/mobile/src/screens/home.tsx`
- Modify: `apps/mobile/src/app/(tabs)/home.tsx`
- Delete: `apps/mobile/src/screens/dashboard.tsx` after `home.tsx` is wired

**Steps:**

- [ ] **4.1** Queries (enabled `!!me`):

  - `["members", "count"]` → `GET /members?page_size=1`
  - `["invoices", "summary"]` → `GET /invoices/summary`
  - `["checkins", "recent"]` → `GET /checkin?page_size=10`
  - `["members", "list", ""]` → `GET /members?page_size=50` (name join)

- [ ] **4.2** `Screen` title `Summary` (Android/web). Native stack index title `Summary` with `headerLargeTitle`. Footnote `{me.tenant_name} · {formatDay()}` under the title.

- [ ] **4.3** Three stacked `SummaryCard`s, 12pt gap, 16pt horizontal inset:

  | Caption | Value | Tap |
  | --- | --- | --- |
  | on file | members total or `—` | `/(tabs)/members` |
  | unpaid invoices | `formatMoney(outstanding_minor)` | `/(tabs)/more/billing` |
  | past due | `formatMoney(overdue_minor)`; `valueColor: colors.red` if `overdue_minor > 0` | `/(tabs)/more/billing` |

- [ ] **4.4** `GroupedList` header `RECENTS`. Rows: title = member `full_name` from the page-50 map else `Member`; subtitle = `{result} · {formatTime(recorded_at)}`; trailing `StatusCaption` on `result`. Empty: `No check-ins yet.` No Check-In shortcut.

- [ ] **4.5** Pull-to-refresh invalidates `["members"]`, `["invoices"]`, `["checkins"]`. Loading: three `SummaryCardSkeleton` + six `RowSkeleton`. Any of the three primary queries `isError` → `ErrorRetry` that refetches all.

- [ ] **4.6** Point `home.tsx` route at `HomeScreen`. Delete `screens/dashboard.tsx`.

- [ ] **4.7** Gate + commit: `feat: restyle mobile home as Summary`

---

## Task 5 — Members list + detail

**Files:**

- Modify: `apps/mobile/src/screens/members.tsx`
- Create: `apps/mobile/src/screens/member-detail.tsx`
- Modify: `apps/mobile/src/app/(tabs)/members/index.tsx`
- Modify: `apps/mobile/src/app/(tabs)/members/[id].tsx`
- Modify: `apps/mobile/src/app/(tabs)/members/_layout.tsx` (index title `Members`, `[id]` title from params or `Member`)

**Steps:**

- [ ] **5.1** List: `Screen` `scroll=false` title `Members`. `SearchBar` placeholder `Search members` above the list. Keep query `["members", "list", search]` → `/members?page_size=50` + `search`. One `GroupedList` (or a FlatList whose `contentContainerStyle` mimics it: 16pt inset, 10pt radius, white). Row: 36pt gray5 circular initial, `full_name`, subtitle phone else email else `No contact`, trailing `StatusCaption`. `onPress` → `router.push(\`/(tabs)/members/\${item.id}\`)`. Pull-to-refresh. Empty: `No Members`. Loading: eight `RowSkeleton`.

- [ ] **5.2** Detail: `GET /members/${id}` via `useLocalSearchParams`. 60pt initial avatar centered. Groups CONTACT (Phone, Email), STATUS (Status + `StatusCaption`, Branch from `me.branches` match else `—`), DATES (Joined `formatDate(joined_at)` or `—`). Missing/error: `ErrorRetry`. No edit. No check-in.

- [ ] **5.3** Gate + commit: `feat: restyle mobile members list and detail`

---

## Task 6 — Subscriptions list + detail

**Files:**

- Create: `apps/mobile/src/screens/subscriptions.tsx`
- Create: `apps/mobile/src/screens/subscription-detail.tsx`
- Modify: `apps/mobile/src/app/(tabs)/subscriptions/index.tsx`
- Modify: `apps/mobile/src/app/(tabs)/subscriptions/[id].tsx`

**Steps:**

- [ ] **6.1** Segmented values `["All","Active","Pending","Expired","Cancelled"]`. Query `["subscriptions", "list", filter]` → `GET /plans/subscriptions?page_size=50` plus `&status=` when not All (`filter.toLowerCase()`). Also `["plans"]` → `GET /plans` and `["members", "list", ""]` for names.

- [ ] **6.2** Rows: title member name else `Member`; subtitle `{plan name else "Plan"} · {formatDate(start_at)}–{formatDate(end_at) or "open"}`; trailing `StatusCaption`. Pending + `me.permissions.includes("membership.manage")`: extra trailing tint 13pt `Activate`. `Activate` `onPress` stops row nav, `confirmAction({ title: "Activate subscription?", confirm: "Activate" })`, then `POST /plans/subscriptions/${id}/activate`. Success: invalidate `["subscriptions"]`. Error: `Alert.alert` with API message.

- [ ] **6.3** Row tap → `/(tabs)/subscriptions/${id}`. Empty: `No Subscriptions`. Loading: eight `RowSkeleton`. Pull-to-refresh.

- [ ] **6.4** Detail: read the row from query cache (`qc.getQueryData` over `["subscriptions", "list", …]` keys, or `useQuery` the list and `items.find`). If missing: `ErrorRetry`. Groups per spec (Member, Plan+Price, Status+Auto-renew On/Off, Start/End or `Open`, Branch). Pending + manage: grouped tint `Activate` row, same confirm/POST.

- [ ] **6.5** Gate + commit: `feat: add iOS subscriptions tab`

---

## Task 7 — More hub

**Files:**

- Create: `apps/mobile/src/screens/more.tsx`
- Modify: `apps/mobile/src/app/(tabs)/more/index.tsx`

**Steps:**

- [ ] **7.1** Query `["notifications", "unread"]` → `GET /notifications/unread-count` (`refetchInterval: 30000`).

- [ ] **7.2** Four `GroupedList`s, exact order:

  | Section | Title | Route | Leading (Ionicons, 29pt rounded-square) |
  | --- | --- | --- | --- |
  | CHECK-IN | Check In | `/(tabs)/more/checkin` | `calendar` on tint |
  | MONEY | Billing | `/(tabs)/more/billing` | `card` on green |
  | MONEY | Expenses | `/(tabs)/more/expenses` | `remove-circle` on red |
  | ACTIVITY | Notifications | `/(tabs)/more/notifications` | `notifications` on amber; trailing red numeric badge if unread > 0 |
  | ACCOUNT | Settings | `/(tabs)/more/settings` | `settings` on secondary; subtitle `me.user.full_name` |

  Every row `chevron`. 29pt leading: 29×29 radius 6, icon 18 white (or white-on-secondary).

- [ ] **7.3** Gate + commit: `feat: add iOS More hub`

---

## Task 8 — Check In

**Files:**

- Modify: `apps/mobile/src/screens/checkin.tsx`
- Modify: `apps/mobile/src/app/(tabs)/more/checkin.tsx` (title `Check In`)

**Steps:**

- [ ] **8.1** Keep queries/mutation (`members` picker page_size 20 + search, recent page_size 10, `POST /checkin` `{ member_id, branch_id, source: "manual" }`, `refetchInterval: 15000`).

- [ ] **8.2** Footnote `Branch: {name}` or `No branch assigned`. `SearchBar` `Search member`. Grouped picker: tap selects (tint checkmark trailing); tap selected clears. Empty picker: `No members match.`

- [ ] **8.3** Pinned bottom tint 50pt `Check In`, disabled until `memberId && branchId && !pending`. Alerts stay: `Checked In` / `Member checked in.`; `Not Allowed` / reason; `Check-in failed` / message.

- [ ] **8.4** `RECENTS` grouped list, same name/result/time as Home. Pull-to-refresh.

- [ ] **8.5** Gate + commit: `feat: restyle mobile check-in`

---

## Task 9 — Billing list + detail

**Files:**

- Modify: `apps/mobile/src/screens/billing.tsx`
- Create: `apps/mobile/src/screens/invoice-detail.tsx`
- Modify: `apps/mobile/src/app/(tabs)/more/billing.tsx`
- Modify: `apps/mobile/src/app/(tabs)/more/billing/[id].tsx`

**Steps:**

- [ ] **9.1** Segmented `All | Pending | Overdue | Paid`. Keep `["invoices", "list", filter]` and pay mutation (`POST /invoices/${id}/pay` `{ method: "cash", idempotency_key: \`mob-${Date.now()}-${rand}\` }`).

- [ ] **9.2** Grouped rows: title `number`; subtitle `Due {formatDate(due_date)}`; trailing money (outstanding if not paid else total) + `StatusCaption`. Tap → `/(tabs)/more/billing/${id}`. Empty: `No Invoices`. Loading: eight `RowSkeleton`. Pull-to-refresh.

- [ ] **9.3** Swipe trailing **Pay** (green) on pending/overdue: `Swipeable` from `react-native-gesture-handler` (install only if the import fails). Swipe confirm uses `confirmAction({ title: "Record cash payment?", confirm: "Pay" })` then the existing mutation. Do not navigate.

- [ ] **9.4** Detail groups: Number, Member (`member_id` fallback), Status, Issued, Due, Total, Paid, Outstanding. Unpaid: tint `Pay Cash` row → same confirm + mutation. Success/error alerts unchanged (`Payment captured` / `Invoice marked as paid.`). Invoice is taken from the list cache; missing → `ErrorRetry`.

- [ ] **9.5** Gate + commit: `feat: restyle mobile billing`

---

## Task 10 — Expenses list + add sheet

**Files:**

- Modify: `apps/mobile/src/screens/expenses.tsx`
- Create: `apps/mobile/src/screens/expense-add.tsx`
- Modify: `apps/mobile/src/app/(tabs)/more/_layout.tsx` to register a modal `expense-add` (`presentation: "modal"`)
- Create: `apps/mobile/src/app/(tabs)/more/expense-add.tsx`

**Steps:**

- [ ] **10.1** List: keep `GET /expenses?page_size=50`. Native header title `Expenses`, trailing non-interactive year (`new Date().getFullYear()`) and tint `Add` → `router.push("/(tabs)/more/expense-add")`. Group expenses by `paid_at` month; section header is `toLocaleDateString("en-GB", { month: "long", year: "numeric" })`. Rows: title-cased category, subtitle description or `formatDate(paid_at)`, trailing `formatMoney`. Empty: `No Expenses`. Pull-to-refresh.

- [ ] **10.2** Modal `Add Expense`: grouped Category (one `GroupedRow` per existing `CATEGORIES` with checkmark), Amount (decimal-pad), Method (`METHODS` rows), Description optional. Nav `Save` disabled until `parseFloat(amount) > 0`. Body stays `{ category, description: description || null, amount_minor: Math.round(parseFloat(amount) * 100), method, branch_id: me?.branches?.[0]?.id ?? null, paid_at: new Date().toISOString() }`. Success: invalidate `["expenses"]`, `router.back()`. Error: `Alert.alert` on the sheet.

- [ ] **10.3** Gate + commit: `feat: restyle mobile expenses`

---

## Task 11 — Notifications + Settings

**Files:**

- Modify: `apps/mobile/src/screens/notifications.tsx`
- Modify: `apps/mobile/src/screens/settings.tsx`
- Create: `apps/mobile/src/screens/settings-password.tsx`
- Modify: `apps/mobile/src/app/(tabs)/more/notifications.tsx`
- Modify: `apps/mobile/src/app/(tabs)/more/settings.tsx`
- Modify: `apps/mobile/src/app/(tabs)/more/settings-password.tsx`

**Steps:**

- [ ] **11.1** Notifications: keep list/unread/markRead/markAll queries (`refetchInterval: 30000`). Trailing nav `Mark All Read` (tint footnote) when unread > 0. Grouped rows: title, subtitle body (1 line) else `formatTime(created_at)`; unread 8pt tint leading dot, separator inset past the dot. Tap unread → `POST /notifications/${id}/read`. Empty: `No Notifications`.

- [ ] **11.2** Settings groups ACCOUNT (Name, Email, Gym, Role, Branch — `—` fallbacks), SECURITY (`Change Password` chevron → `/(tabs)/more/settings-password`), LOG OUT (destructive centered `Log Out`). Logout: `confirmAction({ title: "Sign out of Forge on this device?", confirm: "Log Out", destructive: true })` then `logout()`.

- [ ] **11.3** Password: grouped secure Current / New. Nav trailing `Update` disabled until current nonempty and new length ≥ 8. Existing `POST /auth/change-password` + `completePasswordChange(tokens)`. Success: `Alert.alert("Password changed", "Your password was updated.")` then `router.back()`. Error: existing alert copy.

- [ ] **11.4** Gate + commit: `feat: restyle mobile notifications and settings`

---

## Task 12 — Tests and leftover cleanup

**Files:**

- Create: `apps/mobile/src/__tests__/tabs.test.tsx`
- Create: `apps/mobile/src/__tests__/subscriptions.test.ts`
- Modify: `apps/mobile/jest.setup.ts` if Expo Router needs a mock
- Grep: leftover `#111827`, `#f9fafb`, `#e5e7eb`, `#059669`, `dashboard`, pill `badge` styles under `apps/mobile/src`

**Steps:**

- [ ] **12.1** `tabs.test.tsx`: render `TabLayout` with `AuthProvider` mocked so `me` is a non-null gym user (`loading: false`). Assert `getByText("Home")`, `Members`, `Subscriptions`, `More`. Assert `queryByText("Dashboard")`, `Check-In`, `Billing`, `Expenses`, `Notifications`, `Settings` are null **as tab titles**. (More hub is a different screen — this test only mounts `_layout.tsx`.) If Expo Router is heavy to mount, export the tab config array from `_layout.tsx` (`TAB_ITEMS = ["Home","Members","Subscriptions","More"]`) and assert that instead; still fail if the old seven names appear in that array.

- [ ] **12.2** `subscriptions.test.ts`: mock `apiFetch`. A small helper `fetchSubscriptions(status?: string)` / `activateSubscription(id: string)` colocated in `src/lib/subscriptions.ts` (extract from the screen if the screen inlines the URLs — prefer extracting so the test does not render the screen):

  - `fetchSubscriptions()` calls `/plans/subscriptions?page_size=50`
  - `fetchSubscriptions("pending")` calls `/plans/subscriptions?page_size=50&status=pending`
  - `activateSubscription("abc")` POSTs `/plans/subscriptions/abc/activate`

  Then point the screen at those helpers.

- [ ] **12.3** Grep `apps/mobile/src` for `#111827`, `#f9fafb`, `#e5e7eb`, `#4f46e5`, `#059669`, `dashboard`, `badgeActive`. Replace or delete leftovers. `screens/dashboard.tsx` must not exist. No Space Grotesk string.

- [ ] **12.4** Gate: `npx tsc --noEmit` and `npm test` in `apps/mobile`. Auth and API tests still pass. New tests pass.

- [ ] **12.5** Commit: `test: cover iOS tab bar and subscriptions API`

---

## Acceptance (from spec)

1. Tab bar is Home, Members, Subscriptions, More — four items, tint active.
2. Every root screen uses a large title, grouped canvas `#F2F2F7`, and grouped inset white lists.
3. Home is Summary + three stacked metric cards + Recents. No Check-In shortcut.
4. Check-In, Billing, Expenses, Notifications, Settings are reachable only from More (or from Home metric taps into Billing).
5. Subscriptions lists `GET /plans/subscriptions` with the five-segment filter and Activate on pending when permitted.
6. No periwinkle, no Midnight Graphite, no Space Grotesk, no pill badges, no per-row cards on lists.
7. Existing auth and API tests pass; new tab-layout and subscriptions query tests pass; `tsc --noEmit` is clean.
