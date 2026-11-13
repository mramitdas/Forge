# FitWoody Redesign — Screen Details by Role

*Document for AI to reimagine the app design from scratch. No backend code, no design tokens — just the screens, what each one does, and how each of the three roles experiences them.*

## App Context (copyable for AI)

*FitWoody is a mobile ERP app for a fitness gym business. Three kinds of people use it: the owner of the gym software platform, the owner of an individual gym, and the front-desk staff who work at the gym every day. It handles members, check-ins, subscriptions, invoices, expenses and notifications.*

*All three roles use **the same set of screens** — exactly like the desktop web version. The difference between roles is never a different screen; it is what a person can *do* on a screen. A screen can be hidden from the navigation for someone who lacks the capability, and if they reach it another way they see a plain "Restricted area" message instead of the content. Buttons and actions appear or disappear based on the same capabilities.*

*It is built with Expo React Native, has a dark/light theme the user can switch, and uses a floating glass navigation bar with two tabs (Home and Members), a live "pulse" score, and a round `+` button that opens a quick-actions sheet. All visual design is to be reimagined from scratch; only the behaviour below is fixed.*

---

## The Three Roles

| Role | Who they are | What they need the app for | Screens |
|---|---|---|---|
| **Platform Owner** | Owns the software that gyms buy | Oversight of every gym on the platform | **All screens** — same as everyone else |
| **Gym Owner** | Owns one gym | Running their gym's money, people and plans | **All screens** |
| **Employee (front desk)** | Works the desk at a gym | Daily tasks: check people in, look up members, take payments | **All screens** |

### How access actually works

Each role is granted a set of capability codes, in pairs — a `view` code (can look) and a `manage` code (can change). For example: `members.view` / `members.manage`, `billing.view` / `billing.manage`, `expenses.view` / `expenses.manage`, `attendance.view` / `attendance.manage`, `membership.view` / `membership.manage`, `notifications.view`, `identity.view` / `identity.manage`, `tenancy.view` / `tenancy.manage`.

Three consequences the design must honour:

1. **Same screen, different buttons.** A Gym Owner sees "Pay" on an invoice (`billing.manage`); an Employee without it sees the same invoice screen with no Pay button at all. The screen layout does not change — only the actions do.
2. **Hidden from navigation, blocked on arrival.** A screen the person has no capability for does not appear in the navigation. If they reach it by typing the path, they get a calm **"Restricted area"** message in place of the content — not a crash, not a silent empty page.
3. **Empty data, not broken data.** If a person lacks the capability to *view* something, the app does not fetch it and shows an empty or hidden section — never a spinner that never resolves.

The capability codes behind each action are noted next to it below, so the design can be checked against them.

---

## The Screens

*Every screen in this list is available to all three roles. What differs is which actions appear on it.*

### 1. LoginScreen

- **Sign in** — type an email and password to get into the gym.
- **Stay signed in** — the app remembers you so you don't log in every visit.
- **Tell me what's wrong** — if the email or password is wrong, say so plainly instead of failing silently.
- **Handle the forced reset** — if an administrator has required a password change, the app sends the person straight to the password screen before letting them in.

### 2. HomeScreen — "Summary"
*Purpose: answer "how is my gym doing right now?" in one glance, without tapping anything.*

- **See how many members you have** — a big number card; tap it to open the member list. Needs `members.view`.
- **See how much money is owed to you** — total of unpaid invoices; tap it to open billing. Needs `billing.view`.
- **See how much is overdue** — money that was due and never paid, shown in the alarm colour when it isn't zero. Needs `billing.view`.
- **See who just came in** — the most recent check-ins with the member's name, the result (allowed / denied / duplicate) and the time. Needs `attendance.view`.
- **Refresh** — pull down to re-fetch the numbers.
- **See which gym and which day** — a small line at the top identifying the gym and today's date. For a platform owner looking across gyms, this line is the only thing telling them whose data they're in.
- **When a card isn't yours to see** — the whole card is simply absent (no money cards for someone without `billing.view`), rather than showing a locked or zeroed card.
- **Nothing to show?** — friendly empty states ("No check-ins yet") instead of blank space; skeleton placeholders while loading; a retry button if loading fails.

### 3. MembersScreen
*Purpose: find any member in seconds.*

- **Search** — type a name, phone or email to narrow the list as you type. Needs `members.view`.
- **See everyone at once** — scrollable list of members. Needs `members.view`.
- **Spot the status instantly** — each member shows a status chip (Active, Pending, Expired…). Status is never conveyed by colour alone — the chip carries an icon and a word.
- **Open a member** — tap a row to see their full profile.
- **Recognise people** — a circular initial badge at the start of each row.
- **Empty and loading** — a clear "No Members" message, skeleton rows while loading, and a retry on failure.

### 4. MemberDetailScreen
*Purpose: everything you need to know about one person, on one screen.*

