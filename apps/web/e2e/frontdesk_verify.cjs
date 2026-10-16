// Front-desk E2E: members list, check-ins, billing (pay/void), subscriptions.
//
// Requires the backend + frontend dev servers running locally and a seeded
// dev DB (demo owner = demo-owner@gym-erp.dev / owner-pass-123).
const { chromium } = require("playwright");

const BASE = process.env.FORGE_BASE_URL || "http://localhost:3000";
const OWNER = { email: "demo-owner@gym-erp.dev", password: "owner-pass-123" };
const ts = Date.now().toString(36);
const MEMBER_A = `FDAlpha${ts}`;
const MEMBER_B = `FDBeta${ts}`;
const PLAN_A = `FD Plan A ${ts}`;
const PLAN_B = `FD Plan B ${ts}`;

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    await page.goto(`${BASE}/login`);
    await page.locator('input[type="email"]').fill(OWNER.email);
    await page.locator('input[type="password"]').fill(OWNER.password);
    await page.getByRole("button", { name: /enter forge/i }).click();
    await page.waitForURL(/\/$/, { timeout: 20000 });
    check("owner login lands on dashboard", true, page.url());

    // ── API fixtures: 2 members, 2 plans, sub A (activated), sub B (pending) ──
    const api = page.context().request;
    const loginRes = await api.post(`${BASE}/api/v1/auth/login`, { data: OWNER });
    const { access_token } = await loginRes.json();
    const auth = { Authorization: `Bearer ${access_token}` };
    async function post(path, data) {
      const res = await api.post(`${BASE}/api/v1${path}`, { headers: auth, data });
      return { status: res.status(), body: await res.json() };
    }
    const branches = await (await api.get(`${BASE}/api/v1/branches`, { headers: auth })).json();
    const branchId = branches[0].id;

    const memberA = await post("/members", {
      first_name: MEMBER_A,
      last_name: "Roster",
      email: `fd-alpha-${ts}@example.com`,
      phone: "9000000001",
      country_code: "+91",
      gender: "Male",
      branch_id: branchId,
      status: "active",
    });
    const memberB = await post("/members", {
      first_name: MEMBER_B,
      last_name: "Roster",
      email: `fd-beta-${ts}@example.com`,
      phone: "9000000002",
      country_code: "+91",
      gender: "Female",
      branch_id: branchId,
      status: "active",
    });
    const planA = await post("/plans", {
      name: PLAN_A,
      slug: `fd-plan-a-${ts}`,
      billing_period: "monthly",
      amount_minor: 120000,
    });
    const planB = await post("/plans", {
      name: PLAN_B,
      slug: `fd-plan-b-${ts}`,
      billing_period: "monthly",
      amount_minor: 90000,
    });
    const subA = await post("/plans/subscribe", {
      member_id: memberA.body.id,
      plan_id: planA.body.id,
      branch_id: branchId,
    });
    const actA = await post(`/plans/subscriptions/${subA.body.id}/activate`, {});
    const subB = await post("/plans/subscribe", {
      member_id: memberB.body.id,
      plan_id: planB.body.id,
      branch_id: branchId,
    });
    const invA = await (
      await api.get(`${BASE}/api/v1/invoices?member_id=${memberA.body.id}`, { headers: auth })
    ).json();
    const invB = await (
      await api.get(`${BASE}/api/v1/invoices?member_id=${memberB.body.id}`, { headers: auth })
    ).json();
    const invAOpen = invA.find((i) => i.status === "open");
    const invBOpen = invB.find((i) => i.status === "open");
    const fixturesOk =
      memberA.status === 201 &&
      memberB.status === 201 &&
      planA.status === 201 &&
      planB.status === 201 &&
      subA.status === 201 &&
      subB.status === 201 &&
      actA.status === 200 &&
      !!invAOpen &&
      !!invBOpen;
    check(
      "API fixtures ready (2 members, 2 plans, activated + pending subs, open invoices)",
      fixturesOk,
      `subs ${subA.status}/${actA.status}/${subB.status} inv ${invAOpen?.number}/${invBOpen?.number}`,
    );
    if (!invAOpen || !invBOpen) throw new Error("fixture invoices missing");

    // ── 1. Members list ──
    await page.goto(`${BASE}/members`);
    await page.locator('input[placeholder="Search name, email, phone"]').waitFor({ timeout: 20000 });
    await page.getByText(/\d+ members/).waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Add member" }).waitFor({ timeout: 10000 });
    check("members page renders with total count + Add member", true);

    const searchInput = page.locator('input[placeholder="Search name, email, phone"]');
    await searchInput.fill(MEMBER_A);
    const memberRow = page.locator("tbody tr", { hasText: MEMBER_A });
    await memberRow.first().waitFor({ timeout: 15000 });
    check("search by name finds member A in table", true, `${await memberRow.count()} row(s)`);

    await memberRow.first().getByText("Active", { exact: true }).waitFor({ timeout: 10000 });
    check("member A row shows Active status badge", true);

    await memberRow.first().hover();
    await memberRow.first().getByRole("link", { name: "View" }).click();
    await page.waitForURL(new RegExp(`/members/${memberA.body.id}`), { timeout: 10000 });
    await page.getByRole("heading", { name: MEMBER_A }).waitFor({ timeout: 15000 });
    check("member detail opens from list View link", true, page.url());

    await page.locator('main a[href="/members"]').click();
    await page.waitForURL(/\/members$/, { timeout: 10000 });
    check("back link returns to members list", true, page.url());

    // ── 2. Check-ins ──
    await page.goto(`${BASE}/checkins`);
    await page.getByRole("heading", { name: "Quick check-in" }).waitFor({ timeout: 20000 });
    await page.getByRole("heading", { name: "Recent activity" }).waitFor({ timeout: 10000 });
    check("check-ins page renders Quick check-in + Recent activity", true);

    await page.locator('input[placeholder="Search member…"]').fill(MEMBER_A);
    await page.getByRole("button", { name: "Check in", exact: true }).click();
    await page.getByRole("heading", { name: "Access granted" }).waitFor({ timeout: 15000 });
    check("record check-in through check-ins page UI (granted)", true);

    const activityRow = page.locator("div.divide-y > div", { hasText: MEMBER_A }).first();
    await activityRow.waitFor({ timeout: 15000 });
    await activityRow.getByText("Granted", { exact: true }).waitFor({ timeout: 10000 });
    check("check-in record appears in Recent activity list", true);

    // ── 3. Billing: list → detail → pay → void ──
    await page.goto(`${BASE}/billing`);
    await page.getByText("Outstanding").waitFor({ timeout: 20000 });
    await page.getByText("Invoices", { exact: true }).waitFor({ timeout: 10000 });
    check("billing page renders summary cards + invoices table", true);

    const invRowA = page.locator("tbody tr", { hasText: invAOpen.number });
    await invRowA.first().waitFor({ timeout: 15000 });
    await invRowA.first().getByText("Open", { exact: true }).waitFor({ timeout: 10000 });
    await invRowA.first().getByText(MEMBER_A).waitFor({ timeout: 10000 });
    check("invoice A listed with Open badge + member name", true, invAOpen.number);

    await invRowA.first().getByRole("link", { name: invAOpen.number }).click();
    await page.waitForURL(new RegExp(`/billing/${invAOpen.id}`), { timeout: 10000 });
    await page.getByRole("heading", { name: invAOpen.number }).waitFor({ timeout: 15000 });
    await page.getByText("Line items", { exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Cancel invoice" }).waitFor({ timeout: 10000 });
    check("invoice A detail renders (line items + Cancel invoice)", true, page.url());

    await page.locator('main a[href="/billing"]').click();
    await page.waitForURL(/\/billing$/, { timeout: 10000 });
    const payRow = page.locator("tbody tr", { hasText: invAOpen.number });
    await payRow.first().getByRole("button", { name: "Pay now" }).waitFor({ timeout: 15000 });
    await payRow.first().getByRole("button", { name: "Pay now" }).click();
    await page.getByText(`Pay ${invAOpen.number}`, { exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: /^Pay ₹/ }).click();
    await page
      .getByText(`${invAOpen.number} marked as paid via upi`)
      .waitFor({ timeout: 15000 });
    await payRow.first().getByText("Paid", { exact: true }).waitFor({ timeout: 10000 });
    check("invoice A paid via Pay now UI (Paid badge)", true, invAOpen.number);

    const invRowB = page.locator("tbody tr", { hasText: invBOpen.number });
    await invRowB.first().getByRole("link", { name: invBOpen.number }).waitFor({ timeout: 15000 });
    await invRowB.first().getByRole("link", { name: invBOpen.number }).click();
    await page.waitForURL(new RegExp(`/billing/${invBOpen.id}`), { timeout: 10000 });
    await page.getByRole("button", { name: "Cancel invoice" }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Cancel invoice" }).click();
    await page.getByText(`Cancel ${invBOpen.number}?`, { exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Void invoice" }).click();
    await page.getByText(`${invBOpen.number} voided`).waitFor({ timeout: 15000 });
    // The detail query must refresh after void — no navigation needed.
    await page.getByText("Void", { exact: true }).first().waitFor({ timeout: 15000 });
    check("invoice B void: detail badge updates in place", true, invBOpen.number);
    await page.locator('main a[href="/billing"]').click();
    await page.waitForURL(/\/billing$/, { timeout: 10000 });
    const voidRow = page.locator("tbody tr", { hasText: invBOpen.number });
    await voidRow.first().getByText("Void", { exact: true }).waitFor({ timeout: 15000 });
    check("invoice B voided via detail UI (Void badge on billing list)", true, invBOpen.number);

    // ── 4. Subscriptions ──
    await page.goto(`${BASE}/subscriptions`);
    await page.getByText(/\d+ subscriptions/).waitFor({ timeout: 20000 });
    check("subscriptions page renders with count", true);

    const subRowA = page.locator("tbody tr", { hasText: MEMBER_A });
    await subRowA.first().waitFor({ timeout: 15000 });
    await subRowA.first().getByText(PLAN_A, { exact: true }).waitFor({ timeout: 10000 });
    await subRowA.first().getByText("Active", { exact: true }).waitFor({ timeout: 10000 });
    check("member A subscription shows Active badge + plan name", true);

    const subRowB = page.locator("tbody tr", { hasText: MEMBER_B });
    await subRowB.first().waitFor({ timeout: 15000 });
    await subRowB.first().getByText("Pending", { exact: true }).waitFor({ timeout: 10000 });
    await subRowB.first().getByRole("button", { name: "Activate" }).click();
    await page.getByText("subscription activated").waitFor({ timeout: 15000 });
    await subRowB.first().getByText("Active", { exact: true }).waitFor({ timeout: 10000 });
    check("member B pending subscription activated via UI", true);
  } catch (err) {
    check("unexpected failure", false, String(err).slice(0, 300));
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
