---
name: Forge
description: Owner-first, zero-friction gym operations — a calm, precise gym ERP workspace.
colors:
  accent: "#aab2ff"
  accent-hover: "#bcc3ff"
  accent-ink: "#0f1224"
  accent-soft: "#aab2ff29"
  canvas: "#15161d"
  surface: "#1d1e27"
  panel: "#1c1d26b8"
  ink: "#f0f1f7"
  ink-soft: "#b8bacb"
  ink-faint: "#8a8ca0"
  line: "#ffffff17"
  success: "#4fd7a0"
  warning: "#ffb54a"
  danger: "#ff7a70"
  info: "#7ab0ff"
  canvas-light: "#f2f3f8"
  surface-light: "#ffffff"
  ink-light: "#1f2130"
  accent-light: "#7b87f2"
typography:
  display:
    fontFamily: "Space Grotesk, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "1.2"
    letterSpacing: "-0.025em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "1.5"
    letterSpacing: "0.01em"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "1.4"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "16px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-ghost:
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "20px"
  badge:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  nav-item-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "34px"
  nav-item:
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "34px"
  segmented:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "28px"
---

# Design System: Forge

## Overview

**Creative North Star: "The Instrument Panel"**

Forge should feel like a well-calibrated cockpit for a gym, not a website about one. The workspace is dark by default — Midnight Graphite, periwinkle signals, cool grey type — with a light porcelain mode for daylight. Surfaces are translucent glass over a quiet ambient field of pastel glows, so the chrome recedes and the numbers lead. Density is deliberate: tables, metric tiles, and forms are compact but never crowded, and the eye can always find the primary action.

Calm, exact, quietly premium. Precision shows up in alignment, consistently formatted money, a 4-point spacing scale, and a single accent reserved for action and state. Nothing is decorated to look busy: no ornamental gradients on content, no glow behind text, no card inside a card.

The system explicitly rejects legacy gym software such as Mindbody: grey form walls, density without hierarchy, and modal-on-modal workflows. Familiarity is the goal — an operator fluent in Linear or a native macOS tool should trust every screen immediately.

**Key Characteristics:**
- Dark-first Midnight Graphite canvas with periwinkle signals and a porcelain light mode.
- Layered glass panels with hairline borders and a 1px top edge highlight.
- Space Grotesk only for the wordmark and short headings; system sans for all operational text.
- One accent: primary action, active navigation, selected state. Never decoration.
- Compact 13px operating type, 4-point spacing, and 8/16px radii.

## Colors

Cool periwinkle against near-black blue-graphite, with porcelain as the light-mode counterpoint; semantic hues appear only as soft tonal badges and status dots.

### Primary

