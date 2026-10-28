// Billing page E2E: year selector, summary cards, chart, search, pagination.
// Self-provisioning: every asserted invoice is created by this script via the
// plan → member → subscription flow (POST /members with a plan_id creates the
// member, an active subscription, and a pending invoice in one call).
//
// Requires the backend + frontend dev servers and the seeded dev DB
// (demo owner = demo-owner@gym-erp.dev / owner-pass-123). Invoices have no
// delete endpoint, but DELETE /members/{id} soft-deletes the member together
// with their subscriptions, invoices, and payments — that is the cleanup path,
// run in `finally` so re-runs stay idempotent.
const { chromium } = require("playwright");

const BASE = process.env.FORGE_BASE_URL || "http://localhost:3000";
const OWNER = { email: "demo-owner@gym-erp.dev", password: "owner-pass-123" };
const CURRENT_YEAR = new Date().getFullYear();
const ts = Date.now().toString(36);

// Enough invoices to fill Page 1 (UI default page size is 50) and overflow
// onto Page 2 regardless of any seeded baseline.
const CREATED = 65;
const UI_PAGE_SIZE = 50;
const NAME_TOKEN = `e2ebill${ts}`;

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
}

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

async function login(page, user) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="email"]').fill(user.email);
  await page.locator('input[type="password"]').fill(user.password);
  await page.getByRole("button", { name: /enter forge/i }).click();
  await page.waitForURL(/\/$/, { timeout: 20000 });
}

async function rowCount(page) {
  return page.locator("table tbody tr").count();
}

async function waitRows(page, n) {
  await page.waitForFunction(
    (count) => document.querySelectorAll("table tbody tr").length === count,
    n,
    { timeout: 30000 },
  );
}

function yearSelect(page) {
  return page.locator('select[aria-label="Select billing year"]');
}

async function countText(page) {
  return (
    await page
      .locator("p")
      .filter({ hasText: /^\d+ invoices?$/ })
      .first()
      .textContent()
  )?.trim();
}

async function statValue(page, label) {
  return page.evaluate((name) => {
    const el = [...document.querySelectorAll("p")].find(
      (p) => p.textContent?.trim() === name,
    );
    return el?.nextElementSibling?.textContent?.trim() || "";
  }, label);
}

