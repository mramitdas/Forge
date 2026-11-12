# Mobile Fitwoody-Style Redesign — Design Document

Date: 2026-11-12
Repo: `Forge` (this repository)
App: `apps/mobile` (Expo SDK 58, React Native 0.88, Expo Router, TanStack Query)
Branch: **stacked on `feat/mobile-ios-redesign`** (PR #147) — no merges required; the Fitwoody pass continues on the same branch until the desired result is reached (owner decision, 2026-11-12).
Supersedes: nothing. Extends the iOS-HIG restyle already in PR #147 with Fitwoody's visual DNA.

---

## 1. Intent and why

The owner wants the Forge owner/front-desk ERP to *feel* like FitWoody (App Store id 6449358284, by Chubby Studio S.L.): a warm, glanceable, score-driven app where the surface itself reacts to the state of the thing it tracks. FitWoody does this for a person's body; Forge does it for a gym. Same visual language, different subject matter.

This is a **restyle + two new routes + a nav-bar replacement**. The 4-tab IA from PR #147 is reduced to **2 tabs + a center-right action button** (owner decision, 2026-11-12, after analyzing the FitWoody bar screenshot — see §5.5). The two new routes are **Gym Passport** (`more/passport`) and **Settings Appearance** (`more/settings-appearance`). The backend `/api/v1` surface is **not changed at all** — every new number is computed client-side from data the app already fetches.

### What we take from FitWoody (publicly documented behaviors)

Source: App Store listing, `fitwoody.camp/design-updates` (their 2.0 Liquid Glass redesign notes), 9to5Mac indie spotlight, 60fps motion breakdown. We take **patterns**, never assets:

1. **iOS 26 Liquid Glass** — translucent, tinted-glass surfaces on cards, sheets, and navigation; depth without clutter.
2. **Dynamic Home** — one hero score "front and center"; the Home accent color itself reacts to state.
3. **Score culture** — a single 0–100 glanceable number per domain, with named pillars behind it and a tier word (their Sleep Score: "Regularity. Quality. Duration.").
4. **FitPassport** — a long-term "digital card" that narrates evolution across domains.
5. **Adaptive, guilt-free framing** — targets bend to reality; the app never punishes (their editorial identity: "doesn't punish imperfection").
6. **Motion** — springy scale-up pulses for icons, sliding status lists; Reduce Motion respected.
7. **Accessibility as a feature** — VoiceOver phrases ("one card, one phrase"), Dynamic Type, Sufficient Contrast, Differentiate Without Color Alone. All four App-Store-listed accessibility features are our bar too.

### What we explicitly do NOT take (anti-goals)

- **No mascot.** Woody is their brand. Forge gets no cloned companion character, no campfire iconography, no "alternative icon" pack.
- **No fake AI.** FitWoody's plain-language insights come from Apple Foundation Models. We have no LLM backend; we will not ship fake "AI" copy. Explanations are deterministic one-liners computed from the data (see §6.4).
- **No copied copy.** No FitWoody strings, screenshots, icons, or fonts. All microcopy is written fresh in Forge's voice (calm, exact, owner-first — per `DESIGN.md` §Overview).
- **No Apple-only features.** No HealthKit, watchOS, widgets, Siri/Shortcuts. Out of scope for an ERP.

---

## 2. Goals, non-goals, constraints

### Goals

1. **G1 — Dark-first Liquid-Glass theme** with a persisted light/dark/system toggle. Dark is the default first-run experience.
2. **G2 — Gym Pulse hero on Home**: a 0–100 score ring with three pillars, computed from real API data, loading with a springy entrance.
3. **G3 — Adaptive Home accent**: Home's tint and canvas wash shift green → amber → red as the gym's money health degrades. The app visibly "feels" the gym.
4. **G4 — Gym Passport screen**: month-over-month narrative of members, collected, outstanding, expenses.
5. **G5 — Check-ins-by-hour chart** on Home (a FitWoody "stages timeline" analog).
6. **G6 — Every existing screen** (members, subscriptions, billing, expenses, notifications, check-in, settings, login, detail routes) restyled onto the new tokens without behavior change.
7. **G7 — Accessibility bar met**: AA contrast in both themes on every text/background pair; status never conveyed by color alone; one-phrase VoiceOver for composite cards; Reduce Motion honored.
8. **G8 — Fix inherited defect**: `confirmAction` no-ops on web (`Alert.alert` is a stub in react-native-web), leaving Pay Cash and Log Out dead in the web preview. Add a web fallback.
9. **G9 — Stabilize the flaky jest suite** (observed 2026-11-12: first cold run 14/15, second run 15/15).
10. **G10 — FitWoody nav-bar replica**: floating glass bar with 2 tabs (Home / Members), the live Gym Pulse metric in the bar, and a dark square + button opening quick actions (§5.5).

### Non-goals

- No backend, web, or API-contract changes.
- No new screens beyond the two named routes: Gym Passport and Settings Appearance.
- No member-facing features (this is the owner/front-desk app).
- No push notifications, no onboarding flow (we are an authenticated ERP, not a consumer app).
- No charts beyond the hour chart and Passport rows (no line-chart library; see §6.3).

### Anti-goals (a failure even if it technically works)

- A dashboard that looks like a spreadsheet in a dark coat — density without hierarchy.
- Decorated-to-look-busy chrome: no ornamental gradients on content, no glow behind text, no card inside a card (carries over from `DESIGN.md` §Overview; FitWoody agrees — their 2.0 notes reduce clutter too).
- Scores that lie: any computed number must be traceable to a documented formula (§6.1) and degrade to "—" when its inputs are missing, never to 0-as-disguised-nothing.
- Light theme as an afterthought: every token pair must pass contrast in **both** palettes or the doc is violated.

### Constraints

- **C1 — Expo SDK 58 ground truth.** Per `apps/mobile/AGENTS.md`: never trust training data for Expo APIs. `expo-blur` must be installed via `npx expo install expo-blur` (SDK-resolved version), and its props checked against `https://docs.expo.dev/versions/v58.0.0/` before use. If `expo-blur` proves unavailable or breaks the web bundle, the fallback in §6.2 applies — do not silently swap.
- **C2 — No styling-library additions.** shadcn/ui is web React; its RN port (react-native-reusables) requires NativeWind/Tailwind — rejected (owner picked approach A, 2026-11-12). The hand-rolled `src/ui` kit is the only component system.
- **C3 — At most two dependencies added** in this redesign: `expo-blur` and — only if `ScoreRing` needs vector rendering per §6.1 — `react-native-svg`. Both must come via `npx expo install` (SDK-resolved) and each lands as its own `chore:` commit. Everything else uses what is installed.
- **C4 — Branch discipline.** Work lands on `feat/mobile-ios-redesign` as new commits (owner decision). Conventional commits, subject ≤ 50 chars, one task = one commit. AGENTS.md §5 promotion hops remain human-only.
- **C5 — Gates unchanged.** `npx --prefix apps/mobile tsc --noEmit` clean; `npm test --workspace=apps/mobile` 100% pass (read the output, never pin counts); backend untouched (verify with `git diff dev --name-only | grep -v '^apps/mobile\|^docs/'` → empty).
- **C6 — Money stays in minor units**; display goes through `formatMoney` (`src/lib/money.ts`). Never divide outside it.
- **C7 — Dates** display through the existing `formatDay`/`formatTime` helpers; no new date formatting ad hoc in screens.

---

## 3. Current state (what exists on `feat/mobile-ios-redesign` today)

Verified by reading the branch and running it (2026-11-12, expo web on :19006, backend `make dev` on :8000):

- **Tokens**: `src/ui/tokens.ts` — flat light-only iOS palette (`canvas #F2F2F7`, `tint #007AFF`, type scale 34/17/17/15/13/12, space, radius). Every screen imports `colors`, `space`, `type` directly. **This file becomes the theme seam; all screens must switch to `useTheme()` — no direct `colors` imports in screens after this redesign.**
- **Kit**: `src/ui/{Screen,GroupedList,GroupedRow,Segmented,SearchBar,Skeleton,Empty,ErrorRetry,SummaryCard,StatusCaption,confirm,stack-options,index}`. `Screen` owns large-title header, pull-to-refresh, scroll.
- **Routes**: `src/app/(tabs)/{home,members/[id],subscriptions/[id],more/{checkin,billing/[id],expenses,expense-add,notifications,settings,settings-password}}`, plus `(auth)/login` and `index.tsx` redirect. Tab items in `src/lib/tab-items.ts`.
- **Screens** (logic) in `src/screens/*.tsx`, one per route. `home.tsx` already fetches: `/members?page_size=1` (count), `/invoices/summary`, `/checkin?page_size=10` (recents), `/members?page_size=50` (name lookup).
- **Data available client-side, verified in `src/lib/types.ts`:**
  - `InvoiceSummaryOut { outstanding_minor, collected_minor, overdue_minor, monthly: Record<string, number> }` — `monthly` is the Passport series.
  - `CheckInOut { id, member_id, branch_id, recorded_at, source, result, reason }` — `recorded_at` powers the hour chart; `result` ∈ allowed/denied/duplicate.
  - `MemberOut` carries `status` (active/paused/cancelled) and `full_name`.
- **Known defects on this branch** (found in the 2026-11-12 walkthrough):
  - D1: `src/ui/confirm.ts` uses `ActionSheetIOS`/`Alert.alert` only → on web the promise never resolves; "Pay Cash" and "Log Out" silently no-op in the web preview.
  - D2: jest flake — one test failed on cold cache, passed on immediate re-run (suite not yet identified; investigate, don't suppress).
  - D3: aria-hidden/focus console warning when Pay row focused (react-native-web; benign but note if touched).
- **Gates baseline**: `tsc --noEmit` clean; 15 tests across 4 suites; backend tests/lint/build untouched by this work.

---

## 4. Approaches considered (decision record)

| Approach | Description | Why rejected/chosen |
|---|---|---|
| **A. Restyle on the #147 kit (CHOSEN)** | Keep `src/ui` kit; replace the tab bar per §5.5 (2 tabs + metric + action button); add theme layer, `expo-blur` glass, ScoreHero, HourChart, Passport | Owner picked it (2026-11-12). Zero second styling system; structure and tests carry over; deps: `expo-blur` + `react-native-svg` (C3). |
| B. shadcn-style via `react-native-reusables` + NativeWind | Port shadcn/ui components for RN, Tailwind pipeline | Owner mentioned shadcn.io/ui as optional ("if required"). It is not required: 12 screens, kit already covers them, and NativeWind means a second styling paradigm + build config. Rejected. |
| C. Fresh redesign from `dev` | Discard #147, rebuild | Throws away tested structure (tabs, skeletons, tests) the owner approved implicitly by keeping it. Rejected. |
| D. Dark-only (no light theme) | Simplest | Owner explicitly wants both themes with a toggle. Rejected. |

**"Use shadcn.io/ui if required" — resolution:** not required. Where shadcn patterns are genuinely useful (token-driven theming via CSS-variable-style palette objects, dialog/sheet conventions), we borrow the *pattern* into the kit, not the library.

---

## 5. Theme system (the seam)

### 5.1 Architecture

Two files, one responsibility each:

- **`src/ui/theme.ts`** — pure data, no React: `type Palette` (the token shape, typed), `palettes.dark`, `palettes.light`, plus the **static, theme-invariant scale** migrated from `tokens.ts`: `type` (the 34/17/17/15/13/12 scale), `space`, `radius`, `rowMinHeight`. Screens that only need layout constants keep importing them by name from `src/ui/theme` — they do not break when `tokens.ts` is deleted, and they need no re-render on theme change because the values never change.
- **`src/theme/theme-context.tsx`** — React: `ThemeProvider` and `useTheme()`.

`useTheme(): { palette: Palette; scheme: "light" | "dark"; accent: AccentTone }`:

- `palette` — the resolved token set for the active scheme.
- `scheme` — `"dark"` by default; `"light"` when chosen or when the system reports light under mode `"system"`.
- `accent` — the **adaptive tier object for Home** (`"strong" | "watch" | "atrisk" | null`), see propagation below. Non-Home screens ignore it and use `palette.accent` (static action tint).

`ThemeProvider` (wraps the root in `src/app/_layout.tsx` inside `QueryProvider`):

- Reads persisted `ThemeMode` from AsyncStorage key `forge.theme` via `src/lib/storage.ts`; **default on first run (key absent) is `"dark"`** — this is normative (G1), the §10 reserve is voided.
- Resolves `scheme` = mode unless `"system"`, then RN `useColorScheme()`.
- Holds `mode`, `setTheme(mode)` (persists immediately), and **`setHomeTier(tier: AccentTone)`** — the propagation mechanism: `home.tsx` computes the tier from its score and calls `setHomeTier` in a `useEffect` keyed on the tier value, and calls `setHomeTier(null)` on unmount so a stale tier never leaks into another screen. `accent` in the context value is that stored tier (consumed by Home and its child cards); every other screen and navigation chrome ignore it and use static `palette.accent`.
- Tab bar styling (in `(tabs)/_layout.tsx`): native gets a `BlurView` background (intensity from palette) over `rgba(14,16,20,0.85)` dark / `rgba(255,255,255,0.85)` light; web gets the solid rgba only (no DOM blur). Active tint = static `palette.accent` (not the home tier — the tab bar is chrome, not a status display); inactive tint = `palette.secondary`. Header tints in `stack-options.ts` become palette-aware the same way.

### 5.2 Palette tokens (exact values)

Dark (default, FitWoody energy):

| Token | Dark value | Notes |
|---|---|---|
| `canvas` | `#0E1014` | App background. |
| `canvasWash` | derived from accent tier, alpha 0.08 | Optional Home-only radial/route-level tint that makes the app "feel" state; see §6.1 / §6.2. |
| `surface` | `rgba(255,255,255,0.07)` | Card fill behind blur. |
| `surfaceStrong` | `rgba(255,255,255,0.12)` | Pressed/selected states, segmented track. |
| `separator` | `rgba(255,255,255,0.14)` | Hairlines, row separators. |
| `label` | `#F2F4F8` | Primary text. |
| `secondary` | `rgba(235,238,245,0.62)` | Captions, subhead. |
| `tertiary` | `rgba(235,238,245,0.38)` | Placeholders, disabled. |
| `accent` | `#30D158` | Interactive tint (green, FitWoody-family but ours). |
| `accentSoft` | `rgba(48,209,88,0.18)` | Badge/pill fills. |
| `onAccent` | `#06210D` | Text on accent fills. |
| `success` | `#30D158` | Allowed, Paid, Active. |
| `warning` | `#FFD60A` | Pending, amber tier. |
| `danger` | `#FF453A` | Overdue, Cancelled, destructive. |
| `searchFill` | `rgba(255,255,255,0.08)` | Search bar background. |
| `blurIntensity` | `40` | expo-blur intensity on native. |

Light (parity, porcelain):

| Token | Light value |
|---|---|
| `canvas` | `#F2F2F7` |
| `canvasWash` | accent tier, alpha 0.06 |
| `surface` | `#FFFFFF` |
| `surfaceStrong` | `#E9E9EF` |
| `separator` | `rgba(60,60,67,0.18)` |
| `label` | `#0B0C10` |
| `secondary` | `rgba(60,60,67,0.76)` | **Raised from the iOS-standard 0.62** — measured 3.47:1 on canvas / 3.63:1 on surface, both failing AA; at 0.76 the pair passes 4.96 / 5.30 (computed 2026-11-12, recorded in §13). |
| `tertiary` | `rgba(60,60,67,0.34)` | |
| `accent` | `#1E6B31` | Interactive tint; verified 5.88:1 on the light canvas (the earlier `#248A3D` draft measured 3.94 — rejected). |
| `accentSoft` | `rgba(30,107,49,0.14)` | Badge/pill fills. |
| `onAccent` | `#FFFFFF` | Text on accent fills; 6.56:1 on `#1E6B31`. |
| `success` | `#1E6B31` · `warning` `#B25000` (4.66:1 on canvas) · `danger` `#9E2B15` (6.7:1) | Canvas-text status colors. |
| `searchFill` | `#E3E3E8` |
| `blurIntensity` | `24` |

**Secondary & tertiary contrast rules (G7):** `secondary` is used for captions and subheads and **must** appear in `canvasTextPairs` (§9) to verify AA (≥ 4.5:1) against both `canvas` and `surface`. Verified values: dark `rgba(235,238,245,0.62)` → 6.75 on canvas / 6.16 on surface (pass as-is); light required raising the alpha to **0.76** (4.96 / 5.30) — the iOS-standard 0.62 fails and is forbidden in light. `tertiary` (`0.38` dark / `0.34` light) is strictly reserved for placeholders, disabled states, and decorative dividers (WCAG 1.4.3 exempts inactive/placeholder UI) and must never carry active status or primary/secondary copy — the §9 test asserts this by checking `tertiary` never appears in the status/pill/caption token sets.

Type scale (unchanged from #147, both themes): `largeTitle 34/700`, `title 17/600`, `body 17/400`, `subhead 15/400`, `footnote 13/400`, `caption 12/400`. Spacing `{xs 4, sm 8, md 12, lg 16, xl 20, xxl 24}`, radius `{sm 8, md 10, lg 12, full 999}`, `rowMinHeight 44`.

**Dynamic Type rule (G7):** the scale numbers are base sizes — RN scales text automatically unless `allowFontScaling={false}` is set. Therefore: **`allowFontScaling={false}` is forbidden anywhere in the app**, and no text container may hardcode a fixed height that clips scaled text (use `minHeight` with the existing `rowMinHeight`, never `height`). Large titles may cap growth with `maxFontSizeMultiplier` (≤ 2) but never disable scaling. A verifying test greps for `allowFontScaling` and fails the suite if found.

### 5.3 Glass cards

- Component `GlassCard` (new, in `src/ui`): wraps children in `BlurView` (native, `intensity` from palette) over a `palette.surface` rounded (radius `lg`) container; **on web it renders surface-only without BlurView** (expo-blur has no DOM implementation; verify against v58 docs — if the package exports a web stub that warns, the no-blur web branch is mandatory, not optional).
- Every card-shaped surface (`SummaryCard`, GroupedList sections, hero) becomes a `GlassCard`.
- Rule: blur decorates the canvas, never text — text sits on the solid-enough surface; no `BlurView` between text and its background.

### 5.4 Settings appearance row

Settings gets a grouped row "Appearance" opening `settings-appearance` route: three options (System / Light / Dark) as checkmark rows (same pattern as expense category/method pickers). Persisted immediately on tap; the change is visible instantly (no reload).

### 5.5 FitWoody nav-bar replica (normative — G10)

Owner directive: "exact replica" of the FitWoody bar shown in the App Store screenshot (analyzed 2026-11-12). We replicate **structure, material, and behavior** — never their glyphs, colors-as-brand, or assets (§1). The bar anatomy, left to right:

1. **Container** — floating rounded-rect, not a flush tab bar: side margins 8pt, bottom margin ~10pt above the home indicator, corner radius 24, fill = palette glass (`surface` over `BlurView` on native, solid rgba on web), soft shadow (opacity 0.12, radius 16, y-offset 4). In dark mode fill sits over the dark canvas at `rgba(30,32,38,0.85)`-equivalent via `surfaceStrong`-style token `barFill` (dark `rgba(28,30,36,0.82)` / light `rgba(255,255,255,0.82)`).
2. **Tab items (exactly two)** — `Home` and `Members` (`src/lib/tab-items.ts` → `["Home","Members"]`).
   - **Active state replica**: the active item sits in a **raised capsule highlight** — a rounded pill (radius full, height ~40pt) in `barActivePill` (dark `rgba(255,255,255,0.12)` / light `#FFFFFF` with a subtle shadow), containing the glyph + label in `palette.accent` (green). This is FitWoody's lifted active pill; ours is shape-and-material identical, color ours.
   - Inactive: glyph + label in `palette.secondary`, no pill.
   - Icons: SF-Symbols-style glyphs from the already-installed `@expo/vector-icons` (house/gear-free choices: `home` for Home, `people` for Members). No FitWoody flame.
3. **Live metric slot** — the **Gym Pulse score (§6.1)** rendered as semibold `title`-size text in the bar, FitWoody's "92.1%" slot: shows the score number (e.g. `82`), colored by tier; `"—"` when the score has no data yet. Tap → Passport route. VoiceOver: "Gym pulse 82, strong." This is how the app's state lives *in the chrome* — the §5.1 `setHomeTier` propagation feeds exactly this slot plus the Home wash; the **tab-bar background and active pill stay tier-neutral** (chrome is not a status display), only the metric text carries tier color.
4. **Dark action button** — far right, ~40×40pt, radius 12, fill `barAction` (dark `#E8EAF0`-on-dark inversion is wrong — replicate FitWoody's charcoal: **light theme `#2C2E33`, dark theme `#F2F4F8`** with inverted glyph so the button stays the highest-contrast element in both modes), white/dark `+` glyph (`plus`), springy scale pulse on press (§6.6). Opens a **quick-actions bottom sheet** (RN `Modal`, no dependency): Check-In, Add Expense, Record Payment, Subscriptions — each a 44pt row with glyph, pushing its existing route. Sheet uses glass surface, drag-handle bar, rounded top corners 20.
5. **Header (Home only)** — per FitWoody: title left; **notifications bell + settings gear** top-right (bell with unread badge dot, glyph+word on badge for a11y). These replace the More-tab entry points to Notifications and Settings. The bell routes to the existing notifications route; the gear to `more/settings`.

**IA consequence (normative):** the **More tab dissolves**. Billing, Expenses, Passport, Subscriptions become section cards on Home (FitWoody's Home-as-hub pattern): a "Money" group (Billing, Expenses) and "Insight" group (Passport, Subscriptions) below Recents, each a 44pt `GroupedRow` with glyph + chevron to the existing route — **routes and screens unchanged, entry points move**. Check-In remains reachable via the + sheet (primary) and keeps no tab. The `more/*` route paths are retained (no breaking URL changes; only the tab shell changes). The tabs test (§9) updates to expect `["Home","Members"]` and asserts the + button, metric slot, and header bell/gear exist.

---

## 6. FitWoody patterns → Forge features (normative specs)

### 6.1 Gym Pulse — the hero score (G2)

**What it is:** one 0–100 number on Home, "front and center", answering: *is the gym okay today?* Three pillars, tier word, ring.

**Formula (pure function, `src/lib/score.ts`, unit-tested):**

Inputs, all from existing queries on `home.tsx` (two of them change in this task — verified against `backend/app/modules/members/api.py:86` and `app/modules/attendance/service.py:186` on 2026-11-12):

- `checkinsToday: CheckInOut[]` (filter `/checkin?page_size=50` items to `recorded_at` in local today and `result === "allowed"`). The endpoint is ordered `recorded_at` descending, so the newest 50 arrive first. **Documented cap:** a gym with > 50 check-ins per day silently loses the oldest ones from both the Activity pillar and the HourChart (§6.2). Cap accepted for this redesign (no backend change); the code carries `shortcut: >50 check-ins/day truncates today's series, upgrade to a paginated fetch when a real gym crosses it`.
- `summary: InvoiceSummaryOut` — `monthly` is **month-keyed** (verified in `src/lib/types.ts`: `Record<string, number>` keyed `YYYY-MM`), so the daily target is the month-to-date daily rate: `sum(monthly[currentMonth]) / daysElapsedInMonth`, floored at 5. No per-day series exists; the "inspect payload shape" step is resolved as stated here.
- `activeMemberTotal: number` — from a dedicated `GET /members?status=active&page_size=1` query (`total` is exact for the filter; **replaces the biased 50-item sample** the earlier draft used — the members list endpoint is `created_at`-descending, so a first-50 slice was not a representative retention sample).
- `membersPage: PageOut<MemberOut>` (existing name-lookup query; `total` = members on file).
- `now: Date` (injected, never `new Date()` inside the function — testability).

Pillars, each 0–1:

1. **Activity (weight 0.4)** — `min(1, allowedCheckinsToday / dailyTarget)` where `dailyTarget = max(5, round(monthToDateDailyRate))` per the month-keyed `monthly` shape documented above.
2. **Money (weight 0.35)** — collection health: `collected / (collected + outstanding + overdue)`; when the denominator is 0 (fresh gym, nothing billed), the pillar is `null` → excluded from the weighted average with weights renormalized (never scored as 0).
3. **Retention (weight 0.25)** — `activeMemberTotal / membersOnFile`; when `membersOnFile` is 0, pillar is `null` (renormalize).

`score = round(100 × Σ(weight_i × pillar_i))` over non-null pillars. Clamp 0–100.

**Tiers (drive word, ring color, Home accent — G3):**

| Score | Tier word | Accent | Meaning |
|---|---|---|---|
| ≥ 80 | "Strong" | green (`palette.success`) | Push — gym is healthy. |
| 55–79 | "Watch" | amber (`palette.warning`) | Attention: money or attendance slipping. |
| < 55 | "At risk" | red (`palette.danger`) | Act today. |

**Honesty rules:**
- When **all** pillars are null (no data at all — possible only on a brand-new install), show the ring as empty with value "—" and caption "Not enough data yet". Never render 0.
- The score caption line is deterministic prose (§6.4), not a lie-checking afterthought: e.g. "Strong — 12 checked in, collections on track." Each caption template is enumerated in §6.4.

**Ring component (`ScoreRing`, new in `src/ui`):**
- Ring rendering: implement with `react-native-svg` (second allowed dependency per C3, added via `npx expo install`, own `chore:` commit) — an SVG arc is the honest way to draw a partial ring; a `borderWidth`-arc hack degrades under Dynamic Type and dark mode. Check `https://docs.expo.dev/versions/v58.0.0/` for the SDK-resolved version before install (C1).
- Animates 0→value on mount with a spring (~400ms, RN `Animated.spring`, `useNativeDriver: true`).
- Center: 44pt score number (`largeTitle` weight), tier word beneath in `footnote`.
- `accessibilityLabel` = full phrase: `"Gym pulse, 82 of 100. Strong. 12 checked in today, collections on track."` — one phrase, FitWoody's "one card one phrase" rule.

### 6.2 Home layout (G2, G3, G5)

Order, top to bottom on `Screen`:

1. Kicker: `{tenant_name} · {formatDay()}` (unchanged).
2. **ScoreHero**: `GlassCard` with `ScoreRing` (left) and the three pillars stacked right as small stat pairs (`footnote` label + `title` value): "Checked in today 12 / target 18", "Collected share 71%", "Active members 94%". Pillars that are null render "—".
3. Two `MetricCard`s in a row (existing `SummaryCard` restyled to glass + adaptive accent): "Unpaid ₹18,880" → Billing, "Past due ₹0" → Billing.
4. **HourChart** (G5, new `src/ui`): 24 slim bars from today's check-ins by hour (all hours rendered, zero-height for empty ones; two hours highlighted with accent when they are the day's peak buckets; caption "Busiest 7–8 am" style beneath, `footnote`). Empty day → `Empty` state "No check-ins yet today".
5. **Recents** `GroupedList` (unchanged behavior, glass surface, status pill for Allowed/Denied/Duplicate with color + glyph — see §7).

**Adaptive accent (G3):** Home sets `canvasWash` behind content to the tier color at the palette's wash alpha, and the tier word + ring use the tier color. Other screens stay neutral (static `accent`). This is the entire "app feels the gym" mechanic — no flashing, no animation on the wash, a calm tint only.

### 6.3 Gym Passport (G4)

New route `/(tabs)/more/passport`, reached from More hub ("Passport" row under a new "INSIGHT" group) and linked from Home's ScoreHero (tap-through). Reuses the invoices summary + members queries (React Query keys shared with Home so there is no refetch penalty) **and adds one query**: `GET /expenses?year=<current>` — verified shape in `backend/app/modules/expenses/service.py:46`: `ExpenseYearOut { monthly: dict[str, int] (month-keyed minor totals), total, expenses, page, page_size }`. The `monthly` map feeds card 4 below.

Content, as a vertical card stack (all `GlassCard`):

1. **This month vs last month (collected)**: for `summary.monthly` keys of the two most recent months: collected per month, delta arrow (glyph `▲`/`▼`, not color-alone) + `footnote` one-liner ("November collected ₹41,300, October ₹38,900 — up 6%").
2. **Members**: total on file, active share (exact from the `status=active` query, §6.1), joined-this-month count **only if** `MemberOut` exposes a joined date (verify `src/lib/types.ts` against a real payload at build time; if absent, this row is dropped rather than approximated).
3. **Money**: outstanding, overdue, collected this month; overdue > 0 renders the amber/red `StatusPill` with word, never color alone.
4. **Expenses**: this month's expense total from `ExpenseYearOut.monthly[currentMonth]` vs last month, same delta-arrow pattern ("November spent ₹2,180, October ₹4,900 — down 56%"). A month absent from the map renders "No expenses recorded for {month}".
5. Narrative row at the bottom: the same deterministic one-liner style as §6.4 summarizing the month ("Collections kept pace; 3 invoices went past due — worth a nudge before renewal week.") — the builder adds one expense-aware template variant: `"Collections held and spending came in at {amount} — steady month."`

Data honesty: any missing month key → "No data for {month}". No fabricated numbers.

### 6.4 Deterministic explanation copy (no fake AI)

Pure function `src/lib/score.ts:explainScore(inputs, score) → string`. Templates (en-IN money formatting via `formatMoney`):

- All strong: `"Strong — {n} checked in today, collections on track."`
- Money drag: `"Watch — {overdue} past due ({amount}) is pulling the month down."`
- Quiet day: `"Quiet — {n} checked in so far against a target of {target}."`
- No data: `"Not enough data yet — the score wakes up as check-ins and invoices arrive."`

The builder may refine wording; the constraint is: **every sentence's numbers come from the inputs; templates are enumerable and tested.**

### 6.5 Confirm action web fallback (G8, defect D1)

`src/ui/confirm.ts` gains a first branch:

```ts
if (Platform.OS === "web") {
  resolve(window.confirm(message ? `${title}\n${message}` : title));
}
```

placed above the native branches. Pay Cash and Log Out then work in the web preview. One test: stub `window.confirm` returning true/false and assert resolution.

### 6.6 Motion

- ScoreRing spring on mount; card entrance: fade+8pt rise, staggered 40ms, native driver, ~250ms.
- Icon taps: springy scale pulse (1 → 1.06 → 1), the FitWoody pulse — only on `ScoreHero` and tab icons, nowhere else (restraint).
- All motion gated behind `AccessibilityInfo.isReduceMotionEnabled()` (listen for changes). Reduce Motion ⇒ skip springs/stagger, instant states.
- No parallax, no confetti, no loops. Idle animation is an anti-goal.

### 6.7 Hour chart accessibility

`Chart` gets `accessibilityLabel` with the phrase ("12 check-ins today, busiest 7 to 8 am") and `accessibilityRole="image"`. The caption duplicates the takeaway in text — differentiate-without-color-alone holds because peaks are the tallest bars, not just colored ones.

---

## 7. Status system (both themes, AA, shape+word)

`StatusPill` (restyled from #147's `StatusCaption`): rounded-full pill, fill per semantic color at the stated alpha over that theme's `canvas`, **always** a leading glyph + word. All ratios below were computed (WCAG relative luminance, sRGB) on 2026-11-12 and pass AA (≥ 4.5:1); the §9 test re-derives them from this table as data:

| Status | Glyph | Word | Dark fill (α over `#0E1014`) / text | Dark ratio | Light fill (α over `#F2F2F7`) / text | Light ratio |
|---|---|---|---|---|---|---|
| Allowed / Paid / Active | `✓` | Allowed · Paid · Active | green `#30D158` @0.18 / `#7EE2A8` | 8.75 | green `#30D158` @0.14 / `#1E6B31` | 5.34 |
| Pending / Watch | `◐` | Pending | amber `#FF9500` @0.18 / `#FFD60A` | 10.02 | amber `#FF9500` @0.14 / `#8A4B00` | 5.51 |
| Overdue / Denied / Cancelled | `✕` | Overdue · Denied | red `#FF453A` @0.18 / `#FF8A80` | 6.88 | red `#FF453A` @0.14 / `#9E2B15` | 5.66 |
| Duplicate check-in | `≡` | Duplicate | neutral `#8E8E93` @0.18 / `#B9BCC7` | 7.89 | neutral `#8E8E93` @0.14 / `#5B5E68` | 5.11 |

Canvas-text status pairs (for captions and tier words, also verified): dark `#7EE2A8` 12.09, `#FFD60A` 13.49, `#FF8A80` 8.34 on `#0E1014`; light `#1E6B31` 5.88, `#B25000` 4.66, `#9E2B15` 6.7 on `#F2F2F7`.

Rules: the table is the source of truth — a failing pair in the §9 test is a bug, not a style choice. Glyph + word mean status never rides on color alone.

---

## 8. Screen-by-screen restyle map (G6)

All screens: `tokens` imports → `useTheme()`; cards → `GlassCard`; status rendering → `StatusPill`; headers/stack options unchanged (`src/ui/stack-options.ts` gains palette-aware `headerTintColor`).

| Screen/route | Change beyond token swap |
|---|---|
| `home.tsx` | Hero (§6.1–6.2), adds `/checkin` today fetch + score module; adaptive wash; **Home-as-hub**: Money/Insight section cards (Billing, Expenses, Passport, Subscriptions) + header bell/gear (§5.5); feeds pulse metric + tier to the tab bar |
| `members.tsx`, `members/[id].tsx` | Glass list/sections, `StatusPill`; no logic change |
| `subscriptions.tsx`, `[id].tsx` | Glass; segmented keeps `surfaceStrong` track; Activate confirm now works on web (§6.5) |
| `more.tsx` | + Passport row; colored icon squares keep semantic colors from palette |
| `checkin.tsx` | Glass list; result banner via `StatusPill`; button tint = static `accent` |
| `billing.tsx`, `billing/[id].tsx` | Glass; Pay Cash works on web now; swipe-pay unchanged |
| `expenses.tsx`, `expense-add.tsx` | Glass; picker checkmarks use `accent` |
| `notifications.tsx` | Glass rows, unread dot keeps a glyph fallback |
| `settings.tsx`, `settings-password.tsx` | + Appearance row (§5.4); Log Out works on web |
| `(auth)/login.tsx` | Glass card on canvas, `accent` button, dark-first |
| `src/app/(tabs)/_layout.tsx` | **Replaced per §5.5 (G10)**: floating glass bar (rounded-rect, radius 24, `barFill` + native `BlurView`), 2 tabs (Home/Members) with raised active capsule, Gym Pulse metric slot, dark + button → quick-actions sheet. New tokens: `barFill`, `barActivePill`, `barAction` in both palettes |
| `src/app/(tabs)/more/_layout.tsx`, `more.tsx` | More hub route retired from the tab shell; `more/*` paths retained as pushed routes; hub rows (Members stays a tab, so More drops it) redistributed per §5.5 — Billing/Expenses/Passport/Subscriptions as Home section cards, Notifications/Settings as Home header buttons |
| `src/app/_layout.tsx` | `ThemeProvider` wrap |

Files created: `src/ui/theme.ts` (palettes + static scale only), `src/theme/theme-context.tsx` (ThemeProvider + `useTheme` + `setHomeTier` — §5.1's split), `src/ui/GlassCard.tsx`, `src/ui/ScoreRing.tsx`, `src/ui/HourChart.tsx`, `src/ui/StatusPill.tsx`, `src/ui/QuickActions.tsx` (§5.5 bottom sheet), `src/lib/score.ts`, `src/app/(tabs)/more/passport.tsx`, `src/app/(tabs)/more/settings-appearance.tsx`, `src/screens/passport.tsx`, `src/screens/settings-appearance.tsx`, `src/__tests__/score.test.ts`, `src/__tests__/confirm.test.ts`, `src/__tests__/theme.test.ts(x)`.
Files modified: `src/lib/tab-items.ts` → `["Home", "Members"]` (§5.5).
Files deleted: `src/ui/tokens.ts` — its `space`/`type`/`radius`/`rowMinHeight` migrate verbatim into `src/ui/theme.ts` as static named exports, so layout imports change only their module path.

---

## 9. Testing

- **New unit tests**: `score.ts` (table-driven: each tier boundary 54/55/79/80, null-pillar renormalization, empty-data → null score, today filtering with injected `now`), `confirm.ts` web fallback (true/false paths), theme persistence (mode set → storage key written; system mode follows mock `useColorScheme`).
- **Existing tests keep passing except the tab-shell assertions**: the tab-items/tabs tests update to expect `["Home", "Members"]` (§5.5) and add coverage for the + button (opens sheet with 4 rows), the pulse metric slot (renders score or "—"), and the Home header bell/gear. Everything else (15 suites) untouched.
- **Flake fix (G9/D2)**: identify the cold-cache failure before adding new suites; if it is module-init timing, fix the cause (setup import order in `jest.setup.ts`) — no retries-as-strategy.
- **Contrast check**: the §7 pill table and canvas-text pairs are exported as data from `theme.ts` (`statusPairs`, `canvasTextPairs` with fill/text/alpha/background/ratio-expected); a test iterates them, recomputes WCAG ratios, and fails if any pair drops below 4.5:1 or disagrees with the recorded ratio. This makes the doc's numbers executable, not prose.
- **Manual gates** (recorded in PR): expo web walkthrough of every route in **both** themes at 390×844; login → home → passport → members → subscriptions → check-in → billing → expenses → notifications → settings → appearance toggle; score matches hand-computed formula on the seeded backend; Reduce Motion emulation shows no springs.

---

## 10. Left to the builder (decisions pre-delegated, with reasons)

1. **SVG strategy for `ScoreRing`** — resolved: `react-native-svg`, SDK-version checked at install time (C1/C3).
2. **`summary.monthly` payload shape** — resolved: verified month-keyed (`Record<string, number>` keyed `YYYY-MM`) per §6.1; compute month-to-date daily rate (`sum(monthly[currentMonth]) / daysElapsedInMonth`, floored at 5).
3. **`MemberOut` joined-date availability** — decides whether Passport has a "joined this month" row; drop rather than approximate.
4. **Wording** of tier captions within §6.4's template constraints (Forge voice, no invented claims).
5. **Blur on Android** — expo-blur behavior differs per platform; if Android experimental blur degrades legibility, fall back to solid `surface` per-platform (comment the why).
6. Exact spring parameters within the §6.6 bounds.

**Reserved to the owner** (do not decide silently): final accent hue sign-off (green `#30D158` dark / `#1E6B31` light), whether ScoreHero tap goes to Passport.

Resolved here (was reserved in the first draft): **first-run theme default is `"dark"`** — normative per G1; the `forge.theme` key absent in storage resolves to dark, not system.

## 11. Task order (for the plan)

1. **Jest flake root-cause fix (G9/D2) — first**, so every later suite lands on stable ground (§9's ordering rule)
2. Theme layer (`theme.ts` palettes + static scale, `theme-context.tsx`, Settings appearance route) — tokens only, screens still old palette
3. Migrate all screens to `useTheme` (mechanical), delete `tokens.ts`
4. `GlassCard` + `expo-blur` (+ `react-native-svg` if required) — commit(s) separate per C3
5. `confirm.ts` web fallback + test (G8)
6. `StatusPill` system + AA test from the §7 table (§7/§9)
7. `score.ts` + tests (§6.1)
8. Nav-bar replacement (G10, §5.5): floating glass bar, 2 tabs + active capsule, pulse metric slot, dark + button → `QuickActions` sheet; dissolve More hub (Home section cards + header bell/gear); update tab tests
9. `ScoreRing` + `ScoreHero` on Home, `setHomeTier` propagation, adaptive wash (§6.2)
10. `HourChart` on Home (§6.2/6.7)
11. Gym Passport route + screen incl. expenses card (§6.3)
12. Motion pass + Reduce Motion gates (§6.6)
13. Full walkthrough both themes + gates; PR description records contrast ratios and score hand-check

## 12. References

- FitWoody public sources (patterns only, no assets): App Store listing id 6449358284; `fitwoody.camp/design-updates` (Liquid Glass 2.0 notes); 9to5Mac 2025-10-25 indie spotlight; 60fps.design FitWoody motion shots.
- In-repo: `DESIGN.md` (brand voice, anti-references), `PRODUCT.md` (register/users), `apps/mobile/AGENTS.md` (Expo ground-truth rules), PR #147 (the base being extended), `docs/superpowers/specs/2026-11-11-mobile-erp-design.md` (original architecture).
- Walkthrough evidence 2026-11-12: screenshots in `.screens/redesign-*.png` (light, pre-Fitwoody).

## 13. Verification record

2026-11-12 — first external AI review returned 12 findings; all resolved in this revision:

1. G1/§10 default-theme contradiction → §10 reserve voided; first-run default is `"dark"`, normative.
2. C3 vs react-native-svg → C3 now allows at most two deps (`expo-blur`, `react-native-svg`), each an own commit.
3. New-screen count → §1/§2 name both new routes (Passport, Settings Appearance).
4. Token architecture → §5.1 splits: static `space`/`type`/`radius`/`rowMinHeight` stay named exports of `src/ui/theme.ts`; React provider in `src/theme/theme-context.tsx`.
5. Passport expenses gap → `/expenses?year=` card added (§6.3), shape verified in backend source.
6. Check-in >50/day cap → documented with a `shortcut:` comment requirement (§6.1).
7. Retention 50-sample bias → replaced with exact `GET /members?status=active&page_size=1` total (filter verified in `backend/app/modules/members/api.py:86`).
8. Accent propagation → `setHomeTier` context setter, reset on unmount (§5.1).
9. §7 partial hex table → all 8 cells + canvas pairs now carry computed, passing ratios (computed 2026-11-12; re-derived by the §9 test).
10. Tab bar blur/light → per-scheme rgba + native `BlurView`, solid web (§5.1/§8).
11. theme.ts vs theme-context.tsx split → explained in §5.1/§8.
12. Task order → flake fix moved to task 1 (§11); Dynamic Type rule added (`allowFontScaling={false}` forbidden, grep-tested) in §5.2.

Rejected-draft values kept for the record: light accent `#248A3D` (3.94:1 — fails AA) → replaced by `#1E6B31` (5.88:1); light danger text `#C7331B` (4.06:1) → `#9E2B15` (5.66:1 on fill).

2026-11-12 — second external review patch, applied with one correction:

13. Approach A dep list synced with C3 (`expo-blur` + `react-native-svg`).
14. `setHomeTier` consumption clarified: Home and its child cards only; all other screens and navigation chrome use static `palette.accent`.
15. Dangling `§6.1.3` cross-reference fixed to `§6.1 / §6.2`.
16. `secondary`/`tertiary` usage rules added — **with a correction to the review's premise**: light `secondary` at the proposed 0.62 alpha *fails* AA (3.47 canvas / 3.63 surface, measured); the palette now ships light `secondary` at `rgba(60,60,67,0.76)` (4.96 / 5.30) and dark keeps 0.62 (6.75 / 6.16, pass). Both pairs join `canvasTextPairs`. `tertiary` is WCAG 1.4.3-exempt (placeholder/disabled/decorative only) and excluded from status/caption sets by test.
17. `summary.monthly` shape moved from "builder inspects" to resolved (month-keyed `YYYY-MM`, month-to-date daily rate).

2026-11-12 — owner supplied the FitWoody App Store screenshot of the nav bar and directed an exact replica; analyzed and encoded as §5.5 (G10):

18. Nav bar anatomy extracted from the image: floating rounded-rect glass bar (radius 24, side margins), two tab items with a raised active capsule, a live metric ("92.1%") rendered in the bar, a dark rounded-square action button, and bell + gear in the Home header. Mapped to Forge: Home/Members tabs, Gym Pulse metric slot (tier-colored, tap → Passport), dark + button → quick-actions sheet, Home header bell/gear.
19. IA consequence documented: More tab dissolves; Billing/Expenses/Passport/Subscriptions become Home section cards; `more/*` route paths retained; tab tests updated (§5.5, §9, §11 task 8).
