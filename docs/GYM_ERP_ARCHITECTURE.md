# Enterprise Multi-Tenant Gym ERP SaaS — Research & Architecture Blueprint

**Document Version:** 1.0 (Draft for review)
**Status:** Research & Architecture Blueprint — no implementation code
**Audience:** Engineering, Product, Design, Security, DevOps, QA, and Business leadership
**Target market:** Commercial multi-tenant SaaS competing with Mindbody, GymMaster, Zen Planner, Glofox, and Virtuagym
**Prepared by:** Cross-functional architecture team (Principal Architect, Backend/Frontend/Database Architect, Security, DevOps, QA, Performance, Product, UX, Business)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision](#2-product-vision)
3. [Business Analysis](#3-business-analysis)
4. [Competitor Research](#4-competitor-research)
5. [Feature Gap Analysis](#5-feature-gap-analysis)
6. [Recommended Features](#6-recommended-features)
7. [Functional Requirements](#7-functional-requirements)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [User Roles & Permissions](#9-user-roles--permissions)
10. [Module Breakdown](#10-module-breakdown)
11. [Business Workflows](#11-business-workflows)
12. [Database Design Recommendations](#12-database-design-recommendations)
13. [API Architecture](#13-api-architecture)
14. [Frontend Architecture](#14-frontend-architecture)
15. [Backend Architecture](#15-backend-architecture)
16. [UI/UX Recommendations](#16-uiux-recommendations)
17. [Security Recommendations](#17-security-recommendations)
18. [Infrastructure Recommendations](#18-infrastructure-recommendations)
19. [Deployment Strategy](#19-deployment-strategy)
20. [Testing Strategy](#20-testing-strategy)
21. [Scalability Strategy](#21-scalability-strategy)
22. [Risks and Mitigations](#22-risks-and-mitigations)
23. [Future Roadmap](#23-future-roadmap)
24. [Assumptions](#24-assumptions)
25. [Open Questions](#25-open-questions)
26. [Final Recommendations](#26-final-recommendations)

---

## 1. Executive Summary

This document is the research and architecture blueprint for a commercial-grade, enterprise multi-tenant Gym ERP SaaS platform. It is **not** an MVP or a CRUD prototype; it is the design foundation for a product intended to run thousands of gyms, tens of thousands of branches, millions of members, and millions of transactional records (attendance, payments) while remaining operationally efficient, secure, and extensible for the next decade.

The guiding decisions in this blueprint are:

1. **Modular Monolith, not microservices.** We deliberately reject a microservice-first approach. For a team building a product with hundreds of tightly-coupled business workflows (membership → billing → attendance → inventory), a modular monolith with strict module boundaries and event-driven communication *within* the process is the industry-proven path (Stripe, Shopify, GitHub all converged on this). It avoids distributed-systems tax (network calls, eventual consistency, deployment matrix, debugging) while keeping the option to extract hot modules into services later.
2. **Shared PostgreSQL schema with hard tenant isolation.** One database, one schema-set, with every row carrying a `tenant_id`. Isolation is enforced by a *defaulted* column + `Row Level Security (RLS)` policy as a defense-in-depth guarantee, not by application query discipline alone. This scales further than one-database-per-tenant (which collapses under thousands of tenants) while offering auditability, cross-tenant platform analytics, and affordable operations.
3. **Dynamic RBAC as the permission spine.** Employee roles are data, not code. A permission catalog + role templates + per-role permissions + per-role branch scoping covers Trainer, Receptionist, Nutritionist, or any future role without redeployment. ABAC extension points are designed in from day one.
4. **Web-first, premium desktop experience.** The front end is a Next.js app engineered to feel like Linear/Notion/Stripe/raycast: keyboard-driven, command-palette centered, fast data tables, and a cohesive shadcn/ui design system. No legacy admin-panel aesthetics.
5. **Event-driven workflows for money and retention.** Billing, notifications, attendance, and churn-risk are orchestrated through an internal event bus and background workers (Redis Streams + task queue). Payments and attendance are the two highest-volume domains and get dedicated throughput engineering.
6. **Subscription-ready platform economics.** The SaaS bills gyms, not members. Multi-tier subscription + usage-based add-ons architecture is designed in so the platform itself can monetize (and later add payment-processing revenue share, hardware pass-through, and marketplace revenue).

The remainder of this document details every decision, the reasoning behind it, the trade-offs considered, and alternatives rejected.

---

## 2. Product Vision

### 2.1 Vision Statement

> A single, intelligent operating system for fitness businesses — from a single-studio owner to a national franchise — that runs membership, operations, payments, people, and growth analytics with the polish of modern developer tools and the reliability of enterprise banking software.

### 2.2 Problem Statement

Gym operators today face a fragmented toolchain: one tool for bookings, another for billing, a spreadsheet for payroll, a paper log for attendance, and disconnected marketing. Incumbent all-in-one platforms are either expensive and enterprise-heavy (Mindbody), built for specific niches (Glofox/class-based studios, Zen Planner), or dated in UX (much of the mid-tier). The market's underserved segment is:

- **Mid-market and multi-branch operators** in growth markets (India, Southeast Asia, LATAM) who need *affordable, modern, mobile-first* software with **localized payment rails** (Razorpay, UPI, wallets) that global incumbents do poorly.
- **Gym owners who want ownership of their data and workflows**, not rigid vendor templates.

### 2.3 Product Pillars

| Pillar | Meaning |
|---|---|
| **One source of truth** | Member, financial, and operational data unified; no spreadsheets. |
| **Operator speed** | Front-desk actions in < 3 seconds; bulk operations; keyboard-first. |
| **Retention engine** | Automated lifecycle messaging, attendance-based risk scoring, churn prediction. |
| **Local-first payments** | Razorpay-native plus a payment-provider abstraction layer for future rails. |
| **Multi-tenant by design** | Hard isolation, per-tenant configuration, white-labeling. |
| **Enterprise-grade reliability** | Audit logs, idempotency, transactional integrity, observability. |

### 2.4 Target Personas

- **Platform Owner (Super Admin):** operates the SaaS; provisions gyms, tiers, platform billing, global compliance, health.
- **Gym Owner / Admin:** owns identity; configures brands, subscribes, sees rollup across branches.
- **Branch Manager / Receptionist:** daily operations — check-in, sales, scheduling, member service.
- **Trainer / Instructor / Nutritionist:** schedule, member engagement, attendance confirmation, session notes.
- **Member / Customer:** web portal + future mobile app — book classes/PT, view billing, check-in, communicate.

### 2.5 Success Metrics (Platform)

- Time-to-provision a new gym: **minutes, not days** (self-serve onboarding).
- Tenant onboarding-to-live: **< 1 day** with guided setup.
- Front-desk average action time: **< 3 seconds**.
- API p95 latency: **< 300 ms** for interactive paths; payment capture idempotent and auditable.
- Platform uptime target: **99.9%**, RPO ≤ 5 min, RTO ≤ 60 min.
- Tenant data isolation verified by **continuous automated tests** (not trust).

---

## 3. Business Analysis

### 3.1 Business Model

**Who pays:** the gym (tenant). **What they pay for:** a tiered subscription + optional add-ons. **How it scales:** platform revenues grow with tenant count, branch count, member count (usage), and transaction volume.

### 3.2 Revenue Streams

| Stream | Description | Priority |
|---|---|---|
| Subscription (tiers) | Starter / Pro / Enterprise based on branches, members, modules | Primary |
| Usage-based add-ons | SMS/WhatsApp credits, extra storage, advanced analytics | Secondary |
| Payment processing share | % of processed volume once a payment gateway partnership matures | Growth |
| Hardware pass-through | RFID/QR readers, kiosks, biometric devices (future) | Growth |
| Marketplace | Integrations and add-on apps (future) | Future |

### 3.3 Tiers (high-level; pricing is commercial input, not architecture)

- **Starter:** 1 branch, up to 250 members, core modules (membership, attendance, billing, POS).
- **Pro:** multi-branch, CRM, classes/PT, inventory, payroll-adjacent tooling, API access.
- **Enterprise:** unlimited branches, SSO, custom roles/ABAC, SLA, dedicated support, on-prem/private-cloud option, data residency.

**Architecture implication:** tier limits must be **enforced in the backend** (a licensing/entitlement check), never only in the UI. Entitlements are cached per-tenant.

### 3.4 Market Positioning

| Dimension | Our position |
|---|---|
| Price | Mid-market competitive vs. Mindbody's premium pricing |
| UX | Modern, keyboard-first, premium (Linear/Notion-grade) vs. dated incumbent UIs |
| Payments | Razorpay-native, strong in India/SEA vs. incumbents' Western rails |
| Multi-branch | First-class branch-level operations + gym-level rollup |
| Extensibility | Dynamic roles, webhooks, public API, white-label |
| Deployment | Cloud SaaS with enterprise private-cloud option |

### 3.5 Economics of Scale (Operational)

- Self-serve tenant onboarding reduces sales-assisted cost.
- One shared codebase + one DB pool keeps marginal infrastructure cost per tenant low.
- Usage-based pricing aligns revenue with infrastructure cost (e.g., notifications, storage).

### 3.6 Business Risks (see also §22)

- Payment failure rates (recurring billing) — mitigated with dunning workflows, provider retries, and backup payment methods.
- Compliance overhead per market (GST, GDPR/DPDP, PCI SAQ-A) — mitigate with configurable tax engine and region-agnostic data model.
- Customer churn — mitigate with onboarding success managers and retention analytics.

---

## 4. Competitor Research

### 4.1 Landscape Overview

| Product | Focus | Strengths | Known Gaps (opportunities) |
|---|---|---|---|
| **Mindbody** | Boutique studios, spas, class-based | Deep class scheduling, member app, strong brand, big marketplace | Expensive; complex; dated admin UX; weak in India/SEA payment rails; enterprise-heavy |
| **GymMaster** | Gym/health club, 24/7 access control | Built-in door access (Bluetooth/RFID), integrated billing, POS+stock, member app | Legacy UI; sales/pricing opaque; limited modern analytics; onboarding heavy |
| **Zen Planner** | Martial arts, class-based | Scheduling, billing, retention tools | Aging platform; weak inventory/retail; limited extensibility |
| **Glofox** | Class-led studios, gyms, franchises | Polished booking + waitlists, branded member app, automated comms, multi-location | Class-centric (weaker on gym floor/attendance hardware); global payments not India-first; premium pricing |
| **Virtuagym** | Gyms, coaches, trainers | Coaching tools, nutrition, white-label apps, multi-language | Module complexity; UX inconsistency; per-module pricing confusion |
| **Others** | Fitli, PushPress, Wodify, ClubRight, Jonas, PerfectGym | Niche strengths | Niche-specific; many legacy tech stacks |

### 4.2 Common Feature Set Across Incumbents (baseline parity required)

- Member profiles, membership plans, automated recurring billing, failed-payment dunning
- Class/PT scheduling, online booking, waitlists, calendar
- Check-in / access control (RFID, QR, biometric, kiosk)
- POS and basic inventory
- Member app + web portal
- Email/SMS automation and segmentation
- Basic reports (revenue, attendance, retention)
- Multi-location support

### 4.3 Industry Best Practices Observed

1. **Retention is the product.** Every leader invests in automated member journeys, win-back campaigns, attendance tracking, and engagement scoring. Retention of a member is worth 5–7x acquisition cost in fitness.
2. **Payments are table stakes and reliability is the moat.** Billing automation, smart retries, and transparent invoicing directly reduce churn; broken billing is the #1 reason gyms churn software.
3. **Check-in hardware integration** (access control) is a stickier feature than almost anything else — once a gym installs readers and key fobs, switching costs soar. This validates our "attendance extensibility" requirement (QR/RFID/biometric adapters).
4. **Staff need mobile.** Reception and floor staff are rarely at a desk; a responsive/mobile staff experience is non-negotiable.
5. **Franchise/multi-location models** (royalties, centralized vs decentralized control) are an enterprise growth path; the data model must allow gym → branch hierarchy and per-branch permission scoping from day one.

### 4.4 Lessons from Incumbent Mistakes

- **Monolithic rigidity:** custom roles and custom fields are afterthoughts in many incumbents. We make dynamic roles + tenant-defined custom fields first-class.
- **Data lock-in:** no export or no API. We build open export (CSV/JSON), a public REST API, and webhooks from day one.
- **Poor multi-device UX:** admin only on desktop, member only on app. We design responsive-first admin and a PWA/portal member experience.
- **Country-localized payment failure:** hardcoding one gateway breaks in new markets. Payment-provider abstraction + Razorpay first.
- **Silent data loss on deletes:** hard deletes destroy audit trails. Soft-delete + audit everywhere.
- **Feature bloat without depth:** shipping 40 shallow features beats shipping 10 deep ones. Depth (e.g., payroll edge cases) is prioritized over breadth.

---

## 5. Feature Gap Analysis

### 5.1 Gaps Across Competitors (opportunities to win)

| Capability | Incumbent coverage | Gap / opportunity |
|---|---|---|
| Dynamic custom employee roles | Partial/fixed | **Strong gap:** fully data-driven roles + branch scoping |
| Custom fields on members/products/leads | Partial | First-class tenant-defined schema extensions |
| Global command-palette search | Rare | Keyboard-first productivity (differentiator) |
| Attendance hardware abstraction (QR/RFID/biometric) | Proprietary per-vendor | Open adapter interface; BYO-reader |
| Churn-risk scoring / retention AI | Emerging | Predictive retention + automated win-back |
| India/SEA payment rails (UPI, Razorpay, wallets) | Poor | **Major gap:** localized payments + GST-ready invoicing |
| Unified supplier/purchase/payables + inventory costing | Weak (POS-only) | Full retail chain including purchase orders, stock transfers between branches, valuations (FIFO/AVG) |
| Payroll + leave + holiday calendar integrated | Rare | HR suite inside the ERP |
| Audit logs + activity timelines at this depth | Limited | Enterprise compliance-grade audit trail |
| Public API + webhooks | Paid/premium only | Free API on Pro+, webhooks standard |
| Offline/graceful degradation at front desk | Weak | Client-side caching + offline queue for check-in/sales |
| White-label portals per gym brand | Enterprise-only | Self-serve white-label theming |

### 5.2 The "Missing" Features Enterprises Expect (from analyst research and RFPs)

- Configurable **tax engine** (multi-jurisdiction GST/VAT/sales tax, tax-inclusive pricing).
- **Multi-currency** readiness (even if launched single-currency, schema must not preclude it).
- **Contract lifecycle** for members (term agreements, auto-renewal opt-outs, freeze/pause).
- **Credit packs / prepaid balances / store credit** (high churn-reduction usage).
- **Booking rules** (advance windows, late-cancel penalties, no-show fees, waitlist auto-promotion).
- **POS with split payments, holds, refunds, partial refunds, cash management (opening/closing counts).**
- **Reconciliations** (payment gateway settlements vs. invoices).
- **Branch-level P&L** and consolidated reports; **revenue recognition** (deferred revenue for annual memberships).
- **Data export / GDPR-DPDP rights** (portability, erasure workflows).
- **Staff scheduling and attendance/payroll tie-in** (already in scope).
- **Kiosk mode** for self check-in.
- **Waitlist, referrals, gift cards** (retention/sales multipliers).

### 5.3 What We Deliberately Defer (avoid scope creep at v1)

- Member-facing native mobile app (PWA portal first; app later).
- Direct hardware provisioning/fulfillment (reader hardware marketplace later).
- Own payment gateway (integrate, don't underwrite, initially).
- BI warehouse/AI forecasting dashboards (analytics v1 from transactional data; warehouse in phase 2).

---

## 6. Recommended Features

Priority legend: **P0** = v1 launch must-have · **P1** = v1.x shortly after · **P2** = later phase.

### 6.1 Platform & Tenancy
- **P0** Self-serve tenant provisioning, sandbox/trial mode, subscription tiers, entitlements enforcement.
- **P0** Gym → Branch hierarchy; branch-level config; gym-level rollup.
- **P1** White-label theming per gym; platform analytics (cross-tenant, anonymized/aggregated).
- **P2** Platform billing (invoicing gyms), partner/reseller model.

### 6.2 Identity, Roles & Permissions
- **P0** AuthN (email/password, OTP), JWT access + refresh tokens, session management.
- **P0** Dynamic roles: role templates, custom roles, per-role permission set, branch scope (all/selected), feature access flags.
- **P1** SSO (SAML/OIDC) for Enterprise; MFA (TOTP/WebAuthn).
- **P2** ABAC policies (attribute-based rules engine), SCIM provisioning.

### 6.3 CRM & Growth
- **P0** Lead pipeline (sources, stages, owners), lead conversion to member, tasks/activities, communication log.
- **P0** Member lifecycle states (lead → prospect → active → frozen → lapsed → cancelled).
- **P1** Campaigns, segments, automations (email/SMS/WhatsApp/in-app), referral programs, win-back flows.
- **P1** Churn-risk scoring (attendance + payment + engagement signals).

### 6.4 Membership
- **P0** Membership plans (recurring/term/credit-pack), pricing, taxes, add-ons (guest passes).
- **P0** Renewals, freeze/pause, cancellation with notice rules, upgrade/downgrade proration.
- **P0** Discounts & coupons (fixed/percent, stackable rules, one-time/auto-applied).
- **P1** Contract lifecycle, installment plans (EMI-like), prepaid balances/credits.

### 6.5 Billing & Payments (Razorpay-first)
- **P0** Invoicing (draft/sent/paid/overdue/void), credit notes, receipts, GST-compliant line items.
- **P0** Recurring subscription billing with gateway subscription/tokenization.
- **P0** Failed-payment dunning (retry ladder, member notification, grace, suspension, auto-lapse).
- **P0** Payment methods: cards (tokenized), UPI, netbanking, wallets; store credit; offline/cash entry.
- **P0** Refunds/partial refunds; reconciliation ledger (payments ↔ invoices ↔ settlements).
- **P1** Payment links, kiosk payments, split payments, deferred revenue schedules.
- **P2** Multi-provider gateway router with fallback; global currencies.

### 6.6 Attendance & Access
- **P0** Manual check-in (reception), QR member pass check-in, kiosk.
- **P0** Attendance records with branch/device/source metadata; offline tolerance.
- **P1** Access-control adapter interface (RFID reader, biometric, door controller) — vendor SDKs behind one contract.
- **P1** Entry rules (active membership only), alerts (tailgating, unauthorized), blacklists.
- **P2** Biometric privacy handling (template storage on-device, hash-only cross-reference).

### 6.7 Scheduling & Training
- **P0** Class/event templates, recurring schedules, room/resource capacity, instructor assignment.
- **P0** Member booking, waitlist with auto-promotion, cancel/no-show rules, booking windows.
- **P0** Personal training sessions, session packs, trainer calendar, trainer-membership (roster).
- **P1** Trainer commission/fee rules per session, class utilization analytics, resource conflicts.

### 6.8 Retail & Inventory
- **P0** Product catalog (variants, barcodes, images), stock levels per branch, low-stock alerts.
- **P0** POS sales (cart, discounts, taxes, refunds, cash drawer, receipt).
- **P0** Suppliers, purchase orders, goods receipt, purchase costs, stock adjustments.
- **P1** Stock transfers between branches, cost valuation (FIFO/AVG), landed cost.
- **P2** Reorder automation, supplier payables, multi-warehouse.

### 6.9 Finance & HR
- **P0** Expense categories, expense entries, approvals, attach receipts, branch allocation.
- **P0** Payroll: staff pay rates, attendance-based/contract pay, pay runs, payslips, statutory taxes hooks.
- **P0** Leave types, leave requests/approvals, leave balance accrual, holiday calendar.
- **P1** Staff schedules, shift templates, overtime rules, advance salary, provident-fund/tax config.
- **P2** Fixed-asset register, depreciation, full GL integration.

### 6.10 Engagement & Communication
- **P0** In-app notification center (read/unread, per-user, realtime via websocket).
- **P0** Email/SMS/WhatsApp providers behind a provider abstraction; templates; delivery log.
- **P0** Event-triggered notifications (renewal due, payment failed, class reminder, check-in).
- **P1** Push notifications (web push; later app), automation builder (visual), A/B content.

### 6.11 Documents & Media
- **P0** Documents/attachments per entity (member, invoice, expense, contract, product image).
- **P0** Secure upload (virus scan, MIME validation, size limits), signed URL access, private by default.
- **P1** Member self-serve document upload (waivers), e-signature waivers.

### 6.12 Platform Services
- **P0** Global search across members/plans/products/employees/invoices.
- **P0** Audit logs (who/what/when/where), immutable, queryable.
- **P0** Activity timeline per entity (member 360°, invoice, branch).
- **P0** Settings & configuration (branding, defaults, tax, payment, notifications).
- **P0** Dashboards (owner, branch, staff) + report library + scheduler (email reports).
- **P1** Public API + webhooks; import/export toolkit; SSO; IP allowlists.

---

## 7. Functional Requirements

### 7.1 Notations
- **FR-XX:** functional requirement. Priority, module, and acceptance criteria captured per item.

### 7.2 Core (selected, representative; not exhaustive — full spec follows in a PRD)

**Tenancy & Provisioning**
- FR-01 Provision a new gym with a unique `tenant_id`, default branch, owner account, and starter config in a single atomic transaction; return onboarding token.
- FR-02 Enforce tier entitlements server-side on every mutating API (branch count, member count, module access).
- FR-03 Support sandbox vs. live mode per tenant; sandbox hits Razorpay test environment.

**Identity & Access**
- FR-04 Users authenticate with email+password (Argon2id) or one-time password; refresh-token rotation; device/session revocation.
- FR-05 Roles are CRUD-manageable at runtime; a role has a set of permissions from a fixed catalog and an optional branch scope (all | list).
- FR-06 Every protected endpoint resolves the effective permission for (user, resource-tenant, resource-branch); denied ⇒ 403 with reason.

**CRM**
- FR-07 Lead → member conversion preserves the lead's source, pipeline history, and communication log.
- FR-08 Member states transition via explicit lifecycle events, each recorded to the member timeline.

**Membership & Billing**
- FR-09 Creating a paid membership atomically: creates plan subscription, schedules invoice, registers gateway subscription (if recurring), and sets entitlement (active) — all or nothing.
- FR-10 Recurring billing is idempotent: retried jobs must never double-charge (idempotency keys).
- FR-11 A failed payment triggers the dunning ladder; each step is logged, notified, and reversible.
- FR-12 Upgrades/downgrades compute prorated amounts deterministically (stored proration policy).
- FR-13 Invoices reference a tax regime; GST line items rendered from tax configuration.
- FR-14 Refunds reverse payment and update invoice status; partial refunds supported; all reversible through ledger entries.

**Attendance & Scheduling**
- FR-15 Check-in validates active entitlement (or guest pass), records timestamp/branch/source/device, and is idempotent per (member, session-window) rule.
- FR-16 Offline check-in queue flushes with conflict resolution (duplicates detected and logged).
- FR-17 Booking enforces capacity, booking window, duplicate rule; waitlist promotion is atomic and notifies the member.
- FR-18 No-show/late-cancel policies are configurable and applied by job, with fee/invoice effects.

**Retail**
- FR-19 POS sale transaction is atomic across stock decrement, payment, and invoice creation.
- FR-20 Stock decrements are concurrency-safe (row-locked or conditional UPDATE); overselling prevented by branch stock.
- FR-21 Purchase receipt increases stock with unit cost; inventory valuation recomputed per valuation method.

**HR**
- FR-22 Pay run computes earnings from pay rate + attendance/contract inputs, generates payslips, and posts journal entries; frozen after lock date.
- FR-23 Leave requests enforce balance availability; approved requests decrement balance atomically; holidays suppress balance accrual where configured.

**Platform**
- FR-24 Global search returns results only within the caller's tenant and branch scope; ACL-filtered.
- FR-25 Audit log records all state changes with before/after deltas, actor, IP, request id, and tenant; retention configurable; tamper-evident (chained hashes).
- FR-26 Reports can be scheduled (cron) and delivered via email/Slack; report definitions stored per tenant.

### 7.3 Cross-Cutting Functional Rules
- All writes are within a DB transaction; all business-critical side effects (email, SMS, gateway call) are emitted as events after commit (outbox pattern) — never inline during the transaction.
- Every list endpoint supports pagination (cursor-based for high-volume tables), sorting, and column filtering; totals returned explicitly.
- All money stored in minor units (integer) with a currency column; no floats.
- All timestamps stored UTC ISO-8601; display in branch/tenant timezone.

---

## 8. Non-Functional Requirements

| Category | Requirement | Target |
|---|---|---|
| **Availability** | Uptime | ≥ 99.9% monthly |
| **Durability / DR** | Recovery point objective (RPO) | ≤ 5 minutes |
| | Recovery time objective (RTO) | ≤ 60 minutes |
| **Performance** | API p95 latency (interactive) | ≤ 300 ms |
| | Read-heavy dashboard load (p95) | ≤ 1.5 s rendered |
| | Check-in transaction (p95) | ≤ 800 ms end-to-end (incl. DB) |
| | Background job throughput | ≥ 1000 jobs/s (payment retries, notifications) |
| **Capacity** | Scale target (design) | 10k gyms · 100k branches · 10M members · 100M+ attendance · 100M payments/year |
| | Concurrency | 20k+ concurrent sessions |
| **Scalability** | Horizontal scaling | Stateless API/worker tiers; DB read-replicas; cache tier |
| **Security** | OWASP Top 10 | Remediated; pen-test gates in CI |
| | PCI scope | SAQ-A (tokenized, offsite) — no raw PAN storage |
| **Reliability** | Idempotency | All payment/stock-affecting endpoints |
| | Data integrity | FK + application-level invariants; no silent data loss |
| **Observability** | Logging/Metrics/Traces | 100% of requests traced; structured logs; dashboards |
| **Compliance** | Data protection | GDPR/India DPDP-ready: consent, export, erasure |
| **Accessibility** | WCAG 2.1 AA | Target for all admin screens |
| **Localization** | i18n | i18n architecture from day one; en-IN launch; timezone-aware |
| **Maintainability** | Test coverage (backend) | ≥ 80% on domain logic; ≥ 60% overall |
| | Migration safety | Zero-downtime DB migrations (expand/contract) |
| **Extensibility** | Module boundary rules | Enforced by lint/import rules; documented contracts |

---

## 9. User Roles & Permissions

### 9.1 Model: Data-driven RBAC + ABAC-ready

**Design decision: roles are rows, not code.** A fixed, curated **permission catalog** (the authoritative list of capabilities the codebase understands) is stored as a static, versioned seed. Roles reference permissions from that catalog. This gives the platform the flexibility for gym owners to create `Nutritionist`, `Yoga Instructor`, or `Front Desk Supervisor` without a code change, while keeping the security boundary closed (a role can never grant a permission the catalog does not contain).

### 9.2 Permission Catalog Structure

- **Gym scope:** exactly two capabilities per module — `<module>.view` (read-only) and `<module>.manage` (edit/delete). Manage always includes view, so a manage-only grant also satisfies view checks.
- **Platform scope:** `platform.*` capabilities stay finer-grained (`platform.gyms.create`, `platform.subscriptions.manage`, …) and are unrelated to gym roles.
- **Data scope:** each permission may be paired with a branch scope: `all_branches` | `branch_ids[]`. Default for employees is `branch_ids` of their assigned branches; manager/owner roles default to all.

### 9.3 Entity Model

```
permission_catalog (static seed)
role_template            (per tenant; or platform-seeded defaults)
   └── role_permission   (permission + branch_scope)
user (employee)
   └── user_role         (role + branch_scope override)
   └── user_branch       (assignment for scoping)
member / platform_owner
```

- **Platform-level roles** (`platform.owner`, `platform.support`) exist in the same system but scoped to the platform tenant domain — a separate namespace to prevent cross-tenant grant.
- **Member roles** are distinct: members authenticate as `member` principals with an inherent, narrow capability set (own-profile, own-bookings, own-bills) — never via the employee RBAC graph.

### 9.4 Built-in Role Templates (per tenant, seeded, editable)

| Role | Default permissions (subset) | Branch scope |
|---|---|---|
| Gym Owner / Admin | Everything in tenant; manage roles, branches, config, financials | All |
| Branch Manager | Branch-level ops: members, attendance, sales, inventory, staff schedules, reports | Assigned branch(es) |
| Receptionist | Check-in, member create/update, POS, bookings, basic reports | Assigned branch(es) |
| Trainer | Class/PT schedules, member roster, session notes, attendance confirm | Assigned branch(es) |
| Nutritionist | Member consults, health notes, session packs | Assigned branch(es) |
| Cashier | POS, refunds (with approval threshold) | Assigned branch |
| Sales Executive | Lead pipeline, member acquisition, commissions view | All or assigned |
| Auditor (view-only) | Read-only on financials/reports, no mutations | All |

### 9.5 Enforcement

- **Service layer middleware:** the permission resolver runs in FastAPI dependency injection before handler logic; it computes (permissions, branch_scope) from the token's cached role snapshot.
- **DB row-level guard:** even if a handler is buggy, a `tenant_id` + branch filter is always applied to queries (belt and braces); RLS is the final gate (§12.6).
- **Cache:** permission snapshot per user cached (Redis, short TTL) with invalidation on role/permission change.
- **ABAC readiness:** a `PolicyEvaluator` interface and attribute model (user attrs, resource attrs, context) is defined; initial policies are RBAC-equivalent; richer attribute rules plug in later without changing enforcement points.

### 9.6 Key Decisions & Trade-offs

- **Why catalog-based over free-form?** Free-form permission strings allow typos/silent privilege escalation; a catalog is auditable and testable. Trade-off: adding a new capability requires a release (acceptable — capabilities are code, roles are data).
- **Why branch scope on roles?** Multi-branch tenants need "manager of Branch A who cannot touch Branch B." Trade-off: added complexity to every query — accepted because isolation is a core promise.
- **Why not ABAC from day one?** ABAC policy engines add significant complexity and debugging burden; RBAC covers >95% of fitness-gym access patterns. We design the seam, ship RBAC, and add ABAC when tenant count and policy variety justify it.

---

## 10. Module Breakdown

### 10.1 Modular Monolith Structure

All modules live in one deployable process (FastAPI app), separated by:

- A top-level Python package per module (`app/modules/<name>/`)
- Strict internal interfaces (a module exposes only its public service functions / repository contracts to others)
- **No cross-module DB table access** — modules interact via services, events, or shared kernel types only
- Import-lint enforcement (custom lint rule): a module may only import from `kernel`, its own package, and explicitly declared integration ports

### 10.2 Module Map

```
identity          users, sessions, mfa, sso, roles/permissions, branches assignment
tenancy           gyms, branches, subscription tiers, entitlements, platform users
crm               leads, member lifecycle, segments, campaigns, automation, scoring
members           member profiles, custom fields, documents, timelines, preferences
membership        plans, subscriptions, renewals, freeze, coupons, credit packs
billing           invoices, payments, receipts, refunds, ledger, reconciliation, tax
payments_gateway  razorpay adapter + provider contract, webhooks, tokenization
attendance        check-ins, devices, kiosk, access-control adapters
scheduling        classes, resources, rooms, bookings, waitlists, sessions
pt                personal training packs, trainer assignment, commissions
inventory         products, stock, branches stock, adjustments, transfers
procurement       suppliers, purchase orders, goods receipt, payables
pos               carts, sales, refunds, cash management, receipts
expenses          expense categories/entries/approvals, attachments
payroll           pay rates, pay runs, payslips, deductions, statutory hooks
hr                employees, leave, holiday calendar, staff schedules
notifications     providers (email/sms/whatsapp/push/in-app), templates, outbox
media             uploads, storage adapters, signed URLs, virus scan
search            global search index + queries
reports           report registry, executors, scheduling, export (pdf/csv)
analytics         dashboards, KPI aggregates, retention/churn
audit             audit log, integrity, retention
activity          entity timelines, feed
settings          tenant settings, feature flags, branding
platform          super-admin console, platform billing, health
```

### 10.3 Shared Kernel (not a module)

`kernel/` holds cross-cutting types with **no business logic**: base SQLAlchemy model (tenant_id, audit, soft-delete), money type, ID types, event envelopes, time utilities, pagination, error types, security primitives, and the module-port contract definitions.

### 10.4 Communication Between Modules

- **Synchronous:** direct service calls via public interfaces, only for read composition and simple write flows within the same aggregate boundary (e.g., `members` reading `membership` status).
- **Asynchronous:** all fan-out side effects go through an **event bus** (`kernel.events` → outbox → broker). Examples: `billing.payment.succeeded` → `membership` grants renewal; → `notifications` sends receipt; → `activity` logs; → `analytics` updates counters.

### 10.5 Why Modular Monolith (with justification)

- **Operational simplicity:** one artifact, one deploy pipeline, simple local dev, coherent transactions (no saga choreography for membership creation).
- **Performance:** cross-module calls are in-process (no serialization/network), which is decisive for hot paths (check-in, POS).
- **Migration path:** the module-port discipline means a hot module (e.g., `payments_gateway`, `attendance`, `notifications`) can be extracted to a service by moving its package + adapting its ports to HTTP/queue calls — without redesign.
- **Alternatives rejected:** (a) microservices from day one — premature distributed complexity; (b) a god-monolith with no boundaries — the exact failure mode we're avoiding; (c) DDD-dogmatic aggregates — pragmatic bounded-context discipline with service-layer transactions is sufficient.

### 10.6 Feature Flags & Entitlements

- `entitlements` module gates module availability per tier (e.g., `feature.payroll`).
- Feature flags (platform-controlled, e.g., `enable_churn_scoring`) are per-tenant booleans in `settings` and used by services to choose behavior — a lightweight toggling strategy until a feature-management service is warranted.

---

## 11. Business Workflows

Representative end-to-end flows that the architecture must support atomically and observably. (Sequence descriptions, not code.)

### 11.1 Member Acquisition (Lead → Active Member)
1. Lead created (web form, walk-in, referral) with source + owner.
2. Sales activity logged; demo/free-trial scheduled; task reminders.
3. Lead converts → chooses membership plan + start date + add-ons + coupon.
4. System creates member profile, computes price (coupons, proration), creates invoice (draft→paid or payment scheduled).
5. On payment success (or manual confirmation): subscription active, entitlement granted, welcome notification + onboarding tasks sent, lead moved to member, analytics counters updated.
6. **Guarantees:** single transaction for member+subscription+invoice-draft; outbox events for notifications/analytics; idempotency on payment.

### 11.2 Recurring Billing & Dunning
1. `billing` scheduler enqueues due invoices (daily batch + per-tenant timezone).
2. Payment attempt via gateway subscription/webhook or ad-hoc charge with idempotency key.
3. Success → invoice paid, subscription renewed, receipt events; failure → dunning ladder step 1 (retry in 1d) → step 2 (3d) → step 3 (7d) with member notifications; then grace → suspend access; then auto-lapse membership (configurable).
4. Member can update payment method anytime; a successful payment resets ladder.
5. **Guarantees:** each attempt recorded in payment ledger; job retries safe; webhooks verified (signature); reconciliation job matches gateway settlement vs invoices.

### 11.3 Check-in
1. Member presents QR/card/fob or staff searches member.
2. `attendance` validates entitlement (or guest pass) against branch; records row; returns access decision.
3. Events: `attendance.recorded` → member timeline, analytics counters (peak hours), churn-score signal.
4. Offline mode: kiosk/staff caches entries; flush job reconciles duplicates.
5. **Guarantees:** idempotent by (member, session, source); row-level locking to avoid double-record on race.

### 11.4 Class Booking & Waitlist
1. Instructor/class template publishes schedule (recurring).
2. Member books within booking window; capacity checked atomically (conditional UPDATE).
3. Over-capacity → waitlist position assigned.
4. Cancellation frees slot → auto-promote first waitlist member (atomic), notify both parties; late-cancel/no-show policy may charge fee.
5. Reminder notifications at configured lead time (e.g., 24h, 1h).

### 11.5 POS Sale
1. Cart assembled (products, member credit/membership discount, taxes).
2. Payment captured (multiple methods; cash/card/UPI/credit).
3. Single transaction: invoice created, stock decremented per branch, payment recorded, receipt generated (print/email).
4. Refund path reverses payment + returns stock (configurable restock policy) with reason audit.

### 11.6 Payroll Run
1. Period closes → system collects attendance/hours + leave + fixed pay + adjustments.
2. Preview earnings/deductions → manager approves → run locks → payslips + journal entries + statutory report hooks.
3. Reversal only via correcting run (no silent overwrite).

### 11.7 Member Exit & Re-engagement
1. Cancellation request recorded with reason + effective date; notice-period rules applied.
2. Churn-risk model (before cancellation) flags members with declining attendance/payment issues → automated win-back campaign.
3. Lapsed member retained for win-back; personal data retention policy applied; full erasure on request.

---

## 12. Database Design Recommendations

### 12.1 Strategy Overview

- **One PostgreSQL cluster**, one logical database, one set of tables shared by all tenants, with **hard isolation via `tenant_id` + RLS**.
- **Rationale:** Compared to database-per-tenant (expensive, ops-heavy at 10k tenants), schema-per-tenant (migration chaos), and a separate analytics store from day one (premature), a shared-schema with RLS is the industry-standard SaaS pattern that balances cost, isolation, and cross-tenant insight. We add compensating controls (RLS, per-tenant query budgets, hot-tenant partitioning later) to manage the "noisy neighbor" risk.
- **Two further defensive layers:** (1) every table requires a `tenant_id` with `NOT NULL` and a `DEFAULT current_setting('app.tenant_id')`, so a forgotten tenant filter is *impossible* — the DB enforces it; (2) an application-level query builder always injects tenant predicates as well.

### 12.2 Primary Keys, UUIDs, and IDs

- **Primary keys:** UUIDv7 (time-ordered) for all business tables.
  - **Why:** client-side generation (no round-trip, enables offline/edge write), unguessable (no enumeration attacks in a multi-tenant system), sortable (UUIDv7 embeds ms-timestamp → good index locality, unlike UUIDv4). This matters at 100M+ rows.
  - **Why not BIGSERIAL:** reveals business volume (competitor intelligence), enables ID enumeration, and breaks offline/edge generation.
- **Secondary natural keys** (unique constraints) where they exist: member `email`+tenant (with soft-delete caveat), product `barcode`+branch, plan `slug`+tenant, etc.
- **Bigint surrogate** allowed for a handful of high-churn, non-business tables (e.g., ledger row order, `sessions`) where append-only + ordering is the only need.

### 12.3 Money

- Money stored as **integer minor units** (`amount_minor`, e.g., paise/cents) with an ISO `currency` column. No `NUMERIC(10,2)` floats, no `MONEY` type. All arithmetic in the application layer using integer ops; sums in SQL are exact.
- Tax amounts stored as computed columns at transaction time (never recomputed retroactively).
- Exchange rates (for future multi-currency) stored as history table keyed by `(currency_from, currency_to, valid_from)`.

### 12.4 Dates, Time, and Timezones

- All timestamps `TIMESTAMPTZ`, stored UTC, rendered per tenant/branch timezone.
- Each tenant has a default timezone; branches may override. Billing "day boundaries" and report windows resolve against branch-local time, computed with explicit zone math (never string slicing).

### 12.5 Soft Deletes, Audit Fields, Versioning

- **Soft delete** on all business tables: `deleted_at TIMESTAMPTZ NULL`, plus `deleted_by`.
  - **Why:** auditability, "undo" for operators, referential safety with existing payments/history, and graceful migration to hard-cleanup jobs for GDPR erasure.
  - **Unique indexes** with soft delete must be partial (`WHERE deleted_at IS NULL`) so re-creating a member email works.
- **Audit fields** on every table: `created_at, updated_at, created_by, updated_by` (set via a base model mixin / DB triggers).
- **Optimistic locking / versioning:** mutable, business-critical aggregates (membership, plan, invoice, product stock) carry `version INTEGER` with `UPDATE ... WHERE id=? AND version=?` to surface concurrent-edit conflicts to the UI.
- **Change history:** the `audit` module stores before/after deltas for sensitive fields (price, status, permissions, member identity). Full versioned row history (temporal tables) is **not** used because audit-delta tables cover the need with far less write amplification.

### 12.6 Multi-Tenant Isolation (RLS)

- Set `app.tenant_id` via `SET LOCAL` at the start of each transaction (from authenticated token; platform-scope uses `0`/platform tenant).
- Enable RLS on all tenant tables with policy:
  `USING (tenant_id = current_setting('app.tenant_id')::uuid)`
  `WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid)`
- **Platform tables** (subscription tiers, platform users, audit retention config) are either platform-scoped or use the platform tenant id, never mixed.
- **Testing:** an automated suite asserts that cross-tenant reads return zero rows even when the application predicate is intentionally omitted.
- **Why RLS on top of app-level filtering:** defense-in-depth; a bug in one query builder cannot leak data; also gives the DB a hard invariant for external tools/backups/analytics.

### 12.7 Indexing Strategy

- Every FK column that is also a query path gets an index; every `tenant_id` is **always** the leading column of composite indexes (RLS uses it, and it naturally partitions per tenant).
- **High-volume tables** (attendance, payments, ledger, audit, activity):
  - `attendance(tenant_id, branch_id, recorded_at DESC)` — time-ordered per branch.
  - `attendance(tenant_id, member_id, recorded_at DESC)` — member history.
  - `payments(tenant_id, status, created_at DESC)` — ops queue views.
  - `ledger(tenant_id, account, period)` — financial reporting.
  - `audit(tenant_id, entity_type, entity_id)` — entity audit drill-down; `(tenant_id, actor_id, created_at)` for user trail.
- **Partial indexes** for filtered states: `WHERE deleted_at IS NULL`; `WHERE status = 'pending'` for dunning/job queues.
- **Search/text:** full-text search (`tsvector` + GIN) for names/barcodes/notes in-module; global search lives in the `search` module using a dedicated index (§12.10).
- **Index maintenance:** periodic `pg_stat_statements` review; `REINDEX` maintenance windows; hypopg experiments before adding indexes.

### 12.8 Constraints

- PK/FK everywhere; `ON DELETE RESTRICT` on business links (e.g., can't delete a member with payments) unless soft-delete path used; `ON DELETE SET NULL` for optional references.
- CHECK constraints for invariants: `amount_minor >= 0`; status enums; `start_at < end_at`; capacity `>= 0`; stock `>= 0` where meaningful.
- EXCLUDE constraints for booking conflicts: `EXCLUDE USING gist (resource_id WITH =, tstzrange(start,end) WITH &&)` on class resources where viable — strong correctness guard for scheduling.
- NOT NULL + DEFAULT on tenant_id; generated columns where useful (e.g., `full_name`, `revenue_period`).

### 12.9 Core Entity Set (representative)

```
platform: users, user_sessions, subscription_tiers, tenant_features, platform_audit
tenancy: gyms, branches, tenant_settings, branding, entitlements
identity: users, credentials, refresh_tokens, mfa, roles, role_permissions,
          user_roles, user_branches, permission_catalog (seed)
crm: leads, lead_stages, lead_activities, campaigns, segments, automations,
     member_segments, churn_scores
members: members, member_profiles, member_custom_fields, member_documents,
         member_timeline, member_preferences, consent_records
membership: membership_plans, plan_tiers, plan_addons, subscriptions,
            subscription_versions, freezes, coupons, discount_rules,
            credit_packs, credit_ledger
billing: invoices, invoice_lines, payments, payment_ledger, receipts,
         refunds, tax_regimes, tax_rates, payment_methods, dunning_state,
         reconciliations, deferred_revenue
scheduling: classes, class_templates, recurrences, rooms, resources,
            bookings, waitlists, booking_rules, session_packs, pt_sessions,
            trainer_assignments, commissions
attendance: check_ins, access_devices, kiosk_entries, entry_rules, blacklists
inventory: products, product_variants, stock_levels, stock_movements,
           stock_adjustments, transfers, suppliers, purchase_orders,
           purchase_items, goods_receipts
pos: sales, sale_items, payment_splits, cash_sessions, refunds
expenses: expense_categories, expenses, expense_approvals
payroll: employees, pay_rates, pay_runs, pay_lines, payslips, deductions,
         statutory_configs
hr: leave_types, leave_balances, leave_requests, holiday_calendars, staff_shifts
notifications: notification_templates, notification_jobs, deliveries,
               provider_accounts, in_app_notifications
media: documents, media_objects, upload_sessions
search: search_index, search_snapshots
reports: report_definitions, report_runs, scheduled_reports
audit: audit_log, audit_chains
activity: entity_activities
```

### 12.10 Global Search Indexing

- A dedicated `search` store: on entity write, the module emits `search.upsert` (outbox) → indexer updates a `search_index` table (or external OpenSearch in phase 2). Reads hit the index, not the OLTP tables. Membership/branch/ACL filtering applied at query time against `tenant_id` and branch scope.
- **Why not live DB FTS only:** global search across 15+ entity types with faceting, ACL filtering, and fuzzy ranking is better served by a dedicated index; using the OLTP store for it would amplify load and lock contention at 10M members. In the modular monolith phase, a Postgres-native `search_index` with GIN is acceptable; the seam allows swapping to OpenSearch later.

### 12.11 Performance Optimization

- **Connection pooling:** PgBouncer (transaction mode) in front of the primary; app pools sized deliberately; no connection-per-request anti-patterns.
- **Read replicas:** heavy read paths (reports, dashboards, global search reads, cross-tenant analytics) route to replicas. Writes + any read-your-write paths hit primary (sticky read policy via short TTL or session hints).
- **Caching:** Redis caching layer for hot, low-mutation data: role permission snapshots, membership plan read-models, tenant settings/branding, product read-models, entitlement checks. Invalidate via events, never rely on TTL alone for correctness.
- **Read models / projections:** dashboards and reports consume **precomputed projections** (KPI tables, daily rollups) maintained by background jobs, not live aggregations over millions of rows. This is the single most important performance decision for the analytics domain.
- **Query discipline:** `EXPLAIN ANALYZE` gates in review; forbid N+1 in ORM review; limit ORM lazy-loading in hot paths; prefer bulk inserts (`COPY` / executemany) for imports and log ingestion.
- **Bulk ingestion:** attendance/kiosk/import writes use batched inserts, and in phase 2, partitioning + `COPY` from staged files.

### 12.12 Future Partitioning Strategy

- **When:** when a table exceeds ~100M rows or write amplification hurts (likely `attendance`, `payments`, `ledger`, `audit`).
- **Strategy:** native declarative **range partitioning by time** (`recorded_at`/`created_at`), e.g., monthly partitions for attendance and payments, with automated partition creation/drop and pruning.
- **Why time-range over hash:** workloads are predominantly recent-data hot, and time-range enables cheap archive/drop of old partitions, natural alignment with reporting periods, and `pgaudit`/compliance retention windows.
- **Hot-tenant isolation (phase 3):** for a small number of high-volume tenants, move their partitions to dedicated tablespaces/instances via tenant-consistent keys without changing application code — supported by keeping `tenant_id` first in composite indexes.
- **Compatibility:** design indexes/constraints now so that partitioning later is mechanical (avoid global unique constraints that block partition pruning; keep uniqueness per-partition composable, i.e., use `(tenant_id, ...)` unique keys).

### 12.13 Backup, DR, and Compliance

- **Backups:** WAL archiving to S3-compatible storage (continuous); nightly full + frequent incremental; tested restores monthly.
- **Point-in-time recovery (PITR)** enabled (RPO ≤ 5 min).
- **Replication:** streaming replication → standby (RTO ≤ 60 min via promote or managed failover).
- **Retention:** audit log retention configurable per tenant (default 3 years; GDPR erasure workflow).
- **GDPR/DPDP erasure:** `erasure_requests` table drives a job that hard-deletes rows after grace + cascade scrubs PII columns (anonymize) while preserving financial/audit references via tokenized/anonymized identities.

---

## 13. API Architecture

### 13.1 Style

- **REST + JSON over HTTPS**, versioned (`/api/v1/`), with OpenAPI 3.1 generated from Pydantic models (FastAPI gives this for free). A separate, explicit **webhook** surface (outbound) and a limited **gRPC/async bridge** only when a service is extracted (future).
- **Why REST not GraphQL:** our workloads are broad-but-shallow admin CRUD plus complex reporting; REST's caching, debugging, and permission-annotation story is simpler and matches the RBAC model cleanly. GraphQL adds resolver-level data-scope complexity that multiplies tenant-isolation bugs. (Revisit for the member app if mobile clients demand it.)

### 13.2 Resource & URL Conventions

- Plural nouns, nested for obvious hierarchies, but **shallow-ish**: `/api/v1/gyms/{gym_id}/branches/{branch_id}/members/{member_id}`.
- Tenant context in the path for platform APIs; for tenant-scoped APIs the tenant is derived from the token (never accepted from the client).
- Actions as sub-resources where they're entities (e.g., `POST /members/{id}/freeze`, `POST /invoices/{id}/refund`), otherwise verb-adjacent only when no clean noun exists.
- Bulk endpoints: `POST /bulk` variants with bounded batch sizes, `Idempotency-Key`, per-item results.

### 13.3 Methods & Semantics

| Method | Semantics |
|---|---|
| GET | Read; idempotent; must filter by tenant/branch ACL |
| POST | Create / action; returns 201 + Location; idempotency key honored |
| PUT | Full replace on immutable-identified resources |
| PATCH | Partial update; optimistic-lock `version` honored |
| DELETE | Soft delete (moves to trash) unless explicitly hard-delete surfaced (admin only) |

### 13.4 Response Envelope & Errors

- Consistent envelope: `{ "data": ..., "meta": { "pagination": {...} } }` for lists; errors: `{ "error": { "code", "message", "details", "request_id", "trace_id" } }`.
- Error codes: stable machine-readable strings (`TENANT_MISMATCH`, `INSUFFICIENT_PERMISSION`, `CONFLICT_VERSION`, `PAYMENT_DECLINED`, `RATE_LIMITED`, `VALIDATION`).
- HTTP semantics: 400 validation, 401 unauthenticated, 403 forbidden (no data leak of existence), 404 not found (also for cross-tenant resources — never 403 vs 404 leaks), 409 conflict (version/state), 422 for domain rules with structured field errors, 429 rate limited, 500 with opaque message + request_id.
- Pagination: **cursor-based** for high-volume tables (attendance, payments, audit, ledger), offset for small admin lists. Cursor is opaque (base64 of (created_at,id)); total counts returned only when cheap or via `HEAD`/separate count endpoint.

### 13.5 Idempotency

- All POST actions that create financial effects or side effects (payment capture, refund, subscription change, stock movement) **require** an `Idempotency-Key` header; server stores `(key, tenant, request_hash, response)` with expiry (24h), replaying the stored response on duplicate.
- This is non-negotiable for the payments domain: gateway retries + client retries + job retries must converge.

### 13.6 Authentication & Authorization on the API

- Access tokens: short-lived JWT (15 min) in `Authorization: Bearer`; refresh tokens (rotating, stored hashed, device-bound) via `/auth/refresh`.
- Permission middleware resolves (user, tenant, branch, permissions) once per request; result attached to request context.
- Rate limiting per (tenant, route-class) at the gateway/nginx + app layer; stricter on auth, payment webhooks, search.
- Webhook inbound: signature verification (HMAC), replay protection (timestamp window + idempotency), event schema versioning.

### 13.7 Versioning & Lifecycle

- Path versioning `v1`; additive-only changes within a version; breaking changes → new version with deprecation notices (≥ 6 months) and sunset policy.
- Deprecation headers (`Deprecation`, `Sunset`) honored.

### 13.8 Event Contracts (internal)

- Internal events are versioned domain events (`billing.invoice.paid.v1`) published via outbox → broker. External consumers (webhooks) get a curated, stable subset with a separate versioning track.

---

## 14. Frontend Architecture

### 14.1 Stack & Rationale

- **Next.js (App Router, latest), TypeScript strict.** App Router gives RSC streaming, file-based routes, and server components for initial shell; most interactive admin surfaces are client components.
- **Tailwind CSS + shadcn/ui** (Radix primitives) for the design system — consistent, accessible, themeable (light/dark via CSS variables).
- **TanStack Query** for server-state: caching, invalidation, optimistic updates, background refetch. TanStack Table for enterprise grids. **Zustand** for scarce client-state (UI shell, command palette, transient). **React Hook Form + Zod** for forms with a shared schema library generated from the API's OpenAPI (types + validators shared via a `packages/contracts` workspace). **Framer Motion** for tasteful micro-interactions only.
- **Why these:** maturity, TypeScript-first, headless (full styling control), and a huge community — the stack most likely to remain healthy over a 5+ year horizon. Alternatives (Remix, Solid) considered but ecosystem maturity and hiring favored Next.js.

### 14.2 Monorepo Layout

```
apps/web          Next.js admin + member portal (one app, route namespaces)
packages/contracts   OpenAPI-derived TS types + Zod schemas (shared, versioned)
packages/ui       shadcn/ui component library + design tokens
packages/features  feature-specific hooks/components (per module), colocated queries
packages/auth     auth client lib, token handling, session refresh
```

### 14.3 Server State & Data Flow

- TanStack Query as the single source for server data; a thin typed client generated from OpenAPI (typed fetch, no codegen bloat — `openapi-fetch` style).
- **Optimistic updates** for high-frequency ops (check-in, POS cart) with rollback on error.
- **Invalidation strategy:** events from the realtime feed (see below) drive granular invalidation keys (`members.detail`, `branch.stock`) instead of blanket refetch.
- **Race-safety:** requests carry tenant context from auth; all responses validated with Zod at the boundary (defense in depth against a malformed/regressed API).

### 14.4 Realtime

- WebSocket (or SSE) channel per user for: notifications, dashboard live counters, waitlist promotion alerts, POS state sync. Auth via short-lived WS token tied to session. Retry with exponential backoff; degrade gracefully to polling.

### 14.5 Routing & Shell

- Route namespaces:
  - `/` platform console (super-admin) — guarded
  - `/g/{gymSlug}/...` admin app for a gym (branch switcher in shell)
  - `/m/...` member portal (self-service)
  - `/auth/*` sign-in, MFA, reset
- **Shell pattern:** persistent app chrome (sidebar, topbar, command palette, notification bell) with route-level layouts; branch & role context live in the shell and are passed down via context. All data queries keyed on (gym, branch) context so switching branch re-scopes queries automatically (or intentionally keeps "all branches").

### 14.6 Design System

- Design tokens (color/typography/spacing/elevation/radius) as CSS variables; semantic tokens (`bg-app`, `fg-muted`, `border-subtle`, `accent`) → theming per gym (white-label) + dark mode.
- Component inventory: button, input, select (combobox), checkbox/switch, radio group, dialog, drawer, dropdown, command palette, popover, tooltip, toast, table (TanStack), data-grid, form field wrappers, empty state, skeleton, badge, tabs, accordion, calendar/date-picker, time-range, stepper, progress, kbd, avatar, banner, stat card, chart primitives.
- Accessibility: Radix is ARIA-correct; we add keyboard navigation, focus trapping, reduced-motion support, and 4.5:1 contrast checks in CI (axe-core).

### 14.7 Performance

- Route-level code splitting; RSC for static shell; data fetching colocated with components; virtualization for long lists (TanStack Virtual); stable query keys; avoid re-render storms via selector usage in Zustand.
- Loading strategy: **skeleton + streaming**, route-level suspense; keep interactive paths render-ready.
- Bundle budget enforced in CI (< 300 KB gzip main).

### 14.8 Error Handling & Observability

- Error boundary per route; friendly retry states; API errors mapped to actionable messages; `request_id` surfaced for support.
- Frontend telemetry (Web Vitals, error tracking) with tenant/gym context (no PII in events).

### 14.9 Testing

- Vitest for unit; Testing Library for component/hook tests; Playwright for E2E flows (auth, checkout, check-in, booking) with tenant-scoped fixtures; visual regression snapshots for design-system components; axe accessibility runs in CI.

---

## 15. Backend Architecture

### 15.1 Stack & Rationale

- **Python 3.12+, FastAPI, Async SQLAlchemy 2, Pydantic v2, Alembic, PostgreSQL.**
- **Why FastAPI/Python over alternatives:** (a) our strongest differentiation is a data/domain-dense ERP with complex reporting, where Python's developer velocity and typing (Pydantic) shine; (b) async SQLAlchemy + a native driver (asyncpg) comfortably handles 1k+ concurrent requests; (c) FastAPI auto-generates OpenAPI and validation — a massive correctness win for a large team. Alternatives considered: Node/NestJS (fine, but we prefer Python's ecosystem for this domain); Go (superb raw performance, but slower iteration and a thinner library base for the enterprise business logic volume; revisit for a dedicated extraction of the highest-throughput path if ever needed); Java/Spring (strong but heavyweight for our team velocity).
- **Performance expectation:** sync-fast for I/O-bound admin work; hot paths (check-in, POS) optimized with connection pooling, prepared statements, caching, and bulk ops. Python is not the bottleneck at our design envelope when the database and caching layers are engineered correctly; we prove this with load tests, and the modular seam lets us extract hot paths in the future if needed.

### 15.2 Layers Inside a Module

```
api (routers, deps: auth/permission/tenant) → application services (use-cases, tx)
→ domain (entities, rules, ports) → infrastructure (repos, adapters: gateway, storage, queue)
   kernel (shared types, events, money, security primitives)
```

- **Application services** are the only place allowed to manage transactions and emit domain events; controllers are thin (parse, validate, call service, serialize).
- **Ports & adapters:** payment provider, notification provider, file storage, broker — all behind interfaces defined in `kernel`, with concrete adapters injected. This is what makes Razorpay-first + provider-swappable and attendance hardware-extensible concrete.

### 15.3 Concurrency Model

- Async event loop for I/O; CPU-bound work (PDF generation, CSV export of large sets, image processing, report aggregation) delegated to workers (background queue) — never run in the request loop.
- DB access via pooled asyncpg; transactions kept short; `SELECT ... FOR UPDATE`/`SKIP LOCKED` used deliberately (stock decrement, job claims) with timeouts.

### 15.4 Event Bus & Outbox

- **Transactional outbox:** within the same DB transaction that changes state, write a row to `outbox` (aggregate_id, event_type, payload). A dispatcher (background worker or CDC-style poller) publishes to Redis Streams; consumers run in the same or separate processes.
- **Why outbox:** guarantees no lost events on crash mid-transaction and no double-send on retry (consumer idempotency + dedupe).
- **Consumer semantics:** at-least-once + idempotent handlers; DLQ with dead-letter inspection and replay tooling.

### 15.5 Background Jobs

- **Task queue:** ARQ (Redis) or RQ, chosen for Python-ecosystem fit; Redis-backed for a single infra dependency. Job types: recurring (billing batches, dunning, reminders, report scheduling, cache warm, projections) and immediate (notifications, media processing, search indexing, reconciliation).
- **Job guarantees:** retries with exponential backoff + jitter, per-job timeouts, rate limiting per provider (e.g., SMS vendor caps), dead-letter handling, per-tenant isolation of noisy job loads (billing runs staggered by tenant timezone).

### 15.6 Caching Strategy

- Redis cache layers (with per-key TTL and event-based invalidation):
  - Role/permission snapshots
  - Tenant settings/branding
  - Entitlement checks
  - Plan/product read models
  - Session/refresh-token blacklist
  - Rate-limit counters
  - Query results for slow dashboards (short TTL, project-backed)
- **Cache-aside** with invalidation events; **write-through** for projections where consistency matters; never cache writes.
- **Correctness rule:** cache is an optimization — the DB is the source of truth; on any uncertainty, bypass.

### 15.7 File Storage Strategy

- **S3-compatible object storage** (MinIO for dev/self-host, AWS S3 / GCS / Cloudflare R2 for cloud) as the single media source. DB stores object metadata + reference keys only.
- Uploads: pre-signed upload URLs; **server-side validation** (MIME sniff, magic-byte check, size limits, virus scan via ClamAV worker), private by default; access via short-lived signed URLs with ACL checks; long-lived exports via signed download links with expiry.
- Variants: thumbnails/optimized images produced by a media worker; video transcoding deferred (later phase).
- Retention/erasure: media object lifecycle rules align with GDPR erasure; deleted docs move to a trash bucket then purge.

### 15.8 Structured Logging & Monitoring

- **Structured JSON logs** (structlog): fields = request_id, trace_id, tenant_id, branch_id, user_id, action, duration_ms, status. PII minimization by policy; logs shipped to Loki/OpenSearch.
- **Metrics:** Prometheus (request latency histograms, error rates, queue depths, DB pool saturation, cache hit ratio, per-tenant API usage). Alerts via Alertmanager with SLO burn-rate rules.
- **Tracing:** OpenTelemetry traces for requests across API → DB → cache → queue; sampling strategy (head-based 100% for payment/check-in, tail-based elsewhere).
- **Dashboards:** RED metrics per service, tenant SLO dashboard, queue health, DB health (`pg_stat_*`), error budget.

### 15.9 Health Checks & Readiness

- `/health/live` (process up) and `/health/ready` (DB, Redis, storage reachable, migrations applied) endpoints; k8s/Docker health checks wired to these; dependency health surfaced in platform console.

### 15.10 Configuration & Secrets

- 12-factor config: env-driven, `pydantic-settings`; secrets in the platform's secret store (env/K8s secrets/Vault), **never** in code or repos; secret rotation tooling; audit of secret access.

---

## 16. UI/UX Recommendations

### 16.1 Experience Principles

1. **Desktop-grade density with modern polish** — macOS/Linear/Stripe-inspired: clear hierarchy, generous but disciplined spacing, subtle elevation, quiet borders.
2. **Keyboard-first:** every workflow reachable without a mouse; visible keyboard hints (`⌘K` command palette, `g` goto, `?` shortcut sheet).
3. **Zero-clutter defaults, progressive disclosure:** show what's essential; reveal advanced options inline or in drawers.
4. **Direct manipulation:** inline edit, drag-and-drop (schedules), instant search-as-you-type.
5. **Consistent feedback:** optimistic UI with clear success/error toasts; every destructive action confirmable/undoable (soft delete).
6. **Speed as a feature:** skeletons, cached navigation, instant filter; sub-3-second reception flows.

### 16.2 Information Architecture & Navigation

- **Left sidebar shell** (collapsible) with: workspace switcher (gym/branch), primary sections (Dashboard, Members, CRM, Classes & Bookings, PT, Attendance, Billing, Inventory/POS, Payroll, HR, Reports, Settings), and a role-filtered "recent" section.
- **Top bar:** global search trigger (`⌘K`), branch context, quick-create (`+`), notifications, help, user menu.
- **Breadcrumbs + command palette** as the universal navigation safety net; sidebar items are anchors, not the only path.
- **Member 360° view:** a tabbed detail page (Profile, Membership & Billing, Attendance, Bookings, Payments, Documents, Timeline, Notes) — one place for everything about a person.

### 16.3 Dashboard & Analytics Design

- Role-aware dashboards: Owner (P&L, retention, ARPU, churn, branch comparison), Branch Manager (daily ops: check-ins, revenue, bookings, alerts), Trainer (sessions, roster, utilization).
- Cards with sparklines; **click-through** from KPI to the underlying list/report; date-range presets with custom range; compare periods.

### 16.4 Enterprise Data Tables

- TanStack Table with: column sorting/filtering/pinning, row selection + **bulk actions** bar, column visibility presets, density toggle, row count + export (CSV/PDF), saved views (per user), server-side pagination (cursor) with "load more" on heavy tables, and row hover quick-actions.
- **Search:** global palette (across entities), per-table column filters, fuzzy matching, saved filters.

### 16.5 Command Palette & Shortcuts

- `⌘K`: fuzzy search across members, plans, products, invoices, employees, branches + actions ("new sale", "check in", "book class").
- Global shortcuts: `g d` dashboard, `g m` members, `b` billing, `n` new (context-aware), `⌘↵` submit, `esc` dismiss; all configurable; discoverable via `?`.

### 16.6 Forms & Validation

- RHF + Zod schemas shared with API; inline validation with clear messages; field-level debounced async validation (email uniqueness); smart defaults; save-draft for long forms; keyboard-submit and tab-traversal correctness; unsaved-changes guard.

### 16.7 States

- **Empty states** with action guidance (illustration + primary CTA + "see example").
- **Loading:** skeletons matching layout; optimistic actions show pending states with rollback on failure.
- **Errors:** inline banners with retry; mutation errors inline in forms or toasts; offline indicator with queued-actions count.

### 16.8 Responsive & Accessibility

- Responsive-first: the admin works on tablets/phones (reception) with bottom-nav compact shell on mobile; member portal fully mobile.
- WCAG 2.1 AA: contrast, focus rings, ARIA via Radix, reduced-motion, screen-reader labels, color not the only signal.
- Dark & light themes via semantic tokens; per-gym brand theming (white-label) without affecting accessibility contrast (validated).

### 16.9 Productivity Multipliers

- Bulk edit members (status, plan, branch), bulk check-in, bulk import (CSV with preview + errors report), quick member create at POS, saved filters/views, keyboard macros for reception (F5 check-in field focus), copy-to-clipboard IDs/invoices, recent-items memory.

---

## 17. Security Recommendations

### 17.1 Threat Model Summary

Adversaries: cross-tenant attackers (the primary SaaS risk), credential stuffers, payment fraud, malicious file uploads, insider (privileged) misuse, and platform-account takeover. Every design choice below maps to a concrete mitigation.

### 17.2 Identity & Authentication

- **Passwords:** Argon2id (OWASP-recommended), per-user salt; no plaintext, no reversible encryption. Enforce strong-policy minimums (length-first guidance).
- **JWT access tokens:** short-lived (15 min), signed with asymmetric algorithm (ES256/RS256), include `sub, tenant_id, branch_scope, perms_version, jti`; audience/issuer bound; stateless verification.
- **Refresh tokens:** rotating, stored hashed server-side, bound to device/session, absolute lifetime with sliding inactivity, revocation list (Redis) + revocation event; refresh abuse detection (rotation reuse → revoke family).
- **MFA:** TOTP + WebAuthn (passkeys) for staff; enforced for platform admins and configurable for tenants.
- **SSO:** OIDC/SAML (Enterprise tier) with SCIM provisioning (later phase).
- **Session management:** server-side session registry, concurrent-session limits, "log out all devices", IP anomaly alerts.

### 17.3 Authorization & Tenant Isolation

- Permission enforcement at the service layer (§9.5) + RLS + tenant query builder (§12.6). **Three independent layers** so a single defect cannot breach isolation.
- Never trust client-supplied tenant/branch/gym IDs; always derive from token.
- 403 vs 404 semantics: cross-tenant resources return 404 (no existence oracle).

### 17.4 Input Validation & Output Encoding

- Pydantic validation on every endpoint (types, length, pattern, range, money ints, enum whitelists).
- Structured rejection of dangerous content: uploads (MIME sniff + magic bytes + size + ClamAV), user-generated text rendered safely (no `dangerouslySetInnerHTML`; markdown engine with sanitizer).
- Prepared statements/parameterized queries throughout; no string-built SQL; ORM + explicit SQL audited.
- CSRF: same-site cookies for session-based routes; token-based auth for API; CSRF tokens where cookies carry identity.

### 17.5 Payments & PCI

- **Never store raw PAN/CVV.** Use gateway tokenization (Razorpay token / card-on-file) and store only gateway tokens + last4 + brand + expiry.
- PCI **SAQ-A** posture (tokenized, offsite). Scope minimized; no card data touches our servers beyond proxying token requests.
- Webhook signature verification; idempotency; amount/currency checks; settlement reconciliation.
- Anti-fraud: velocity checks, unusual-amount alerts, IP/referrer heuristics, manual-hold queue.

### 17.6 Rate Limiting & Abuse Protection

- Layered: edge (nginx) global per-IP; app per (user, route-class); strict on `/auth/*`, password reset, OTP send, search, webhook endpoints.
- Backoff-friendly 429 with `Retry-After`; lockout + CAPTCHA on brute-force signals; login device/geo anomaly detection.

### 17.7 Audit Logging & Tamper-Evidence

- All state changes + security events (login, role change, permission change, export, refund, delete) → `audit_log` with actor, tenant, branch, IP, user-agent, request_id, before/after delta, and a **chained hash** (each entry hashes the previous entry's hash + its own payload) for tamper-evidence.
- Audit retention per tenant with platform override; export for compliance.

### 17.8 Secrets & Encryption

- Secrets via secret manager; rotation policy; no secrets in repo (CI scans).
- **Encryption at rest:** DB cluster encrypted (KMS); volume encryption; object storage SSE.
- **Field-level encryption:** PII fields that are rarely queried in the clear (health notes, Aadhaar-equivalent IDs, sensitive documents) encrypted with app-layer envelope encryption; search over them via HMAC'd tokens, not plaintext.
- **TLS everywhere:** 1.2+ enforced, HSTS, secure cookies.

### 17.9 OWASP Top 10 Mapping (2021)

| OWASP | Mitigation in this design |
|---|---|
| A01 Broken Access Control | RBAC + RLS + tenant predicates; deny-by-default; automated isolation tests |
| A02 Cryptographic Failures | TLS, KMS at-rest, Argon2id, field encryption, secure key management |
| A03 Injection | Parameterized queries, ORM, Pydantic input, no eval |
| A04 Insecure Design | Threat modeling, rate limits, trust boundaries, outbox invariants |
| A05 Security Misconfiguration | IaC, config linting, hardened base images, headers, SAST |
| A06 Vulnerable Components | Dependency scanning (SBOM), patching pipeline, minimal images |
| A07 Auth Failures | MFA, rotating refresh tokens, session registry |
| A08 Integrity Failures | Idempotency, signature verification (webhooks), signed audit chain |
| A09 Logging/Monitoring Failures | Structured logging, alerts, retention, PII minimization |
| A10 SSRF | Outbound URL allowlists, SSRF-guard on any server-side fetch (webhooks, import) |

### 17.10 Secure Development Lifecycle

- SAST (Semgrep/Bandit) in CI; dependency audit; secret scanning (gitleaks); container scanning (Trivy); DAST for web (ZAP baseline) on staging; annual external pen-test; responsible-disclosure policy + bug bounty later.

---

## 18. Infrastructure Recommendations

### 18.1 Cloud & Regions

- Launch on a single major cloud (AWS preferred) single region; design for multi-region later (region-agnostic schema, storage, queue seams).
- Managed services where possible to reduce ops load: RDS/Aurora PostgreSQL (or managed equivalent), Elasticache/Redis, S3, managed load balancer.
- Self-host/on-prem path (Enterprise, data residency) via Docker Compose + managed Postgres/Redis/MinIO — the entire stack must be containerized and vendor-light.

### 18.2 Runtime Topology (Docker/Kubernetes)

- **Containers:** API (stateless, horizontally scaled), Worker (queue consumers), Scheduler (cron-like jobs), Media worker, Notification worker; all behind nginx ingress with TLS termination.
- **Orchestration:** Docker Compose for local/self-host single-node; Kubernetes (EKS) for the managed SaaS. K8s gives autoscaling (HPA on CPU/queue depth), rolling deploys, and health-gated rollouts.
- **Layers:** LB/ingress → API pods → Postgres (primary + replicas) + PgBouncer + Redis (Streams + cache) + S3; worker pods consume the same queue; observability stack (Prometheus, Loki/OpenSearch, Tempo/OTel, Grafana, Alertmanager).

### 18.3 Network

- Private VPC subnets for DB/cache/storage; public only on ingress; security groups restrict egress; no public DB exposure.
- CDN for static assets (frontend bundle, media variants) for latency and bandwidth cost.

### 18.4 CI/CD

- Pipeline: lint/typecheck → unit/contract tests → SAST/dep scan → build images → container scan → deploy to ephemeral preview env → E2E → promote to staging → smoke tests → promote to prod (blue/green or rolling with health gates).
- **Migrations:** DB migrations run as a separate step (expand phase before deploy, contract after) with zero-downtime discipline (§19.3).
- Environments: dev, preview (per-PR), staging (prod-like), production.

### 18.5 Observability Stack

- Metrics: Prometheus + Grafana; logs: OpenSearch/Loki (structured JSON); traces: OTel collector → Tempo/Jaeger; alerting on SLO burn; on-call runbooks; status page.

### 18.6 Cost Controls

- Per-tenant API usage metrics (for usage-based billing and abuse detection); storage lifecycle policies; autoscaling limits; spot instances for batch workers where acceptable; Redis cache sizing review.

---

## 19. Deployment Strategy

### 19.1 Environments & Promotion

- Trunk-based development with short-lived feature branches; main is always deployable; feature flags gate incomplete work.
- Every PR deploys to an isolated preview environment (own tenant sandbox) for QA/demo; staging mirrors production (same image, same env shape) with synthetic tenants + seeded fixtures; production uses blue/green for the API and database expansion-contraction for schema (§19.3).

### 19.2 Release Cadence

- Continuous deployment of additive changes; scheduled windows for high-risk migrations; release trains with changelog + API deprecation notices.

### 19.3 Zero-Downtime Database Migration Discipline

- **Expand/contract (parallel change) pattern:**
  1. *Expand:* add nullable columns/tables, backfill in batches, add indexes `CONCURRENTLY`.
  2. *Migrate:* dual-write or read old/new; run data transformation jobs.
  3. *Contract:* switch reads, remove old columns/tables in a later release.
- Alembic migrations are: additive-first, reversible where cheap, never destructive without a dual-step, and executed with `lock_timeout` + `statement_timeout` guards; risky migrations are manually reviewed and run by an operator, not fully automated.
- Partition-aware DDL from the start (§12.12).

### 19.4 Backups & Disaster Recovery

- Continuous WAL archiving → S3; PITR enabled; nightly full + periodic incrementals; **monthly restore drills** with measured RTO/RPO.
- Cross-region backup copy (once multi-region: active/standby).
- DR runbook: failover to standby, data integrity checks, tenant-aware restart (queue drain, cache warm).

### 19.5 Environment Parity & Config

- Single image promoted through environments (no env-specific build artifacts); config via env/secrets; feature-flag parity between staging and prod; synthetic monitoring (uptime + critical journey checks) from outside the network.

---

## 20. Testing Strategy

### 20.1 Pyramid (prioritized)

1. **Unit tests (largest layer):** domain rules, money math, proration, coupon logic, RBAC resolver, event serialization — pure, fast, no I/O.
2. **Integration tests:** repositories + SQL against a real Postgres (testcontainers); RLS isolation tests; outbox→queue→consumer flows; idempotency; Alembic migrations on a copy of prod-shaped data.
3. **Contract tests:** provider-pact style for gateway/notification adapters (Razorpay, Twilio/WhatsApp) against their recorded contracts; OpenAPI schema drift checks.
4. **E2E (Playwright):** critical journeys — sign-in/MFA, lead→member→billing→check-in, POS sale with stock, class booking + waitlist, payroll run, refund flow, member portal self-service.
5. **Performance/load:** k6 — check-in burst, POS throughput, billing batch at scale, search latency; soak tests for queue stability; DB query regression benchmarks in CI (perf thresholds).
6. **Security:** SAST in CI, dependency scanning, secret scanning, container scanning, ZAP baseline DAST on staging, pen-test annually, isolation fuzz/suite (attempt cross-tenant access systematically).

### 20.2 Test Data & Tenants

- Factories for seeded tenant fixtures; a **multi-tenant isolation test fixture** that deliberately omits filters to prove RLS catches it; synthetic data generator for load/volume tests.

### 20.3 Quality Gates in CI

- Coverage thresholds (domain ≥ 80%), no flaky-test allowance (quarantine), type-check strict, lint enforced, migration-on-clean-db + migration-on-migration-history both tested.

### 20.4 QA Ops

- QA owns: release verification checklist, environment parity, exploratory passes on new modules, accessibility audits, and localization QA (timezone/currency edge cases).

---

## 21. Scalability Strategy

### 21.1 Scale Envelope & Bottleneck Analysis

| Bottleneck | Risk at scale | Strategy |
|---|---|---|
| DB writes (attendance, ledger, payments, audit) | Contention & WAL growth | Batching, time-range partitioning (§12.12), PgBouncer, tuned checkpoints; phase 3 hot-tenant isolation |
| DB reads (dashboards/reports) | Full aggregations over 100M rows | Precomputed projections/rollups; read replicas; cached read models |
| Search | Expensive FTS over OLTP | Dedicated search index (→ OpenSearch phase 2) |
| Queue (notifications/billing) | Burst on month-end | Per-tenant timezone staggering; worker autoscaling on queue depth; provider rate limits |
| Payment gateway webhooks | Bursts + ordering | Idempotency keys, replay protection, parallel-safe reconciliation |
| Redis (rate limits, cache, streams) | Memory/single-writer | Cluster mode, key sharding, eviction policies, non-correctness-critical |
| Frontend | Bundle/latency | CDN, RSC, code-splitting, caching |

### 21.2 Horizontal Scaling Plan

- **Stateless API tier:** scale replicas behind LB; sticky sessions not required (JWT stateless; session registry in Redis).
- **Worker tier:** scale on queue depth; per-queue concurrency tuning; graceful shutdown + at-least-once with idempotent consumers.
- **DB:** primary for writes; replicas for reads; PgBouncer to bound connections; when primary saturates → partition high-volume tables (phase 2), then shard only if needed (phase 3) — sharding is the last resort due to cross-shard complexity (reports, member spanning branches).
- **Redis:** cluster for cache; separate logical DBs/namespaces for cache vs streams; size limits enforced.
- **Storage:** object storage scales horizontally natively; media variants cached at CDN.

### 21.3 Per-Tenant Fairness (Noisy Neighbor)

- Query timeouts and statement timeouts per tenant class; rate limits per tenant; heavy-report jobs queued, not inline; projected aggregates capped by tier; hot-tenant isolation as the escalation path.

### 21.4 Caching & Consistency Strategy

- Multi-level: CDN (static) → Redis cache → DB. Event-driven invalidation; read-your-writes via primary-read-after-write for interactive flows; eventual consistency acceptable for reports/notifications with explicit staleness metadata.

### 21.5 Capacity Planning

- Model: members × transactions per member per month; per-tenant storage (docs, media); peak-hour check-in concurrency (members × p95 arrival); sizing formulas encoded in a capacity doc and load-tested quarterly.

### 21.6 Multi-Region (Future)

- Region-local writes with async replication for a **global read** posture; data residency selection per tenant; routing by tenant region; the schema/cache/queue seams are designed region-agnostic now.

---

## 22. Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Cross-tenant data leak | Low | Catastrophic | RLS + app predicates + dedicated isolation test suite + pen-test; 403/404 discipline |
| R2 | Payment reliability (retries, webhooks) | Medium | High | Idempotency, dunning ladder, webhook verification, reconciliation, dedicated queue |
| R3 | Billing correctness bugs (proration, taxes, refunds) | Medium | High | Property tests on money math, invoice snapshotting, dual review, feature-flag rollout |
| R4 | Scope creep / 40 shallow features | High | Medium | Module depth-first, P0 gating, PRD rigor, feature-flagging |
| R5 | Single-DB bottleneck at scale | Medium | High | Partitioning, projections, replicas, hot-tenant isolation; sharding last resort |
| R6 | Incumbent competition / switching cost for customers | High | Medium | Localized payments, modern UX, open API, import tooling, retention features |
| R7 | Regulatory change (payments, data) | Medium | Medium | Region-agnostic data model, configurable tax engine, compliance reviews, residency options |
| R8 | Key-person risk / knowledge loss | Medium | Medium | Documentation, modular contracts, CI-verified invariants |
| R9 | Team velocity on a large monorepo | Medium | Medium | Module boundaries, contract types shared, monorepo tooling, codegen for API contracts |
| R10 | Realtime/websocket operational complexity | Low-Med | Medium | Degrade-to-polling, circuit breakers, capped connections |
| R11 | Fraud (payment, account takeover) | Medium | High | Velocity checks, MFA, session registry, anomaly alerts, manual hold queue |
| R12 | Data retention/erasure compliance debt | Medium | Medium | Erasure workflows, retention config, audit chain integrity |

---

## 23. Future Roadmap

### Phase 0 (Foundation)
Modular monolith scaffold, kernel, RBAC+permissions, tenancy, auth, base audit/activity, CI/CD, observability.

### Phase 1 (Core Operations — v1 launch)
Members + lifecycle, membership plans + renewals + coupons, billing/invoicing, Razorpay + dunning, attendance (QR/manual/kiosk), classes & PT + waitlist, POS + inventory, expenses, global search, dashboards + core reports, notifications (email/in-app).

### Phase 2 (Growth & People)
Payroll, leave + holiday calendar, supplier/purchase + transfers, CRM automations + segments + campaigns, churn-risk scoring, staff scheduling, webhooks + public API, white-label theming, report scheduler, tier entitlements enforcement, partitioning for high-volume tables.

### Phase 3 (Enterprise & Intelligence)
SSO (SAML/OIDC) + SCIM, ABAC policies, BI warehouse + predictive analytics, deferred revenue, multi-currency + tax engine breadth, member mobile app, access-control hardware adapters, marketplace/integrations, multi-region, subscription billing for the platform itself, advanced AI (forecasting, auto-replies).

---

## 24. Assumptions

1. Launch market: India-first (Razorpay, GST, INR), with architecture ready for SEA/other regions.
2. English-language launch; i18n architecture from day one; timezone-aware throughout.
3. Single-currency (INR) at launch; schema supports multi-currency.
4. Cloud SaaS is the default; Docker-based self-host/private-cloud is an Enterprise offer.
5. Python/FastAPI can meet the load envelope with the caching/DB engineering described (validated by load tests before v1).
6. Payments are integrated (Razorpay first), not underwritten by us initially.
7. Members access via web portal/PWA at launch; native apps follow.
8. The platform monetizes gyms (not members) initially; payment-revenue-share is a later option.
9. Email/SMS/WhatsApp providers are third-party; we build provider abstraction + failover.
10. Team has senior full-stack capability; CI and observability are first-class citizens, not afterthoughts.

---

## 25. Open Questions

1. **Brand identity:** product name and target positioning to finalize with marketing.
2. **Pricing/tier boundaries:** exact seat/member/feature limits per tier (commercial decision; architecture supports any).
3. **Razorpay capabilities:** confirm subscription tokenization, UPI recurring mandates, and refund webhooks behave per contract (affects dunning/EMI design details).
4. **Hardware vendor partnerships:** which attendance/access-control vendors to integrate first; device protocol support matrix.
5. **Regulatory:** final interpretation of India DPDP + GST invoicing requirements for invoice line-item structure and retention.
6. **Member app timeline:** PWA-first vs. native-first for member experience; push notification strategy depends on this.
7. **Multi-currency ambition:** is it a v2 requirement or only schema-readiness? Affects pricing engine effort.
8. **Analytics depth:** do we need a full warehouse (dbt/ClickHouse) in v1, or are projections sufficient for 12 months?
9. **API exposure to third parties:** public API + webhooks as a paid add-on vs. included — affects throttling design.
10. **On-prem/private-cloud demand:** firm up Enterprise deal-sheets to justify the Docker/self-host engineering cost.

---

## 26. Final Recommendations

1. **Build the modular monolith.** Do not start with microservices. Enforce module boundaries with tooling and code review; design ports now so extraction is cheap later.
2. **One PostgreSQL + RLS.** Shared schema, hard isolation via RLS + `tenant_id` defaults + application predicates — with a continuous isolation test suite as a release gate.
3. **Dynamic RBAC as data.** Permission catalog + role templates + branch scoping; design the ABAC seam now, ship RBAC now.
4. **Payments-engine discipline.** Idempotency everywhere, outbox for side effects, dunning ladder, webhook verification, reconciliation. This domain decides retention.
5. **Precomputed analytics projections.** Do not build dashboards as live aggregations over millions of rows. Projections + replicas + caching are the difference between "fast demo" and "fast at 10M members."
6. **Modern UX is a moat.** Command palette, keyboard-first, premium tables, white-label theming, and a member portal/PWA. This is how we beat dated incumbents.
7. **Security as three independent layers.** Service permission checks + RLS + tenant query builder, plus MFA, token rotation, audit chaining, and provider abstraction for payments.
8. **Zero-downtime migrations from the first schema.** Expand/contract discipline, `CONCURRENTLY` indexes, partition-aware DDL.
9. **Observability from day one.** Structured logs with `request_id`/`tenant_id`, traces on money paths, SLOs with burn-rate alerts.
10. **Localization and payments breadth are the differentiation.** Razorpay-native, GST-ready invoicing, timezone-aware billing — features global incumbents under-serve in growth markets.

### Recommended Next Actions
- Socialize this blueprint; resolve the §25 open questions with Product/Commercial.
- Produce a PRD + detailed module specs (FR-* to acceptance criteria) per Phase 0/1 module.
- Spike-test: (a) Razorpay subscription + webhook contract, (b) RLS performance overhead on hot tables, (c) check-in concurrency + idempotency, (d) outbox reliability under crash.
- Stand up the monorepo scaffold (apps/web, packages/contracts, backend modules) and the CI/CD + observability skeleton.
- Define the tenant-isolation test suite first — it is the permanent guardrail for every future feature.

---

*End of blueprint. This document is the foundation for detailed PRDs, technical specs, and phased delivery plans. Every architectural decision above should be revisited if its stated assumptions change.*
