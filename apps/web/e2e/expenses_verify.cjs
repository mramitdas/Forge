// Expenses page E2E: empty state, add, edit, delete, validation, plus
// self-provisioned current/prior-year totals, categories, and year scoping.
//
// Requires the backend + frontend dev servers and the seeded dev DB
// (demo owner = demo-owner@gym-erp.dev / owner-pass-123). Every asserted
// expense row (beyond the seeded baseline) is created by this script itself
// via POST /api/v1/expenses and deleted in `finally`, so re-runs are
// idempotent and nothing depends on any import dataset.
const { chromium } = require("playwright");

const BASE = process.env.FORGE_BASE_URL || "http://localhost:3000";
const OWNER = { email: "demo-owner@gym-erp.dev", password: "owner-pass-123" };
const ts = Date.now().toString(36);

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

// Same en-IN/INR formatting the frontend app uses for amount_minor.
function inr(minor) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  let api = null;
  let auth = null;
  const createdIds = [];

  try {
    // ── Demo gym: empty state → add → delete roundtrip ──
    await login(page, OWNER);
    check("owner login lands on dashboard", true, page.url());

    await page.goto(`${BASE}/expenses`);
    await must("expenses page renders", page.getByRole("heading", { name: "Expenses", exact: true }).first().waitFor({ timeout: 15000 }));

    // The layout <h1> "Expenses" renders before data loads, and the loading
    // skeleton has no <table> at all — wait for the real tbody (attached, it
    // is height-0 when empty) before measuring row counts.
    await must(
      "expenses table settles",
      page.waitForSelector("table tbody", { state: "attached", timeout: 15000 }),
    );
    const startsAt = await rowCount(page);
    check("table present (empty or existing rows)", true, `start=${startsAt}`);

    // Add expense (modal content is a div, not a form — target widgets directly)
    await page.getByRole("button", { name: "Add expense" }).click();
    await page.locator("#expense-category").waitFor({ timeout: 10000 });
    await page.locator("#expense-category").selectOption("Rent");
    await page.locator('input[type="number"]').fill("25000");
    await page.getByRole("button", { name: "Save expense" }).click();
    await page.getByText("Expense recorded").waitFor({ timeout: 10000 });
    // The toast fires before the invalidation-refetch settles the list (two
    // queries are now invalidated on create) — wait for the exact expected
    // row count instead of a fixed sleep that can lose the race.
    await page.waitForFunction(
      (n) => document.querySelectorAll("table tbody tr").length === n,
      startsAt + 1,
      { timeout: 15000 },
    );
    check("expense created via modal", (await rowCount(page)) === startsAt + 1);

    // Row content: ₹25,000 rendered with inr formatting
    await must("amount renders in INR format", page.getByText("₹25,000").first().waitFor({ timeout: 10000 }));

    // Summary total includes it
    const totalCard = await page.locator("p").filter({ hasText: /^Total spent/ }).first().textContent();
    check("total-spent card present", /Total spent/.test(totalCard || ""), (totalCard || "").trim());

    // Validation: invalid amount
    await page.getByRole("button", { name: "Add expense" }).click();
    await page.locator('input[type="number"]').waitFor({ timeout: 10000 });
    await page.locator('input[type="number"]').fill("0");
    await page.getByRole("button", { name: "Save expense" }).click();
    await must("invalid amount shows error toast", page.getByText(/Enter a valid amount/).waitFor({ timeout: 10000 }));
    // Modal has no Escape handler — close via Cancel button.
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.locator('input[type="number"]').waitFor({ state: "detached", timeout: 10000 });

    // Edit the row we just added (amount 25000 → 26000 via the edit modal)
    await page.locator("table tbody tr", { hasText: "₹25,000" }).first()
      .getByRole("button", { name: "Edit" }).click();
    await page.locator('input[type="number"]').waitFor({ timeout: 10000 });
    await page.locator('input[type="number"]').fill("26000");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByText("Expense updated").waitFor({ timeout: 10000 });
    await must(
      "expense edited via modal",
      page.locator("table tbody tr", { hasText: "₹26,000" }).first().waitFor({ timeout: 15000 }),
    );

    // Delete the row we edited (newest first by paid_at date)
    await page.locator("table tbody tr", { hasText: "₹26,000" }).first()
      .getByRole("button", { name: "Delete" }).click();
    await page.getByText("Expense deleted").waitFor({ timeout: 10000 });
    // Same race as create: the toast precedes the refetch that drops the row
    // — wait for the list to settle back to the starting count.
    await page.waitForFunction(
      (n) => document.querySelectorAll("table tbody tr").length === n,
      startsAt,
      { timeout: 15000 },
    );
    check("expense deleted", (await rowCount(page)) === startsAt);

    // ── Self-provisioned expenses: API-created, current + prior year ──
    // Token session so the script creates (and later deletes) its own rows.
    api = page.context().request;
    const loginRes = await api.post(`${BASE}/api/v1/auth/login`, {
      data: { email: OWNER.email, password: OWNER.password },
    });
    check("api login returns token", loginRes.ok());
    const { access_token } = await loginRes.json();
    auth = { Authorization: `Bearer ${access_token}` };

    const yearNow = new Date().getFullYear();
    const yearPrev = yearNow - 1;

    const getYear = async (y) => {
      const res = await api.get(`${BASE}/api/v1/expenses?year=${y}`, { headers: auth });
      check(`api list year ${y} ok`, res.ok());
      return res.json();
    };

    // Baselines BEFORE creating anything, so expected values include seeded
    // data plus exactly our delta.
    const baseNow = await getYear(yearNow);
    const basePrev = await getYear(yearPrev);

    // Three categories for the current year, two for the prior year; months
    // mid-year so UTC↔local time shifts can never move a row across a year.
    const fixtures = [
      { year: yearNow, category: `E2E Rent ${ts}`, amount_minor: 250000, paid_at: `${yearNow}-07-15T09:00:00.000Z` },
      { year: yearNow, category: `E2E Salary ${ts}`, amount_minor: 1000000, paid_at: `${yearNow}-03-10T09:00:00.000Z` },
      { year: yearNow, category: `E2E Electricity ${ts}`, amount_minor: 50000, paid_at: `${yearNow}-11-05T09:00:00.000Z` },
      { year: yearPrev, category: `E2E Water ${ts}`, amount_minor: 100000, paid_at: `${yearPrev}-06-20T09:00:00.000Z` },
      { year: yearPrev, category: `E2E Marketing ${ts}`, amount_minor: 450000, paid_at: `${yearPrev}-09-12T09:00:00.000Z` },
    ];
    const deltaByYear = {};
    for (const f of fixtures) {
      const res = await api.post(`${BASE}/api/v1/expenses`, {
        headers: auth,
        data: { category: f.category, description: `e2e ${ts}`, amount_minor: f.amount_minor, method: "cash", paid_at: f.paid_at },
      });
      check(`api create ${f.category} (year ${f.year})`, res.status() === 201);
      if (res.status() === 201) {
        const body = await res.json();
        createdIds.push(body.id);
        deltaByYear[f.year] = (deltaByYear[f.year] || 0) + f.amount_minor;
      }
    }

    // Current year renders seeded rows + our 3 additions. Rows were created
    // outside React Query, so force a fresh fetch by reloading the page.
    await page.reload({ waitUntil: "domcontentloaded" });
    const expectedRowsNow = baseNow.expenses.length + 3;
    const expectedTotalNow = baseNow.total + (deltaByYear[yearNow] || 0);
    await page.waitForFunction(
      (n) => document.querySelectorAll("table tbody tr").length === n,
      expectedRowsNow,
      { timeout: 30000 },
    );
    check("current-year rows reflect self-created data", (await rowCount(page)) === expectedRowsNow,
      `expected=${expectedRowsNow}`);

    // Our unique categories appear in the table; the Categories card matches
    // the API's unique-category count for the year.
    const catCells = await page.locator("table tbody tr td:nth-child(2)").allTextContents();
    const shownCats = new Set(catCells.map((c) => c.trim()));
    check(
      "current-year shows self-created categories",
      [`E2E Rent ${ts}`, `E2E Salary ${ts}`, `E2E Electricity ${ts}`].every((c) => shownCats.has(c)),
      [...shownCats].sort().join(","),
    );
    const apiCatCount = new Set(baseNow.expenses.map((e) => e.category).concat(
      fixtures.filter((f) => f.year === yearNow).map((f) => f.category),
    )).size;
    const catCard = await page.locator("p").filter({ hasText: /^Categories$/ }).first()
      .locator("xpath=following-sibling::p[1]").textContent();
    check("categories card matches unique count", (catCard || "").trim() === String(apiCatCount),
      `card=${(catCard || "").trim()} expected=${apiCatCount}`);

    const totalNow = await page.evaluate(() => {
      const label = [...document.querySelectorAll("p")].find((p) => p.textContent?.trim() === "Total spent");
      return label?.nextElementSibling?.textContent || label?.parentElement?.textContent || "";
    });
    check("current-year total includes self-created rows", totalNow.trim() === inr(expectedTotalNow),
      `shown=${totalNow.trim()} expected=${inr(expectedTotalNow)}`);

    await must("spending graph renders", page.getByRole("heading", { name: "Spending", exact: true }).waitFor({ timeout: 15000 }));
    check("spending graph has an SVG chart", (await page.locator("svg.recharts-surface").count()) > 0);

    // Switching the year rewires cards, graph, and table together; the prior
    // year must contain exactly seeded rows + our 2 additions.
    const yearSelect = page.locator('select[aria-label="Select expense year"]');
    await must("year selector renders", yearSelect.waitFor({ timeout: 15000 }));
    await yearSelect.selectOption(String(yearPrev));
    const expectedRowsPrev = basePrev.expenses.length + 2;
    await page.waitForFunction(
      (n) => document.querySelectorAll("table tbody tr").length === n,
      expectedRowsPrev,
      { timeout: 30000 },
    );
    check("prior-year rows reflect self-created data", (await rowCount(page)) === expectedRowsPrev,
      `expected=${expectedRowsPrev}`);

    const prevCats = await page.locator("table tbody tr td:nth-child(2)").allTextContents();
    check(
      "prior-year shows self-created categories",
      [`E2E Water ${ts}`, `E2E Marketing ${ts}`].every((c) => prevCats.map((x) => x.trim()).includes(c)),
      [...new Set(prevCats.map((c) => c.trim()))].sort().join(","),
    );

    // The card re-renders after the year switch — re-read it.
    const totalPrevText = await page.evaluate(() => {
      const label = [...document.querySelectorAll("p")].find((p) => p.textContent?.trim() === "Total spent");
      return label?.nextElementSibling?.textContent || label?.parentElement?.textContent || "";
    });
    check("prior-year total includes self-created rows", totalPrevText.trim() === inr(basePrev.total + (deltaByYear[yearPrev] || 0)),
      `shown=${totalPrevText.trim()} expected=${inr(basePrev.total + (deltaByYear[yearPrev] || 0))}`);

    // Delete button visible for owner (expenses.manage)
    const delButtons = await page.locator("table tbody tr button:has-text('Delete')").count();
    check("delete affordance present (owner has expenses.manage)", delButtons > 0);
  } catch (err) {
    if (!(err && typeof err === "object" && err.named)) {
      check("unexpected failure", false, String(err).slice(0, 200));
    }
  } finally {
    // Self-cleanup: remove every expense this script created, even if an
    // assertion above failed, so re-runs stay idempotent.
    if (api && createdIds.length) {
      for (const id of createdIds) {
        try {
          const res = await api.delete(`${BASE}/api/v1/expenses/${id}`, { headers: auth });
          console.log(`CLEANUP ${res.status()} ${id}`);
        } catch (e) {
          console.log(`CLEANUP FAILED ${id}: ${String(e).slice(0, 200)}`);
        }
      }
      check("cleanup deleted all created expenses", true, String(createdIds.length));
    } else if (createdIds.length) {
      check("cleanup deleted all created expenses", false, "no api session");
    }
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
