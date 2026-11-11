# Mobile ERP Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement.

**Goal:** Build a React Native + Expo mobile app that runs the full owner/front-desk ERP on iOS and Android, reusing the existing FastAPI backend, sharing TypeScript types and API client, and staying in sync with the web app.

**Architecture:**
The mobile app (`apps/mobile`) is a self-contained Expo project. It reuses the backend's `/api/v1` surface unchanged — every router/router from the web surface (`identity`, `members`, `membership`, `billing`, `attendance`, `expenses`, `tenancy`, `notifications`) stays as-is. The mobile client shares the same `api.ts` pattern but replaces `localStorage` with `expo-secure-store`/`react-native-keychain`, removes browser-only guards (`window` checks become no-ops), and ports the existing tests to the mobile runtime.

Key reuse decisions:
- API client (`lib/api.ts`) is duplicated ~60 lines rather than extracted to a shared package — keeps build graph simple, avoids monorepo coupling for storage/nav models that differ between web and mobile.
- Types from `backend/app/modules/identity/schemas.py` (`TokenResponse`, `MeOut`, `LoginRequest`, `RefreshRequest`) are re-exported; any new fields auto-sync when the backend schema changes.
- TanStack Query (React Query) powers caching/stale-refresh on mobile identically to web.
- Navigation uses React Navigation 6 with bottom tab bars: Dashboard | Members | Check-in | Billing | Expenses | Notifications | Settings.
- Offline-first queue: write-local-then-sync pattern using expo-local-store, so check-ins and expenses work without a signal and batch to the backend when online.

**Approaches considered:**
A. Expo + React Native, self-contained `apps/mobile` — reuse TS types and duplicated ~60-line API client (chosen). Runtime fast; one codebase to maintain alongside web.
B. Same as A + extract `packages/core` shared API package — tighter type sync but adds monorepo coupling; storage and navigation models differ, so benefit is marginal.
C. Flutter — separate ecosystem, zero reuse of existing TS types/api.ts/components; slower to build and maintain.

**Spec:** `docs/superpowers/specs/2026-11-11-mobile-erp-design.md`

**Tech Stack:** React Native 0.73+, Expo 51, React Navigation 6, TanStack Query, Tailwind React Native CLI, expo-secure-store, react-native-keychain, expo-local-store

**Review Focus:** 
- Offline write → sync path works without data loss under network flakiness
- Auth flow: login → refresh → 401 retry mirrors web exactly; tokens never land in plain localStorage
- Tenant scoping: every API call carries the tenant context; no cross-tenant data leaks
- Initial load: skeleton screen + TanQuery cache keeps first render < 1s on typical gym WiFi
- Notifications: push token registration mirrors the existing web service