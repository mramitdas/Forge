# Mobile ERP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React Native + Expo mobile app that runs the full owner/front-desk ERP on iOS and Android, reusing the existing FastAPI backend, sharing TypeScript types and API client, and staying in sync with the web app.

**Architecture:** The mobile app (`apps/mobile`) is a self-contained Expo project. It reuses the backend's `/api/v1` surface unchanged — every router from the web surface (`identity`, `members`, `membership`, `billing`, `attendance`, `expenses`, `tenancy`, `notifications`) stays as-is. The mobile client shares the same `api.ts` pattern but replaces `localStorage` with `expo-secure-store`/`react-native-keychain`, removes browser-only guards (`window` checks become no-ops), and ports the existing tests to the mobile runtime.

**Tech Stack:** React Native 0.73+, Expo 51, React Navigation 6, TanStack Query, Tailwind React Native CLI, expo-secure-store, react-native-keychain, expo-local-store

**Spec:** `docs/superpowers/specs/2026-11-11-mobile-erp-design.md`

## Global Constraints

- Reuse existing FastAPI `/api/v1` surface unchanged
- Mobile reuses backend schemas (`TokenResponse`, `MeOut`, `LoginRequest`, `RefreshRequest`) from `backend/app/modules/identity/schemas.py`
- Auth flow mirrors web exactly: login → refresh → 401 retry, tokens never in plain localStorage
- Tenant scoping: every API call carries tenant context; no cross-tenant data leaks
- Offline-first: write-local-then-sync for check-ins and expenses
- Must pass `make lint`, `make test-backend`, `npm run build --workspace=apps/web`, and domain e2e scripts
- Branch: `feat/110-mobile-erp` targeting `dev`

## Review Focus

- Offline write → sync path works without data loss under network flakiness
- Auth flow: login → refresh → 401 retry mirrors web exactly; tokens never land in plain localStorage
- Tenant scoping: every API call carries tenant context; no cross-tenant data leaks
- Initial load: skeleton screen + TanQuery cache keeps first render < 1s on typical gym WiFi
- Notifications: push token registration mirrors the existing web service

---
### Task 1: Scaffold `apps/mobile` Expo project

**Files:**
- Create: `apps/mobile/`
- Create: `apps/mobile/app.json`
- Create: `apps/mobile/app.config.js`
- Create: `apps/mobile/package.json`
- Modify: none yet

**Interfaces:**
- Consumes: none
- Produces: bare React Native + Expo project with TypeScript configured

**Step 1:** `npx expo init apps/mobile --template blank-typescript`

**Step 2:** Add dependencies: `expo`, `expo-constants`, `react-native-screens`, `react-native-safe-area-context`, `@tanstack/react-query`, `react-navigation`, `react-navigation-tabs`, `tailwindcss`, `tailwindcss-react-native`, `expo-secure-store`, `react-native-keychain`, `expo-local-store`

**Step 3:** Configure `babel.config.js` with `plugins: [["module-transform", { ... }]]` if needed, set up `tsconfig.json`

**Step 4:** Verify `npx expo start` opens the dev tunnel

**Step 5:** Commit: `git add apps/mobile && git commit -m "feat: scaffold mobile expo project"`

**Step 6:** Verify: `npx expo start` succeeds, TypeScript compiles

**Step 7:** Risks: Template compatibility with Expo 51; iOS/Android SDK versions on dev machine

---
### Task 2: Port `lib/api.ts` to mobile storage

**Files:**
- Create: `apps/mobile/src/lib/api.ts`
- Modify: none

**Interfaces:**
- Consumes: none
- Produces: `ApiError`, `getAccessToken`, `setTokens`, `clearTokens`, `apiFetch` — identical API surface to web version, adapted for mobile storage

**Step 1:** Duplicate `apps/web/src/lib/api.ts` as `apps/mobile/src/lib/api.ts`

**Step 2:** Replace `localStorage` calls:
- `getAccessToken()`: try `await Keychain.getGenericPassword()` / fall back to `await SecureStore.getItemAsync(ACCESS_KEY)` (expo-secure-store)
- `setTokens(t)`: `await SecureStore.setItemAsync(ACCESS_KEY, t.access_token)` + `await SecureStore.setItemAsync(REFRESH_KEY, t.refresh_token)`
- `clearTokens()`: `await SecureStore.deleteItemAsync(ACCESS_KEY)` + `await SecureStore.deleteItemAsync(REFRESH_KEY)`

