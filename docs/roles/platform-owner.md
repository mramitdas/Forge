# FitWoody — Platform Owner

*Requirements document for AI to design this role's experience from scratch. Functionality only — no design tokens, no code.*

---

## Who they are

The **Platform Owner** is the person who owns FitWoody itself — the software that gyms buy. They are not a gym; they run the business that *sells* to gyms. Their job is to:

- **Bring new gyms onto the platform** — sign them up, give them their owner account, and put them on the right plan.
- **Keep gyms running** — suspend a gym that stops paying, fix a gym's details, restore a gym that was deleted by mistake.
- **Look after gym owners** — correct their details, reset their password if they are locked out, turn their access off, or step into their account to fix something for them.
- **Decide what plans exist** — the catalogue of pricing tiers a gym can be on (how many branches, how many members, what features).
- **Watch the money** — how much the platform earns from subscriptions, and which plans are selling.

They have **no gym of their own**. Every number they see is across *all* gyms.

---

## Where they work

Two places, and the split matters for the design:

| Where | What it's for |
|---|---|
| **Platform console** (web) | Their real workspace — registering gyms, managing owners, setting plans, watching revenue |
| **FitWoody mobile app** | The same app every gym user has, for looking into a specific gym on the move |

---

## Screens — Platform Console (web)

### 1. Platform Overview
*Purpose: the "how is the business doing?" screen — everything at a glance the moment they sign in.*

- **Greet them and orient them** — the date, "Good morning", and a count of how many gyms and gym owners exist on the platform.
- **Four headline numbers**:
  - *Total gyms* — how many gyms are on the platform, with how many are still on a free trial.
  - *Active gyms* — how many are running normally, with how many are suspended.
  - *Gym owners* — how many owner accounts exist across all gyms.
  - *Monthly revenue* — what the platform earns per month, with how many subscriptions are active.
- **See every gym's plan at once** — a table with a row per gym showing: the gym's name, which plan it's on (changeable straight from the row), the gym's status, how many members it has against its plan limit, and how many active subscriptions it has.
- **See the gyms themselves** — a short preview list of the first few gyms with each one's name, its slug, its plan and whether cross-branch access is on, each with a "Manage" link.
- **Jump onward** — a "View all gyms" link to the full registry.

*Needs: `platform.sales.view` to load the numbers, `platform.subscriptions.view` to load the table, `platform.subscriptions.manage` to change a gym's plan from the row.*

### 2. Gyms — the registry
*Purpose: every gym on the platform, and everything they can do to it.*

- **See the whole registry** — a table with one row per gym showing: name (with its currency and timezone), slug, status, which plan it's on, and whether cross-branch member access is switched on.
- **See status at a glance** — each gym is Active, on Trial, or Suspended, shown as a coloured pill.
- **Spot deleted gyms** — a "Show deleted" switch brings back soft-deleted gyms, greyed out, with only a Restore button.
- **Provision a new gym** — a form for the gym's name, its slug, which plan it starts on, and the owner account (owner's name, email and an initial password of at least 8 characters). Creating the gym creates its owner in one step.
- **Edit a gym** — change its name, timezone, currency, or plan.
- **Suspend or re-enable** — flip a gym between Active and Suspended.
- **Delete a gym** — a destructive action with a clear warning that it soft-deletes the gym and everyone inside it, and cannot be undone from the interface.
- **Restore a deleted gym** — put it back; if its plan is missing or disabled, the flow asks for a plan to be attached first.
- **Toggle cross-branch access** — a switch per gym row letting members be shared between that gym's branches.

*Needs: `platform.gyms.view` to list, `platform.gyms.create` to provision, `platform.gyms.update` to edit / suspend / delete / restore / toggle.*

### 3. Gym owners
*Purpose: the people who run the gyms — fix their accounts, and step into them when needed.*

