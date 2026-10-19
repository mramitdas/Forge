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

// Await a wait-then-check pair so a timeout fails under the check's own
// name instead of surfacing as a generic "unexpected failure".
async function must(name, p, extra = "") {
  try {
    await p;
    check(name, true, extra);
  } catch (e) {
    check(name, false, String(e).slice(0, 200));
    if (e && typeof e === "object") e.named = true;
    throw e;
  }
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
      await api.get(`${BASE}/api/v1/invoices?member_id=${memberA.body.id}&page_size=100`, { headers: auth })
    ).json();
    const invB = await (
      await api.get(`${BASE}/api/v1/invoices?member_id=${memberB.body.id}&page_size=100`, { headers: auth })
    ).json();
    const invAOpen = invA.items.find((i) => i.status === "open");
    const invBOpen = invB.items.find((i) => i.status === "open");
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
    await must("members page renders with total count + Add member", page.getByRole("button", { name: "Add member" }).waitFor({ timeout: 10000 }));

    const searchInput = page.locator('input[placeholder="Search name, email, phone"]');
    await searchInput.fill(MEMBER_A);
    const memberRow = page.locator("tbody tr", { hasText: MEMBER_A });
    await memberRow.first().waitFor({ timeout: 15000 });
    check("search by name finds member A in table", true, `${await memberRow.count()} row(s)`);

    await must("member A row shows Active status badge", memberRow.first().getByText("Active", { exact: true }).waitFor({ timeout: 10000 }));

    await memberRow.first().hover();
    await memberRow.first().getByRole("link", { name: "View" }).click();
    await page.waitForURL(new RegExp(`/members/${memberA.body.id}`), { timeout: 10000 });
    await must("member detail opens from list View link", page.getByRole("heading", { name: MEMBER_A }).waitFor({ timeout: 15000 }), page.url());

    await page.locator('main a[href="/members"]').click();
    await page.waitForURL(/\/members$/, { timeout: 10000 });
    check("back link returns to members list", true, page.url());

    // ── 2. Check-ins ──
    await page.goto(`${BASE}/checkins`);
    await page.getByRole("heading", { name: "Quick check-in" }).waitFor({ timeout: 20000 });
    await must("check-ins page renders Quick check-in + Recent activity", page.getByRole("heading", { name: "Recent activity" }).waitFor({ timeout: 10000 }));

    await page.locator('input[placeholder="Search member…"]').fill(MEMBER_A);
    await page.getByRole("button", { name: "Check in", exact: true }).click();
    await must("record check-in through check-ins page UI (granted)", page.getByRole("heading", { name: "Access granted" }).waitFor({ timeout: 15000 }));

    const activityRow = page.locator("div.divide-y > div", { hasText: MEMBER_A }).first();
    await activityRow.waitFor({ timeout: 15000 });
    await must("check-in record appears in Recent activity list", activityRow.getByText("Granted", { exact: true }).waitFor({ timeout: 10000 }));

    // ── 3. Billing: list → detail → pay → void ──
    await page.goto(`${BASE}/billing`);
    await page.getByText("Outstanding").waitFor({ timeout: 20000 });
    await must("billing page renders summary cards + invoices table", page.getByText("Invoices", { exact: true }).waitFor({ timeout: 10000 }));
    await must("billing pager renders Page X of Y", page.getByText(/^Page \d+ of \d+$/).waitFor({ timeout: 10000 }));

    const searchBox = page.getByPlaceholder("Search invoice # or member");
    const searchResp = () =>
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/v1/invoices?") &&
          r.url().includes("q=") &&
          r.status() === 200,
        { timeout: 15000 },
      );
    const respA = searchResp();
    await searchBox.fill(invAOpen.number);
    await respA;
    await page.locator("tbody tr", { hasText: invAOpen.number }).first().waitFor({ timeout: 10000 });
    const rowsWithB = await page.locator("tbody tr", { hasText: invBOpen.number }).count();
    check("billing search narrows to one invoice", rowsWithB === 0, `other rows=${rowsWithB}`);
    const respName = searchResp();
    await searchBox.fill(MEMBER_A);
    await respName;
    await page.locator("tbody tr", { hasText: invAOpen.number }).first().waitFor({ timeout: 10000 });
    const memberRowsB = await page.locator("tbody tr", { hasText: invBOpen.number }).count();
    check("billing search by member name filters rows", memberRowsB === 0, `other rows=${memberRowsB}`);
    await searchBox.fill("");
    await must("billing search clear restores rows", page.locator("tbody tr", { hasText: invBOpen.number }).first().waitFor({ timeout: 10000 }));

    const invRowA = page.locator("tbody tr", { hasText: invAOpen.number });
    await invRowA.first().waitFor({ timeout: 15000 });
    await invRowA.first().getByText("Open", { exact: true }).waitFor({ timeout: 10000 });
    await must("invoice A listed with Open badge + member name", invRowA.first().getByText(MEMBER_A).waitFor({ timeout: 10000 }), invAOpen.number);

    await invRowA.first().getByRole("link", { name: invAOpen.number }).click();
    await page.waitForURL(new RegExp(`/billing/${invAOpen.id}`), { timeout: 10000 });
    await page.getByRole("heading", { name: invAOpen.number }).waitFor({ timeout: 15000 });
    await page.getByText("Line items", { exact: true }).waitFor({ timeout: 10000 });
    await must("invoice A detail renders (line items + Cancel invoice)", page.getByRole("button", { name: "Cancel invoice" }).waitFor({ timeout: 10000 }), page.url());

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
    await must("invoice A paid via Pay now UI (Paid badge)", payRow.first().getByText("Paid", { exact: true }).waitFor({ timeout: 10000 }), invAOpen.number);

    const invRowB = page.locator("tbody tr", { hasText: invBOpen.number });
    await invRowB.first().getByRole("link", { name: invBOpen.number }).waitFor({ timeout: 15000 });
    await invRowB.first().getByRole("link", { name: invBOpen.number }).click();
    await page.waitForURL(new RegExp(`/billing/${invBOpen.id}`), { timeout: 10000 });
    await page.getByRole("button", { name: "Cancel invoice" }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Cancel invoice" }).click();
    await page.getByText(`Cancel ${invBOpen.number}?`, { exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Void invoice" }).click();
    await page.getByText(`${invBOpen.number} voided`).waitFor({ timeout: 15000 });
    // The detail query must refresh after void — no navigation needed. Scope
    // the badge wait to THIS invoice's card (not any "Void" text on the page).
    const invBCard = page
      .locator("div.glass")
      .filter({ has: page.getByRole("heading", { name: invBOpen.number }) })
      .first();
    await must("invoice B void: detail badge updates in place", invBCard.getByText("Void", { exact: true }).waitFor({ timeout: 15000 }), invBOpen.number);
    await page.locator('main a[href="/billing"]').click();
    await page.waitForURL(/\/billing$/, { timeout: 10000 });
    const voidRow = page.locator("tbody tr", { hasText: invBOpen.number });
    await must("invoice B voided via detail UI (Void badge on billing list)", voidRow.first().getByText("Void", { exact: true }).waitFor({ timeout: 15000 }), invBOpen.number);
    const voidPayNow = voidRow.first().getByRole("button", { name: "Pay now" });
    check(
      "billing: void invoice shows no Pay now button",
      (await voidPayNow.count()) === 0,
      invBOpen.number,
    );

    // ── 4. Subscriptions ──
    await page.goto(`${BASE}/subscriptions`);
    await must("subscriptions page renders with count", page.getByText(/\d+ subscriptions/).waitFor({ timeout: 20000 }));
    await must("subscriptions page shows Gym plan tier card", page.getByText("Gym plan", { exact: true }).waitFor({ timeout: 10000 }));

    const subRowA = page.locator("tbody tr", { hasText: MEMBER_A });
    await subRowA.first().waitFor({ timeout: 15000 });
    await subRowA.first().getByText(PLAN_A, { exact: true }).waitFor({ timeout: 10000 });
    await must("member A subscription shows Active badge + plan name", subRowA.first().getByText("Active", { exact: true }).waitFor({ timeout: 10000 }));

    const subRowB = page.locator("tbody tr", { hasText: MEMBER_B });
    await subRowB.first().waitFor({ timeout: 15000 });
    await subRowB.first().getByText("Pending", { exact: true }).waitFor({ timeout: 10000 });
    await subRowB.first().getByRole("button", { name: "Activate" }).click();
    await page.getByText("subscription activated").waitFor({ timeout: 15000 });
    await must("member B pending subscription activated via UI", subRowB.first().getByText("Active", { exact: true }).waitFor({ timeout: 10000 }));
  } catch (err) {
    if (!(err && typeof err === "object" && err.named)) {
      check("unexpected failure", false, String(err).slice(0, 300));
    }
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