- **Contact details** — phone and email.
- **Membership status** — their current status chip.
- **Which plan they're on** — plan name, price, start and end dates; tap to jump to the full subscription. Needs `membership.view`.
- **Joined date** — when they first became a member.
- **Recent activity** — their latest check-ins and invoices so you can answer "have they been coming in? did they pay?"
- **Act on the member** — edit their details or change their status; these controls appear only with `members.manage`.

### 5. CheckInScreen
*Purpose: get a member through the door in one tap.*

- **Find the member fast** — search box plus the member list right there. Needs `members.view`.
- **Check someone in** — tap a member; the app records the check-in against the branch you're signed in at. Needs `attendance.manage`.
- **See the result immediately** — a banner tells you whether they were allowed in, turned away, or already checked in (duplicate), or why they were denied (for example an expired plan).
- **See the branch** — which branch you're checking people in at, shown at the top.
- **See the last few check-ins** — a short recent list so you can spot a double entry. Needs `attendance.view`.
- **Big obvious button** — a full-width "Check In" action pinned at the bottom, disabled until a member is selected.
- **Read-only visitor** — someone with `attendance.view` but not `attendance.manage` sees the recent list but no member picker and no check-in button.

### 6. QuickActionsSheet
*Purpose: jump to the things you do most, from anywhere.*

- **Check In** — straight to check-in. Needs `attendance.manage`.
- **Add Expense** — straight to the expense form. Needs `expenses.manage`.
- **Subscriptions** — straight to the plan list. Needs `membership.view`.
- **Billing** — straight to the invoice list. Needs `billing.view`.
- **Opens from the floating `+` button** in the navigation bar; drag down or tap outside to dismiss.
- **Only what you can do** — an action the person lacks the capability for isn't listed at all; the sheet never shows a row that leads to a "Restricted area".

### 7. BillingScreen
*Purpose: chase money — who owes you, and who's overdue.*

- **See all invoices** — scrollable list. Needs `billing.view`.
- **Narrow it down** — filter by All, Pending, Overdue or Paid.
- **See what each invoice is for** — invoice number and the due date.
- **See the amount and status** — the money owed on the right, status chip next to it.
- **Take a cash payment** — swipe an unpaid invoice to reveal a "Pay" action that records a cash payment. Needs `billing.manage`.
- **Open an invoice** — tap a row for full detail.
- **Empty and loading** — "No Invoices", skeleton rows, and a retry on failure.

### 8. InvoiceDetailScreen
*Purpose: the full picture of one invoice, and the button to close it.*

- **Identify it** — invoice number, which member it belongs to, and its status chip.
- **See the dates** — when it was issued and when it's due.
- **See the money** — total, amount paid, and what's still outstanding. Needs `billing.view`.
- **Record the payment** — "Pay Cash" for an unpaid invoice, with a confirmation step before money is marked as received. Needs `billing.manage`.

### 9. ExpensesScreen
*Purpose: track what the gym spends.*

- **See spending month by month** — expenses grouped under month headings. Needs `expenses.view`.
- **See what it was for** — category (operations, maintenance, utilities, supplies, other), any description, and the date.
- **See how much** — the amount on the right of each row.
- **Add an expense** — the "Add" button in the header opens the expense form. Needs `expenses.manage`.
- **Empty and loading** — "No Expenses", skeleton rows, and a retry on failure.

### 10. ExpenseAddScreen
*Purpose: record a spending in under a minute.*

- **Pick a category** — operations, maintenance, utilities, supplies or other; the selected one is ticked.
- **Type the amount** — numeric keypad.
- **Pick how it was paid** — cash, card, UPI, netbanking, credit or wallet.
- **Add a note** — optional description so you remember what it was for.
- **Save** — the Save button is only enabled once the amount is a positive number; if it's tapped early it stays greyed out rather than failing.

### 11. SubscriptionsScreen
*Purpose: see who is on which plan, and get pending ones running.*

- **See all subscriptions** — scrollable list showing the member, the plan, and the start–end dates. Needs `membership.view`.
- **Filter by state** — All, Active, Pending, Expired or Cancelled.
- **Activate a pending plan** — for a subscription still waiting, an "Activate" action appears beside the status chip. Needs `membership.manage`.
- **Open one** — tap a row for full detail.
- **Empty and loading** — "No Subscriptions", skeleton rows, and a retry on failure.

### 12. SubscriptionDetailScreen
*Purpose: the full record of one member's plan.*

