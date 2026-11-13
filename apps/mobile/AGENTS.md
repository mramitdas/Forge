This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx jest                    # test suite
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## House rules (FitWoody)

These override anything above that conflicts with them.

### Directory layout

```
src/app/      Expo Router routes ONLY — a route file imports a screen and renders it. No logic, no data fetching.
src/screens/  One component per screen.
src/ui/       Design-system primitives (Screen, GlassCard, StatusChip, RestrictedArea, ...).
src/theme/    Design tokens + ThemeProvider.
src/fixtures/ Phase 1 data (replaced by the real API in Phase 2).
src/lib/      Pure logic: capabilities, money, storage, auth events.
src/permissions/  useCan() hook.
src/query/    TanStack Query provider + per-domain hooks.
```

- A route file stays under ~10 lines.
- One test file per source file, in a `__tests__/` folder next to the source.
- Never hardcode a hex, radius or spacing value in a screen — everything comes from `src/theme/tokens.ts`.

### Capability gating (the core rule)

- Roles differ by **action**, never by screen. The same screen exists for everyone.
- `useCan('billing.manage')` gates a **control**. A control without the capability is not rendered.
- A screen without its `view` capability renders `<RestrictedArea />` — never a redirect, never a spinner, never partial data.
- A query hook without its `view` capability must not fetch (`enabled: false`).
- Navigation and the QuickActions sheet only list items the user can actually use.

### Testing

- `@testing-library/react-native` v14: `render` is **async** — `await render(<X />)` before querying.
- `screen` is bound to the most recent render; use unique `testID`s when a test renders more than once.
- No network calls in tests — Phase 1 is fixture-backed.

### Design system (design.md)

- Dark-first. The design tokens live in `src/theme/tokens.ts`; `design.md` at the repo root is the source of truth.
- Space Grotesk for headlines and metric readouts only; Inter for everything operational.
- Money and counts use tabular figures (`fontVariant: ['tabular-nums']`).
- Status is never conveyed by colour alone — chip carries an icon and a word.
- One Signal Rule: the periwinkle accent covers at most 10% of the screen.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
