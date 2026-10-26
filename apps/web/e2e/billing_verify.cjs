// Billing page E2E: year selector, cash-year summary, collections chart,
// search, and pagination. Read-only — no fixtures are mutated.
//
// Requires the backend + frontend dev servers and the imported dev DB.
// demo-owner sees the demo gym (invoices in the current year); the
// evolve-gym owner sees the imported GMS invoices (2024: 491,
// 2025: 1,331, 2026: 143).
const { chromium } = require("playwright");

const BASE = process.env.FORGE_BASE_URL || "http://localhost:3000";
const OWNER = { email: "demo-owner@gym-erp.dev", password: "owner-pass-123" };
const IMPORTED_OWNER = { email: "mramitdas99@gmail.com", password: "evolve-import-2026" };
const CURRENT_YEAR = new Date().getFullYear();

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

  try {
    // ── Demo gym: current-year view, year switch, search, pagination ──
    await login(page, OWNER);
    check("owner login lands on dashboard", true, page.url());

    await page.goto(`${BASE}/billing`);
    await must(
      "billing page renders",
      page.getByRole("heading", { name: "Billing", exact: true }).first().waitFor({ timeout: 15000 }),
    );
    await must("invoice table settles", page.waitForSelector("table tbody", { state: "attached", timeout: 15000 }));

    await must("year selector renders", yearSelect(page).waitFor({ timeout: 10000 }));
    check("year defaults to the current year", (await yearSelect(page).inputValue()) === String(CURRENT_YEAR));

    const count = await countText(page);
    check("invoice count is year-scoped", /^\d+ invoices?$/.test(count || ""), count);

    await must("collected card shows cash basis", page.getByText(`Received in ${CURRENT_YEAR}`, { exact: true }).waitFor());
    await must("outstanding card shows issue basis", page.getByText(`Issued in ${CURRENT_YEAR}`, { exact: true }).first().waitFor());
    const collected = await statValue(page, "Collected");
    check("collected renders as INR", /^₹[\d,]+$/.test(collected), collected);

    await must(
      "collections chart renders",
      chart(page).waitFor({ timeout: 15000 }),
    );
    check("collections chart has an SVG", (await page.locator('svg.recharts-surface').count()) > 0);

    const pageLabel = await page.getByText(/^Page 1 of \d+$/).textContent();
    const totalPages = Number((pageLabel || "").match(/of (\d+)/)?.[1] || 1);
    check("pagination reflects the year total", totalPages > 1, pageLabel || "");

    if (totalPages > 1) {
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await must("next page renders", page.getByText(/^Page 2 of/).waitFor());
      check("page 2 keeps page size", (await rowCount(page)) === 20);
      await page.getByRole("button", { name: "Previous", exact: true }).click();
      await must("previous page returns", page.getByText(/^Page 1 of/).waitFor());
    }

    const firstNumber = (await page.locator("table tbody tr").first().locator("a").first().textContent())?.trim();
    await page.locator("#billing-search").fill(firstNumber || "");
    await waitRows(page, 1);
    check("search narrows the year to one invoice", (await rowCount(page)) === 1, firstNumber || "");
    check("searched invoice is the first row", await page.getByText(firstNumber, { exact: true }).first().isVisible());
    await page.locator("#billing-search").fill("");
    await waitRows(page, 20);
    check("clearing search restores the page", (await rowCount(page)) === 20);

    await yearSelect(page).selectOption(String(CURRENT_YEAR - 1));
    await must(
      "empty prior year explains itself",
      page.getByText(`No invoices issued in ${CURRENT_YEAR - 1}.`).waitFor({ timeout: 20000 }),
    );
    check("prior-year count is zero", (await countText(page)) === "0 invoices");
    check("prior-year collected is zero", (await statValue(page, "Collected")) === "₹0");
    check(
      "chart follows the year",
      (await chart(page).getAttribute("aria-label")) === `Payments received in ${CURRENT_YEAR - 1}`,
    );
    check("empty year has no bars", (await page.locator('[role="img"] .recharts-bar-rectangle').count()) === 0);

    await yearSelect(page).selectOption(String(CURRENT_YEAR));
    await waitRows(page, 20);
    check("switching back restores rows", (await rowCount(page)) === 20);

    // ── Imported gym: cross-year GMS invoices + monthly collections ──
    await page.goto(`${BASE}/login`);
    await login(page, IMPORTED_OWNER);
    check("imported owner login works", true);

    await page.goto(`${BASE}/billing`);
    await must("imported billing renders", page.waitForSelector("table tbody", { state: "attached", timeout: 20000 }));

    await yearSelect(page).selectOption("2025");
    await must("2025 invoice count renders", page.getByText("1331 invoices", { exact: true }).waitFor({ timeout: 30000 }));
    check("2025 page count", await page.getByText("Page 1 of 67", { exact: true }).isVisible());
    check("2025 collected is ₹14,51,300", (await statValue(page, "Collected")) === "₹14,51,300");
    check("2025 chart has twelve months of cash", (await page.locator('[role="img"] .recharts-bar-rectangle').count()) === 12);

    await yearSelect(page).selectOption("2024");
    await must("2024 invoice count renders", page.getByText("491 invoices", { exact: true }).waitFor({ timeout: 30000 }));
    check("2024 page count", await page.getByText("Page 1 of 25", { exact: true }).isVisible());
    check("2024 keeps page size", (await rowCount(page)) === 20);

    await yearSelect(page).selectOption("2026");
    await must("2026 invoice count renders", page.getByText("143 invoices", { exact: true }).waitFor({ timeout: 30000 }));
    check("2026 page count", await page.getByText("Page 1 of 8", { exact: true }).isVisible());
    check("2026 collected is ₹1,85,100", (await statValue(page, "Collected")) === "₹1,85,100");
    check("2026 chart has three cash months", (await page.locator('[role="img"] .recharts-bar-rectangle').count()) === 3);
  } catch (err) {
    if (!(err && typeof err === "object" && err.named)) {
      check("unexpected failure", false, String(err).slice(0, 200));
    }
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
