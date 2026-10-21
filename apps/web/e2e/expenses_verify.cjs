// Expenses page E2E: empty state, add, edit, delete, validation, imported data.
//
// Requires the backend + frontend dev servers and the imported dev DB.
// demo-owner sees an empty demo gym; the evolve-gym owner sees the 58
// imported GMS expenses (₹6,99,210 total).
const { chromium } = require("playwright");

const BASE = process.env.FORGE_BASE_URL || "http://localhost:3000";
const OWNER = { email: "demo-owner@gym-erp.dev", password: "owner-pass-123" };
const IMPORTED_OWNER = { email: "mramitdas99@gmail.com", password: "evolve-import-2026" };
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

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

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
    await page.locator("select").first().waitFor({ timeout: 10000 });
    await page.locator("select").first().selectOption("Rent");
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

    // ── Imported gym: 58 GMS expenses, categories, total ──
    await page.goto(`${BASE}/login`);
    await login(page, IMPORTED_OWNER);
    check("imported owner login works", true);

    await page.goto(`${BASE}/expenses`);
    await page.waitForSelector("table tbody tr", { timeout: 15000 });
    const importedRows = await rowCount(page);
    check("imported expenses render", importedRows > 0, `rows=${importedRows}`);

    const cats = await page.locator("table tbody tr td:nth-child(2)").allTextContents();
    const unique = [...new Set(cats.map((c) => c.trim()))].sort();
    check("categories match GMS import", unique.join(",") === "Electricity,Rent,Salary", unique.join(","));

    const totalText = await page.evaluate(() => {
      const label = [...document.querySelectorAll("p")].find((p) => p.textContent?.trim() === "Total spent");
      return label?.nextElementSibling?.textContent || label?.parentElement?.textContent || "";
    });
    check("total spent is ₹6,99,210", totalText.includes("6,99,210"), totalText.replace(/\s+/g, " ").trim());

    // Delete button visible for owner (expenses.manage)
    const delButtons = await page.locator("table tbody tr button:has-text('Delete')").count();
    check("delete affordance present (owner has expenses.manage)", delButtons > 0);
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