- **Who it's for** — member name. Needs `membership.view`.
- **Which plan and price** — plan name and what it costs.
- **Where it stands** — status chip plus whether it auto-renews.
- **When it runs** — start date and end date ("Open" if it doesn't end).
- **Which branch** — where the plan is held.
- **Activate it** — for a pending subscription, an Activate row that confirms first. Needs `membership.manage`.

### 13. NotificationsScreen
*Purpose: catch up on anything that needs your attention.*

- **See what's new** — list of notifications (new member, failed payment, subscription ending…). Needs `notifications.view`.
- **Spot unread ones** — a small dot next to unread items.
- **Mark one read** — tap an unread item to clear it.
- **Mark everything read** — a "Mark All Read" button in the header when anything is unread.
- **Stays current** — the list refreshes on its own every 30 seconds, and can be pulled down to refresh.

### 14. SettingsScreen
*Purpose: your account, your security, and your way out.*

- **See who you are** — name, email, gym, role and branch.
- **Change your password** — opens the password screen. Always available for your own password.
- **Change how the app looks** — opens the appearance screen.
- **Log out** — with a confirmation step, because it signs out the device.

### 15. SettingsPasswordScreen
*Purpose: change your own password safely.*

- **Prove it's you** — current password field.
- **Choose a new one** — new password field (minimum 8 characters).
- **Save** — the Update button is disabled until the current password is filled and the new one is long enough; it then updates and signs you back in with the new credentials.
- **Understand failures** — a clear message if the current password is wrong or the new one doesn't meet the rules.

### 16. SettingsAppearanceScreen
*Purpose: choose light or dark in one tap.*

- **Three choices** — System (follows your phone), Light, or Dark. The chosen one is ticked.
- **Instant** — the whole app changes colour immediately; nothing needs reloading.

### 17. TabLayout — the navigation bar
*Purpose: always-visible way to move around.*

- **Two tabs** — Home and Members, with the active one raised in a coloured capsule and the inactive one neutral.
- **Live pulse score** — a number in the bar showing how the gym is doing (green / amber / red); tap it to open the detail behind it.
- **The `+` button** — a dark round button on the right that opens the quick-actions sheet.
- **Header shortcuts** — on Home, a bell (notifications, with an unread dot) and a gear (settings) in the top-right.

### 18. Restricted area — the blocked state
*Not a screen of its own; it is what any screen turns into for someone who lacks the capability.*

- **Calm, not alarming** — a short "Restricted area" message with a way back, replacing the content.
- **Never a dead end** — the person can still reach the navigation, the other tabs, and everything they *are* allowed to see.
- **No leaks** — no partial data from the blocked screen is shown (no skeleton, no stale values).

---

## How Each Role Experiences the Same Screens

*The screens are identical. These are the differences worth designing for.*

### Platform Owner
- Sees every screen with every action available.
- Looks across gyms, so the Home screen's gym-name line and the branch shown on the check-in screen matter more to them than to a single-gym user.
- Platform-level tooling — registering gyms, managing gym owners, changing gym tiers, platform sales and reports, platform settings — is **not part of this mobile app**. It stays in the web admin panel. The mobile app should never pretend those exist.

### Gym Owner
- Sees every screen with every action available.
- This is the fullest experience of the app: money, plans, expenses and staff all in one place.

### Employee (front desk)
- Same screens, fewer actions.
- Capabilities held: `members.view`, `attendance.view`, `attendance.manage`, `billing.view`, `notifications.view`.
- **Home** — the money cards are visible but read-only (`billing.view`, never `billing.manage`), leaving members and recent activity as the focus.
- **Check-in** — the member picker and check-in button are present (this is their main job, `attendance.manage`); the recent-activity list is there too.
- **Billing** — invoices are visible with `billing.view`; the swipe-to-Pay action only appears with `billing.manage`, which the front desk does not hold.
- **Expenses and Subscriptions** — reachable by path, but the navigation and the `+` sheet simply don't offer them, and arriving by path gives "Restricted area".
- **Member detail** — can look at a member; editing controls only with `members.manage`.
- **Settings** — their own account only.

---

## Screen → Role Matrix

*Same screens for everyone. The third column is what actually differs.*

| Screen | All roles | What differs per role |
|---|:---:|---|
| LoginScreen | ✅ | — |
| HomeScreen (Summary) | ✅ | Money cards hidden without `billing.view`; check-ins hidden without `attendance.view` |
| MembersScreen | ✅ | — |
| MemberDetailScreen | ✅ | Edit/status controls need `members.manage` |
| CheckInScreen | ✅ | Check-in action needs `attendance.manage`; recent list needs `attendance.view` |
| QuickActionsSheet | ✅ | Only actions the person can perform are listed |
| BillingScreen | ✅ | Swipe-to-Pay needs `billing.manage` |
| InvoiceDetailScreen | ✅ | "Pay Cash" needs `billing.manage` |
| ExpensesScreen | ✅ | "Add" needs `expenses.manage` |
| ExpenseAddScreen | ✅ | — (reached only with `expenses.manage`) |
| SubscriptionsScreen | ✅ | "Activate" needs `membership.manage` |
| SubscriptionDetailScreen | ✅ | "Activate" needs `membership.manage` |
| NotificationsScreen | ✅ | — |
| SettingsScreen | ✅ | — |
| SettingsPasswordScreen | ✅ | — |
| SettingsAppearanceScreen | ✅ | — |
| TabLayout (navigation bar) | ✅ | Bell and unread dot need `notifications.view` |
| Restricted area | ✅ (as a state) | Shown when the person lacks the capability |

---
*Every screen above can be reimagined independently. What must not change is: the same screens exist for every role, and a role's difference is only which actions appear and what a blocked screen looks like.*