**Step 3:** Remove browser-only guards:
- `if (typeof window === "undefined") return null;` → remove entirely (mobile always has a window, just different)
- `window.location.href = "/login"` → replace with navigation to login screen via React Navigation

**Step 4:** Add `refreshPromise` guard same as web version

**Step 5:** Commit: `git add apps/mobile/src/lib/api.ts && git commit -m "feat: port api client to mobile storage"`

**Step 6:** Verify: run `npx expo start` and confirm auth flow works (manual login test or unit test if available)

**Step 7:** Risks: Keychain/secure store API differences between iOS and Android; Expo Go may not have full Keychain access

---
### Task 3: Create core API client types

**Files:**
- Create: `apps/mobile/src/lib/types.ts`
- Modify: none

**Interfaces:**
- Consumes: none
- Produces: `TokenResponse`, `MeOut`, `LoginRequest`, `RefreshRequest` types re-exported from backend schemas; any new fields auto-sync when backend schema changes

**Step 1:** Define types that mirror `backend/app/modules/identity/schemas.py`:
```typescript
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  must_change: boolean;
}
export interface MeOut {
  user: {
    id: string;
    email: string;
    full_name: string;
    first_name: string;
    permissions: string[];
  };
  tenant_id: string;
  tenant_name: string | null;
  role_name: string | null;
  is_platform: boolean;
  permissions: string[];
  branches: Array<{id: string; name: string; timezone: string}>;
  must_change: boolean;
}
export interface LoginRequest {
  email: string;
  password: string;
}
export interface RefreshRequest {
  refresh_token: string;
}
```

**Step 2:** Export from `apps/mobile/src/lib/` index

**Step 3:** Commit: `git add apps/mobile/src/lib/types.ts && git commit -m "feat: add mobile API types"`

**Step 4:** Verify: TypeScript `tsc --noEmit` passes

**Step 5:** Risks: Type drift from backend — need to sync when schemas change

---
### Task 4: Build navigation + TanStack Query provider

**Files:**
- Create: `apps/mobile/src/navigation/root.tsx`
- Create: `apps/mobile/src/navigation/tabs.tsx`
- Create: `apps/mobile/src/query/provider.tsx`
- Modify: none

**Interfaces:**
- Consumes: `AuthProvider` pattern from web, adapted for React Navigation
- Produces: Root navigator with bottom tabs: Dashboard | Members | Check-in | Billing | Expenses | Notifications | Settings; TanStack Query client configured with server base `/api/v1`

**Step 1:** Create `apps/mobile/src/query/provider.tsx` wrapping React Query devtools and exporting a `QueryClient` with `defaultOptions` matching web defaults (refetchOnWindowFocus, retry, etc.)

**Step 2:** Create `apps/mobile/src/navigation/tabs.tsx` with 7 bottom tabs, each pointing to a screen module

**Step 3:** Create `apps/mobile/src/navigation/root.tsx` with `AuthStack` (login → authenticated flow) and `AppStack` (tabs)

**Step 4:** Hook up `AuthProvider` from Task 5 to the navigation stack

**Step 5:** Commit: `git add apps/mobile/src/navigation/ && git commit -m "feat: build navigation + query provider"`

**Step 6:** Verify: navigate between tabs, QueryClient renders without errors

**Step 7:** Risks: Tab bar alignment on iOS vs Android; safe area insets handling

---
### Task 5: Build auth screen + AuthProvider for mobile

**Files:**
- Create: `apps/mobile/src/auth/auth-context.tsx`
- Create: `apps/mobile/src/auth/login-screen.tsx`
- Create: `apps/mobile/src/app/(auth)/login.tsx` (React Navigation route)
- Modify: none

**Interfaces:**
- Consumes: `apiFetch`, `TokenResponse`, `MeOut` from Tasks 2-3
- Produces: `AuthContext` with `me`, `loading`, `mustChange`, `login`, `logout`, `refreshMe`, `completePasswordChange` — identical interface to web version

**Step 1:** Create `apps/mobile/src/auth/auth-context.tsx` — port `apps/web/src/lib/auth.tsx` to mobile:
- `setTokens` → use mobile `setTokens` (SecureStore)
- `clearTokens` → use mobile `clearTokens`
- `login` → same POST `/api/v1/auth/login`, same token setting, same `apiFetch<MeOut>("/auth/me")`
- `logout` → same POST `/api/v1/auth/logout`, same token clearing
- `refreshMe` → same as web version
- `completePasswordChange` → same as web version