- **See every owner** — a table with one row per owner showing: their name and email, which gym they belong to, and the status of their access (Disabled, or the gym's own status).
- **Correct their details** — an edit form for their full name and email, plus an optional password reset (leaving it blank keeps the current password).
- **Turn their access on or off** — a toggle that disables or re-enables the owner account.
- **Log in as them** — a "Login" button that opens a session as that owner so the platform owner can see and fix whatever the owner is seeing.

*Needs: `platform.owners.manage` for every action on this screen.*

### 4. Plans & tiers
*Purpose: the catalogue of what gyms can buy — what each plan costs and what it allows.*

- **See the catalogue** — one card per plan showing: its code, its name, a short description, its monthly price (or "Custom" if there isn't one), how many branches and members it allows, and a checklist of the features included (check-ins, membership plans, invoices and payment capture, staff roles, email notifications, cross-branch access where applicable).
- **See which plans are live** — a switch per card; a switched-off plan is shown dimmed and can't be chosen by new gyms.
- **Create a plan** — a form for its code, name, monthly price, maximum branches, maximum members and a description.
- **Edit a plan** — same fields, except the code is fixed once the plan exists.
- **Delete a plan** — only possible if no gym is currently on it; the confirmation says so.
- **Know what's in use** — a count of how many plans exist and how many are currently available to gyms.

*Needs: `platform.subscriptions.view` to list, `platform.subscriptions.manage` to create, edit, toggle or delete.*

### 5. Revenue
*Purpose: how much money the platform makes from subscriptions, and what's selling.*

- **See the total** — the big number: everything the platform has earned across the subscriptions sold.
- **See the trend** — a bar chart of the last 12 months, one bar per month, taller for a bigger month, with the month and the amount and the number of subscriptions sold on hover/tap.
- **See what's selling** — a table of subscriptions sold: the member, the plan, which gym and branch, the status, when it started, and the price.
- **Page through** — Previous / Next through the sold list rather than an endless scroll.

*Needs: `platform.sales.view`.*

---

## Impersonation — "log in as a gym owner"

A platform owner can open a session as any gym owner. This is a distinct flow with its own rules, and the design must make it unmistakable.

- **Start it** — the "Login" button on the gym owner's row.
- **Refuse it when it makes no sense** — an owner whose account is disabled, or whose gym is suspended or deleted, cannot be impersonated; the person is told why.
- **Always show whose session it is** — a persistent amber banner across the top of the app saying "Viewing the gym workspace as {their email}", with a button to **Exit to platform**.
- **Never lose the way back** — the banner stays visible on every screen while impersonating; exiting restores the platform owner's own session and returns them to the platform console.
- **The app changes underneath** — while impersonating, the platform links disappear and the gym workspace navigation appears, because they are now looking at a gym.
- **Log out cleanly** — leaving the app while impersonating ends the impersonated session cleanly and never leaves the platform owner stranded in someone else's account.

---

## The mobile app — Platform Owner

The platform owner uses **the same app as everyone else** — the same screens, the same navigation bar. Their app is for looking into a specific gym on the move, not for platform administration.

What is different for them:

- **They don't have a gym.** The app normally shows the signed-in person's gym on the Home screen and their branch on the check-in screen. For a platform owner there is no "their gym", so the app must let them pick which gym they're looking at, and must keep that choice visible at all times.
- **"Which gym am I in?" must never be ambiguous.** The gym name is the anchor of every screen they use. It belongs in the navigation bar area, not only in a small line on the Home screen.
- **They see everything, so nothing is hidden.** Every action on every screen is available to them.
- **Platform administration does not belong here.** Registering gyms, managing owners, editing plans and revenue reporting stay on the web console. The mobile app must not pretend these exist — no dead buttons, no "coming soon" placeholders.

---

## Capability codes

The platform owner is granted these codes. Each one gates a specific action, and the design should hide an action entirely when its code isn't held — never show it greyed out.

| Code | What it allows |
|---|---|
| `platform.gyms.view` | See the gym registry |
| `platform.gyms.create` | Provision a new gym (and its owner) |
| `platform.gyms.update` | Edit, suspend, delete, restore a gym; toggle cross-branch access |
| `platform.owners.manage` | See, edit, disable gym owners; log in as an owner |
| `platform.subscriptions.view` | See plans/tiers and each gym's subscription |
| `platform.subscriptions.manage` | Create, edit, toggle, delete a plan; change a gym's plan |
| `platform.sales.view` | See platform revenue and the headline business numbers |
| `platform.reports.view` | *Reserved — no functionality exists behind this yet* |
| `platform.settings.manage` | *Reserved — no functionality exists behind this yet* |

---

## Rules the design must honour

1. **Same app, every role.** The platform owner gets no extra screens in the mobile app and no missing ones.
2. **Capability decides the button, never the screen.** A missing code removes an action; the screen around it stays.
3. **Blocked, not broken.** Reaching something you can't do shows a calm "Restricted area" message — never an error, a blank page, or a spinner that never ends.
4. **Destructive actions are unmistakable.** Deleting a gym, deleting a plan and changing a gym's plan all need a confirmation that says exactly what will happen and what can't be undone.
5. **Impersonation is always visible.** The amber banner is non-negotiable — it is the only thing standing between a platform owner and acting as a customer.
6. **Plan and tier management lives in two places today** — the plan *catalogue* on the Plans screen, and plan *assignment* on the Overview table. The design should make that split obvious, or merge the two.

---

## Known gaps in the current product (fix these while designing)

1. **The platform console doesn't hide anything.** Every platform link and every platform button is visible to every platform user, and a user holding only part of the nine codes finds out by getting a server error when they click. The design should gate each action on its code, the same way the gym workspace already does.
2. **Two capability codes have nothing behind them** — `platform.reports.view` and `platform.settings.manage`. Either give them a screen or stop granting them.
3. **No search, sorting or paging** anywhere on the five platform screens except the revenue sold-list. With more gyms than a screenful, this needs designing.
4. **An audit trail of plan changes exists but is never shown** — who moved a gym from which plan to which plan, and when. It's the kind of thing a platform owner needs, and it's already being recorded.
5. **The plan's `limits` field and the owner list's tier and joined date are returned but never displayed.**
6. **Revenue has no breakdown by gym or by plan** — only one platform-wide monthly line and a flat list of what sold.

---
*This document describes what the Platform Owner can do and what they see. The visual design of every screen is free to be reimagined.*