function chart(page) {
  return page.getByRole("img", { name: /Payments received in/ });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  let api = null;
  let auth = null;
  const memberIds = [];
  let planId = null;
  const invoiceNumbers = [];

  try {
    await login(page, OWNER);
    check("owner login lands on dashboard", true, page.url());

    // ── API session: fixtures are created (and cleaned up) over the API ──
    api = page.context().request;
    const loginRes = await api.post(`${BASE}/api/v1/auth/login`, {
      data: { email: OWNER.email, password: OWNER.password },
    });
    check("api login returns token", loginRes.ok());
    const { access_token } = await loginRes.json();
    auth = { Authorization: `Bearer ${access_token}` };

    const branchesRes = await api.get(`${BASE}/api/v1/branches`, { headers: auth });
    check("api branches list ok", branchesRes.ok());
    const branches = await branchesRes.json();
    const branchId = branches[0]?.id;
    check("a branch exists for fixtures", Boolean(branchId));

    // Baseline BEFORE creating anything: expected totals are seeded data plus
    // exactly our delta.
    const baseRes = await api.get(
      `${BASE}/api/v1/invoices?year=${CURRENT_YEAR}&page=1&page_size=1`,
      { headers: auth },
    );
    check("api baseline invoice list ok", baseRes.ok());
    const baselineTotal = (await baseRes.json()).total ?? 0;

    // ── Self-provisioned fixtures: plan → members (each member create makes
    // an active subscription and a pending invoice for it) ──
    const planRes = await api.post(`${BASE}/api/v1/plans`, {
      headers: auth,
      data: {
        name: `E2E Billing Plan ${ts}`,
        slug: `e2e-billing-${ts}`,
        branch_id: branchId,
        description: `e2e ${ts}`,
        billing_period: "monthly",
        amount_minor: 99900,
        entry_fee_minor: 0,
        tax_rate_bp: 0,
        auto_renew: false,
      },
    });
    check("api create plan returns 201", planRes.status() === 201);
    planId = (await planRes.json()).id;

    for (let i = 1; i <= CREATED; i++) {
      const res = await api.post(`${BASE}/api/v1/members`, {
        headers: auth,
        data: {
          first_name: NAME_TOKEN,
          last_name: `B${String(i).padStart(2, "0")}${ts}`,
          branch_id: branchId,
          plan_id: planId,
          status: "active",
        },
      });
      if (res.status() !== 201) {
        check(`api create member ${i}`, false, `${res.status()} ${String(await res.text()).slice(0, 120)}`);
        throw new Error("member create failed");
      }
      const member = await res.json();
      memberIds.push(member.id);
      const invRes = await api.get(
        `${BASE}/api/v1/invoices?member_id=${member.id}&year=${CURRENT_YEAR}&page_size=5`,
        { headers: auth },
      );
      const items = invRes.ok() ? (await invRes.json()).items : [];
      if (items[0]?.number) invoiceNumbers.push(items[0].number);
    }
    check(`api created ${CREATED} members with invoices`, memberIds.length === CREATED && invoiceNumbers.length === CREATED);

    const expectedTotal = baselineTotal + CREATED;
    const expectedPages = Math.ceil(expectedTotal / UI_PAGE_SIZE);

    // ── UI: billing page renders the self-created data ──
    await page.goto(`${BASE}/billing`);
    await must(
      "billing page renders",
      page.getByRole("heading", { name: "Billing", exact: true }).first().waitFor({ timeout: 15000 }),
    );
    await must("invoice table settles", page.waitForSelector("table tbody", { state: "attached", timeout: 15000 }));

    await must("year selector renders", yearSelect(page).waitFor({ timeout: 10000 }));
    check("year defaults to the current year", (await yearSelect(page).inputValue()) === String(CURRENT_YEAR));

    await must("count reflects baseline + created", page.getByText(`${expectedTotal} invoices`, { exact: true }).waitFor({ timeout: 30000 }));
    check("page 1 is full", (await rowCount(page)) === UI_PAGE_SIZE);

    await must("collected card shows cash basis", page.getByText(`Received in ${CURRENT_YEAR}`, { exact: true }).waitFor());
    const collected = await statValue(page, "Collected");
    check("collected renders as INR", /^₹[\d,]+$/.test(collected), collected);

    await must("collections chart renders", chart(page).waitFor({ timeout: 15000 }));
    check("collections chart has an SVG", (await page.locator("svg.recharts-surface").count()) > 0);

    // ── Pagination: Page 1 of N, next, previous ──
    const pageLabel = await page.getByText(/^Page 1 of \d+$/).textContent();
    check(
      "pagination says Page 1 of expected",
      pageLabel?.trim() === `Page 1 of ${expectedPages}`,
      `${(pageLabel || "").trim()} (expected Page 1 of ${expectedPages})`,
    );

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await must("next page renders", page.getByText(/^Page 2 of/).waitFor());
    const page2Rows = Math.min(UI_PAGE_SIZE, expectedTotal - UI_PAGE_SIZE);
    await waitRows(page, page2Rows);
    check("page 2 keeps page size", (await rowCount(page)) === page2Rows, `rows=${await rowCount(page)}`);
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await must("previous page returns", page.getByText(/^Page 1 of/).waitFor());
    await waitRows(page, UI_PAGE_SIZE);

    // ── Rows-per-page dropdown: raise to 100, page resets to 1 ──
    const sizeSelect = page.locator('select[aria-label="Rows per page"]');
    await must("rows-per-page dropdown renders", sizeSelect.waitFor({ timeout: 10000 }));
    check("dropdown defaults to 50", (await sizeSelect.inputValue()) === "50");
    // First leave the page state (go to page 2), then change the size — the
    // size change must snap back to page 1 with a full 100-row page.
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await must("next page renders again", page.getByText(/^Page 2 of/).waitFor());
    await sizeSelect.selectOption("100");
    const expectedPages100 = Math.max(1, Math.ceil(expectedTotal / 100));
    await must(
      "size change resets to page 1",
      page.getByText(`Page 1 of ${expectedPages100}`, { exact: true }).waitFor({ timeout: 15000 }),
    );
    const pageSize100 = Math.min(100, expectedTotal);
    await waitRows(page, pageSize100);
    check("page 1 keeps the larger size (> 50 rows)", (await rowCount(page)) === pageSize100 && pageSize100 > 50, `rows=${await rowCount(page)}`);
    await sizeSelect.selectOption("50");
    await must("dropdown back to 50 restores page 1", page.getByText(`Page 1 of ${expectedPages}`, { exact: true }).waitFor({ timeout: 15000 }));
    await waitRows(page, UI_PAGE_SIZE);

    // ── Search: unique member last name narrows to exactly one row ──
    const target = `B07${ts}`;
    await page.locator("#billing-search").fill(target);
    await waitRows(page, 1);
    check("search narrows to one row", (await rowCount(page)) === 1, target);
    const searchedCount = await countText(page);
    check("search count is 1 invoice", searchedCount === "1 invoice", searchedCount || "");
    const searchedNumber = invoiceNumbers[6];
    check(
      "searched row is the created invoice",
      await page.getByText(searchedNumber, { exact: true }).first().isVisible(),
      searchedNumber,
    );

    // ── Clear: restores the full created count and pagination ──
    await page.locator("#billing-search").fill("");
    await must("clearing search restores the count", page.getByText(`${expectedTotal} invoices`, { exact: true }).waitFor({ timeout: 30000 }));
    await waitRows(page, UI_PAGE_SIZE);
    check("clearing search restores page 1 rows", (await rowCount(page)) === UI_PAGE_SIZE);
    check(
      "clearing search restores pagination",
      (await page.getByText(/^Page 1 of \d+$/).textContent())?.trim() === `Page 1 of ${expectedPages}`,
    );
  } catch (err) {
    if (!(err && typeof err === "object" && err.named)) {
      check("unexpected failure", false, String(err).slice(0, 200));
    }
  } finally {
    // Cleanup: delete the members we created (their subscriptions, invoices,
    // and payments are retired with them), then the plan.
    if (api && memberIds.length) {
      let failed = 0;
      for (const id of memberIds) {
        try {
          const res = await api.delete(`${BASE}/api/v1/members/${id}`, { headers: auth });
          if (res.status() !== 204) {
            failed++;
            console.log(`CLEANUP FAILED ${id}: ${res.status()}`);
          }
        } catch (e) {
          failed++;
          console.log(`CLEANUP FAILED ${id}: ${String(e).slice(0, 200)}`);
        }
      }
      check("cleanup deleted all created members", failed === 0, `${memberIds.length} members`);
    } else if (memberIds.length) {
      check("cleanup deleted all created members", false, "no api session");
    }
    if (api && planId) {
      try {
        const res = await api.delete(`${BASE}/api/v1/plans/${planId}`, { headers: auth });
        check("cleanup deleted plan", res.status() === 204, String(res.status()));
      } catch (e) {
        check("cleanup deleted plan", false, String(e).slice(0, 200));
      }
    }
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