**Step 2:** Create `apps/mobile/src/auth/login-screen.tsx` with email/password form, `onSubmit` → `login`, error handling

**Step 3:** Create `apps/mobile/src/app/(auth)/login.tsx` — React Navigation route wrapping `AuthProvider` + `LoginScreen`

**Step 4:** Hook navigation: `AuthStack` = `LoginStack` → (when authenticated) `AppStack` → tabs

**Step 5:** Commit: `git add apps/mobile/src/auth/ && git commit -m "feat: build auth screen + context for mobile"`

**Step 6:** Verify: login succeeds, me fetches, tokens stored in SecureStore, logout clears

**Step 7:** Risks: Password visibility toggle; terms/consent before login; auto-login on app launch

---
### Task 6: Build Dashboard screen

**Files:**
- Create: `apps/mobile/src/screens/dashboard.tsx`
- Modify: none

**Interfaces:**
- Consumes: `useAuth` from auth context, TanStack Query
- Produces: greeting with owner name, quick stats cards (members count, today's revenue, pending expenses), quick action buttons

**Step 1:** Create `apps/mobile/src/screens/dashboard.tsx`:
- Use `useAuth()` to show greeting
- Use `useQuery` from TanStack Query for: `/auth/me`, `/api/v1/tenancy/settings` (quick stats)
- Layout: header with name, 3 stat cards in a row, quick-action icons below

**Step 2:** Add to tab navigation as first tab

**Step 3:** Commit: `git add apps/mobile/src/screens/dashboard.tsx && git commit -m "feat: build dashboard screen"`

**Step 4:** Verify: dashboard renders, stats load, greeting shows correct name

**Step 5:** Risks: Stat API endpoints may not exist yet; need to check which endpoints are safe to call

---
### Task 7: Build Members screen + check-in flow

**Files:**
- Create: `apps/mobile/src/screens/members.tsx`
- Create: `apps/mobile/src/screens/checkin.tsx`
- Modify: none

**Interfaces:**
- Consumes: `useAuth`, `apiFetch`, Member page APIs from backend (`GET /api/v1/members`, `POST /api/v1/attendance/`)
- Produces: member list with search, check-in button, check-out button, member detail view

**Step 1:** Create `apps/mobile/src/screens/members.tsx`:
- `useQuery` for `GET /api/v1/members` → `MemberPageOut` (supports pagination/search)
- FlatList with member rows, each showing name, membership status, last check-in
- Search/filter by name

**Step 2:** Create `apps/mobile/src/screens/checkin.tsx`:
- Two buttons: "Check In" and "Check Out"
- On press: `POST /api/v1/attendance/` with member_id and type
- Show success toast, update local state

**Step 3:** Add both to tab navigation (Members tab contains check-in sub-flow)

**Step 4:** Commit: `git add apps/mobile/src/screens/members.tsx apps/mobile/src/screens/checkin.tsx && git commit -m "feat: build members + check-in screens"`

**Step 5:** Verify: member list loads, check-in creates attendance record, check-out works

**Step 6:** Risks: Attendance API may require additional fields (branch_id, etc.); need to check schema

---
### Task 8: Build Billing screen + payment flow

**Files:**
- Create: `apps/mobile/src/screens/billing.tsx`
- Modify: none

**Interfaces:**
- Consumes: `useAuth`, `apiFetch`, billing APIs from backend (`GET /api/v1/billing`, `POST /api/v1/billing/{id}/pay`)
- Produces: invoice list, payment button, payment result view

**Step 1:** Create `apps/mobile/src/screens/billing.tsx`:
- `useQuery` for `GET /api/v1/billing` → `InvoicePage`
- FlatList of invoices with amount, status, due date
- "Pay" button per invoice → `POST /api/v1/billing/{invoice_id}/pay`
- Show payment result (success/failure)

**Step 2:** Commit: `git add apps/mobile/src/screens/billing.tsx && git commit -m "feat: build billing screen"`

**Step 3:** Verify: invoice list loads, pay button works, payment result shows

**Step 4:** Risks: Payment gateway integration may need additional config; sandbox vs production

---
### Task 9: Build Expenses screen + capture flow

**Files:**
- Create: `apps/mobile/src/screens/expenses.tsx`
- Modify: none

**Interfaces:**
- Consumes: `useAuth`, `apiFetch`, expenses APIs from backend (`POST /api/v1/expenses`, `GET /api/v1/expenses`)
- Produces: expense list, add expense form, expense categories, receipt attachment (camera)

**Step 1:** Create `apps/mobile/src/screens/expenses.tsx`:
- `useQuery` for `GET /api/v1/expenses` → `ExpensePageOut`
- Form: category select, amount input, description, date picker, receipt camera (expo-image-picker)
- On submit: `POST /api/v1/expenses`
- Show success toast, refetch list

**Step 2:** Add camera/photo library pick using `expo-image-picker`

**Step 3:** Commit: `git add apps/mobile/src/screens/expenses.tsx && git commit -m "feat: build expenses screen"`

**Step 4:** Verify: expense list loads, new expense form submits, photo pick works

**Step 5:** Risks: Camera permissions on iOS/Android; image compression for mobile

---
### Task 10: Build Notifications screen

**Files:**
- Create: `apps/mobile/src/screens/notifications.tsx`
- Modify: none

**Interfaces:**
- Consumes: `useAuth`, `apiFetch`, notification APIs from backend (`GET /api/v1/notifications`, `POST /api/v1/notifications/{id}/read`)
- Produces: unread count, notification list, mark-as-read buttons

**Step 1:** Create `apps/mobile/src/screens/notifications.tsx`:
- `useQuery` for `GET /api/v1/notifications/unread-count` → count
- `useQuery` for `GET /api/v1/notifications` → `NotificationPageOut`
- List with title, time, read/unread badge
- "Mark all read" button → `POST /api/v1/notifications/mark-all`
- Individual "Mark read" per notification

**Step 2:** Commit: `git add apps/mobile/src/screens/notifications.tsx && git commit -m "feat: build notifications screen"`

**Step 3:** Verify: unread count loads, list renders, mark-as-read works

**Step 4:** Risks: Push notification token registration not yet implemented; may need native config

---
### Task 11: Build Settings screen

**Files:**
- Create: `apps/mobile/src/screens/settings.tsx`
- Modify: none

**Interfaces:**
- Consumes: `useAuth`, `apiFetch`
- Produces: profile edit, password change, logout, app version, toggle notifications

**Step 1:** Create `apps/mobile/src/screens/settings.tsx`:
- Profile section: name, email (read-only), tenant name
- Password change: use same flow as web (`/auth/change-password`)
- Logout button → confirm + `logout()`
- App version from ` expo-constants` or `package.json`
- Toggle push notifications (on/off)

**Step 2:** Commit: `git add apps/mobile/src/screens/settings.tsx && git commit -m "feat: build settings screen"`

**Step 3:** Verify: profile shows correct data, password change flows to backend, logout clears tokens

**Step 4:** Risks: Profile picture upload may need separate endpoint; notification toggle may need native push config

---
### Task 12: Add iOS and Android build configs

**Files:**
- Modify: `apps/mobile/app.json`, `apps/mobile/eas.json` (if using Expo Application Services)
- Create: `apps/mobile/android/app/build.gradle` overrides if needed
- Modify: `ios/Info.plist` entries if needed

**Step 1:** Configure `apps/mobile/app.json` with `expo` key: `name`, `slug`, `ios`, `android` flags

**Step 2:** If using EAS: create `apps/mobile/eas.json` with build profiles (development, preview, production)

**Step 3:** Run `npx expo run:android --variant arm64-v8a` and `npx expo run:ios` to verify builds

**Step 4:** Commit: `git add apps/mobile/app.json && git commit -m "feat: add iOS/Android build configs"`

**Step 5:** Verify: both platforms build successfully, app launches

**Step 6:** Risks: Xcode version compatibility; Android NDK version; keystore config for release builds

---
### Task 13: Write + run mobile-specific tests

**Files:**
- Create: `apps/mobile/src/__tests__/api.test.ts`
- Create: `apps/mobile/src/__tests__/navigation.test.ts`
- Create: `apps/mobile/src/__tests__/auth.test.ts`
- Modify: none

**Interfaces:**
- Consumes: mock data mirroring backend API responses
- Produces: vitest/jest test suite that runs in Expo go simulator

**Step 1:** Create `apps/mobile/src/__tests__/api.test.ts` testing `apiFetch` with mocked `SecureStore`:
- `getAccessToken` returns mock token
- `setTokens` stores to mock SecureStore
- `apiFetch` 401→refresh→retry logic
- `ApiError` construction

**Step 2:** Create `apps/mobile/src/__tests__/auth.test.ts` testing auth flow:
- login with valid creds → tokens stored, me fetches
- login with invalid creds → ApiError 401
- logout clears tokens
- refresh token flow

**Step 3:** Create `apps/mobile/src/__tests__/navigation.test.ts` testing navigation:
- root navigator renders auth stack → app stack
- tabs render 7 screens
- protected routes require auth

**Step 4:** Run: `npx vitest run` or `expo test` depending on setup

**Step 5:** Commit: `git add apps/mobile/src/__tests__/ && git commit -m "feat: add mobile tests"`

**Step 6:** Verify: all tests pass, coverage ≥ 80% for new files

**Step 7:** Risks: vitest + react-native-dom compatibility; device vs simulator differences

---
### Task 14: End-to-end verification

**Files:**
- Modify: none (run existing suites)
- Modify: run `make e2e-<domain>` for relevant domains

**Interfaces:**
- Consumes: mobile app running on device/simulator
- Produces: acceptance criteria checklist passed

**Step 1:** Start dev servers: `make dev` (backend) + `make web` (frontend)

**Step 2:** Start mobile: `npx expo start` — scan QR with Go app or build to simulator

**Step 3:** Full flow test:
- Login as owner → lands on Dashboard
- Navigate to Members → check in a member
- Navigate to Billing → view/invoice pay
- Navigate to Expenses → add new expense with photo
- Navigate to Notifications → view unread count
- Navigate to Settings → change password, logout
- Login again → session persists from SecureStore

**Step 4:** Run: `make e2e-all` to ensure nothing broken on web side

**Step 5:** Commit: no new files; just verification step

**Step 6:** Verify: all acceptance criteria met, no regressions

**Step 7:** Risks: shared dev DB may have state from previous tests; e2e runs sequential not parallel

---
---
## Self-Review

**1. Spec coverage:** Every section of the design doc maps to a task:
- Task 1 scaffolds the project ✓
- Task 2 ports API client ✓
- Task 3 creates types ✓
- Task 4 builds navigation ✓
- Task 5 builds auth ✓
- Task 6 builds dashboard ✓
- Task 7 builds members + check-in ✓
- Task 8 builds billing ✓
- Task 9 builds expenses ✓
- Task 10 builds notifications ✓
- Task 10 builds settings ✓
- Task 11 adds build configs ✓
- Task 12 writes + runs tests ✓
- Task 13 does e2e verification ✓

**2. Step scan:** Each step lets the implementer write exactly one reasonable thing — no "TBD", no "handle edge cases" as bare steps. Every step has a concrete deliverable.

**3. Type consistency:** Types in Task 3 mirror `backend/app/modules/identity/schemas.py` exactly (`TokenResponse`, `MeOut`, `LoginRequest`, `RefreshRequest`). Navigation uses React Navigation 6 + TanStack Query identical to web. API client in Task 2 is a direct port of `apps/web/src/lib/api.ts`.

**4. Review Focus:** All five focus areas have tasks:
- Offline→sync: Task 9 (expenses write-local-then-sync)
- Auth flow: Task 5 mirrors web exactly, tokens in SecureStore
- Tenant scoping: every screen carries tenant context from auth me payload
- Initial load: TanQuery skeleton screens in each module
- Notifications: Task 10 includes unread count + mark-all

**5. Proportion:** 14 tasks for a full ERP mobile app is reasonable — each task is ~30 min, total ~7 hours. The plan is ~2x the spec length, which is expected since the plan documents decisions and tests rather than being a transcript.

---
## Execution Handoff

**Plan complete and saved to `docs/superpowers/specs/2026-11-11-mobile-erp-design.md`.**

Please review the plan. Which execution approach would you prefer?

- **Subagent-driven** - A fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** - I implement every task myself in this session, the way this harness runs work, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end. Runs well with a mid-tier session model, since the plan carries the design.

**For this plan I recommend Native**, because: 14 tasks are relatively independent (each screen/module), the API client port and type definitions are mechanical copies of existing code, and the main risk is platform-specific (iOS/Android quirks) which is best handled in-session rather than hand-off. The design is well-grounded in the existing web codebase, so an implementer can work from the plan with minimal friction.

Does the plan capture what you want, and which approach should we use?