- **Periwinkle Signal** (#aab2ff): the single action color — primary buttons, the active nav rail item, selected states, focus rings, and the glow under primary actions. Hover brightens to #bcc3ff; text on accent is Midnight Ink #0f1224.
- **Periwinkle Wash** (#aab2ff29): 16% alpha accent for soft selected backgrounds, badge fills, and focus halos.

### Neutral

- **Midnight Graphite** (#15161d): the app canvas; the ambient glow field sits behind it.
- **Elevated Surface** (#1d1e27): opaque panels — modals, popovers, the strongest layer.
- **Glass Panel** (#1c1d26b8): 72% alpha panel for cards and the sidebar, with 20px blur and 1.4 saturation.
- **Ink** (#f0f1f7), **Ink Soft** (#b8bacb), **Ink Faint** (#8a8ca0): primary text; secondary text and table metadata; labels and placeholders.
- **Hairline** (#ffffff17): 9% white borders and dividers; strong hairlines use 15%.
- **Cool Porcelain** (#f2f3f8), **Porcelain Surface** (#ffffff), **Graphite Ink** (#1f2130), **Daylight Periwinkle** (#7b87f2): the light-mode equivalents of canvas, elevated surface, ink, and accent.

### Secondary

Omitted. There is no second brand accent; semantic hues are functional, not decorative.

### Semantic

- **Signal Green** (#4fd7a0): paid, active, granted, success.
- **Signal Amber** (#ffb54a): pending, paused, due soon, warning.
- **Signal Red** (#ff7a70): overdue, denied, destructive actions, errors.
- **Signal Blue** (#7ab0ff): informational and lead states.

### Named Rules

**The One Signal Rule.** Periwinkle covers ≤10% of any screen: the primary action, the active nav item, selection, and focus. If two elements compete for it, one is wrong.

**The Ambient-Outside Rule.** Pastel glows live behind the canvas and in the primary-action shadow. Never place a glow inside a card, behind text, or on a resting surface.

## Typography

**Display Font:** Space Grotesk (fallback: -apple-system, SF Pro Display, Segoe UI, Roboto)
**Body Font:** System sans (SF Pro Text / Segoe UI / Roboto stack)
**Label Font:** System sans, medium weight; the kicker uses the same family at 10.5px/700 with 0.18em tracking.

**Character:** A geometric grotesque for short anchors, paired with the reader's native UI sans for everything operational. The pairing keeps the shell feeling like a desktop tool rather than a branded web page.

### Hierarchy

- **Display** (600, 15–16px, 1.2, -0.025em): page, section, and modal titles. The FORGE wordmark is the one wide-tracked exception (30px, 0.18em).
- **Body** (400, 13px operational / 14px base, 1.5): table cells, form values, descriptions, prose. Keep prose at 65–75ch.
- **Label** (500, 12px): field labels and secondary captions. Kicker (700, 10.5px, 0.18em, uppercase) is reserved for shell section labels such as WORKSPACE.

### Named Rules

**The Wordmark-Only Rule.** Space Grotesk is for the wordmark and short headings. Table data, labels, buttons, and body copy always use the system sans.

**The Fixed-Scale Rule.** Product type is fixed px. No clamp() in the app shell; a heading that shrinks in a sidebar is worse, not better.

## Elevation

The system is layered glass — not flat, not heavily lifted. Cards and the sidebar are translucent panels (20px blur, 1.4 saturation) with a 1px hairline and a subtle top edge highlight; an ambient shadow separates them from the canvas. Modals swap glass for an opaque Elevated Surface and a deeper shadow so content stays readable. Depth communicates hierarchy and state; it is never decoration.

### Shadow Vocabulary

- **Card rest** (`0 8px 24px rgba(0,0,0,0.4)`): glass panels against the canvas.
- **Primary action glow** (`0 1px 12px rgba(170,178,255,0.4)`): the accent button; in light mode the glow is 32% periwinkle.
- **Toast** (`0 12px 40px rgba(0,0,0,0.4)`): floating status at the bottom center.
- **Modal** (`0 25px 50px -12px rgba(0,0,0,0.25)`): the strongest lift, paired with an opaque surface.

### Named Rules

**The Glass-at-Rest Rule.** Panels are glass at rest. Shadows appear to mark elevation (modal, toast) or action (primary button), never to decorate a flat surface.

## Components

### Buttons

- **Shape:** 8px radius; 36px default height (h-9), with 28/32/40px sizes; 13px semibold.
- **Primary:** Periwinkle Signal fill, Midnight Ink text, 1px glow shadow. Hover brightens to #bcc3ff; active scales to 0.98.
- **Secondary:** translucent fill with a 1px strong hairline and blur; ink text.
- **Ghost:** ink-soft text, transparent until hover; used for table row actions.
- **Danger:** Signal Red fill, white text; reserved for destructive confirmation.
- **Focus:** every button must show a visible 2px accent focus ring; inputs already use a 2px accent/20 ring.

### Chips and Badges

- Full pill, 11px semibold, 2px/8px padding.
- Tonal soft backgrounds at 14–17% alpha with matching hue text (green, amber, red, blue, gray).
- Status badges add a 6px current-color dot at 70% opacity.

### Cards and Containers

- 16px radius, glass panel, 1px hairline, top edge highlight, ambient shadow.
- Typical padding 20px; metric tiles 16px. Never nest cards; use spacing and hairline dividers for inner hierarchy.
- Tables sit directly in the card: hairline row dividers, a tinted thead, 20px horizontal cell padding.

### Inputs and Fields

- 36px height, 8px radius, translucent fill, 1px hairline.
- Focus shifts the border to accent/60 and adds a 2px accent/20 ring.
- Placeholders use ink-faint but must still meet 4.5:1 against the field; disabled fields drop to 50% fill.
- Selects keep native menu behavior with a custom chevron; textareas are 72px minimum and non-resizable.

### Navigation

- 236px fixed sidebar, canvas/85 with a 2xl blur and a hairline right border.
- Items are 10px radius, 13px semibold, 8px vertical padding; icons lead, labels follow.
- Active: Periwinkle Signal fill with Midnight Ink text and a soft glow. Inactive: ink-soft, filling on hover.
- Section labels use the kicker style; notification counts ride the item's trailing edge.
- Header: 52px, hairline bottom, 15px display title on the left; health dot and date on the right.

### Modals and Toasts

- Modal: centered, 16px radius, opaque Elevated Surface, 24px padding, black/60 backdrop with 4px blur, 220ms scale-and-fade; focus is trapped and Escape closes.
- Toast: bottom-center pill, panel at 90% opacity, 12px/40px shadow, 250ms rise; mounted in a persistent `role="status"` live region and dismissed manually.

### Segmented Control

A 28px track (8px radius, translucent fill) holding 6px-radius segments; the selected segment uses the opaque panel plus a small shadow. Used for view switches, never for destructive choices.

## Do's and Don'ts

### Do:

- **Do** put the primary action in a top action row where the eye lands first; routine tasks never hide behind menus.
- **Do** scope every money and count figure visibly to its period (for example the year selector beside the expense total).
- **Do** use the 4-point spacing scale (4/8/12/16/20/24) and the radius scale (6/8/10/16/999).
- **Do** keep Periwinkle Signal at ≤10% of the screen and reserve it for action, active state, and focus.
- **Do** give every interactive element a visible keyboard focus state; no invisible-focus controls.
- **Do** keep glass panels at rest and use shadow only for elevation or action.

### Don't:

- **Don't** reproduce legacy gym software (Mindbody): cluttered, dated, enterprise-heavy screens, with density without hierarchy, grey form walls, or modal-on-modal workflows for routine tasks.
- **Don't** use gradient text beyond the existing greeting exception; no new background-clip text effects.
- **Don't** use Space Grotesk in table data, labels, or long copy.
- **Don't** use clamp() for product type or fluid rem scales in the app shell.
- **Don't** nest cards, wrap every group in a card, or use a card where spacing and a divider suffice.
- **Don't** place glows or heavy shadows inside content, behind text, or on resting surfaces.
- **Don't** use border-left/right stripes, glassmorphism for its own sake, or decorative motion that does not convey state.
- **Don't** ship a control without hover, focus, active, disabled, and loading states.
