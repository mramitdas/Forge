// Plans page E2E: create / edit / disable / enable / delete with branch scope.
//
// Requires the backend + frontend dev servers running locally and a seeded
// dev DB (demo owner = demo-owner@gym-erp.dev / owner-pass-123).
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const OWNER = { email: "demo-owner@gym-erp.dev", password: "owner-pass-123" };
const ts = Date.now().toString(36);
const PLAN_NAME = `Plan ${ts}`;
const PLAN_SLUG = `plan-${ts}`;

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

    await page.goto(`${BASE}/plans`);
    await page.getByRole("heading", { name: /plans/i }).first().waitFor({ timeout: 20000 });
    check("plans page renders", true);

    // ── Create plan ──
    await page.getByRole("button", { name: /new plan/i }).click();
    const createForm = page.locator("form").last();
    await createForm.locator("input").first().fill(PLAN_NAME);
    await createForm.locator("input").nth(1).fill(PLAN_SLUG);
    await createForm.locator('input[placeholder*="150000"]').fill("125000");
    await createForm.locator('input[placeholder="0"]').fill("5000");
    await createForm.getByRole("button", { name: /create plan/i }).click();
    await page.getByText(PLAN_NAME, { exact: true }).waitFor({ timeout: 15000 });
    check("plan created and visible", true);

    const planCard = (name) => page.locator("div.glass", { hasText: name }).last();
    const card = planCard(PLAN_NAME);
    await card.getByText("All branches", { exact: true }).first().waitFor({ timeout: 10000 });
    check("common plan shows All branches scope", true);

    // ── Disable / enable ──
    await card.getByRole("button", { name: "Disable" }).click();
    await page.getByRole("button", { name: /disable plan/i }).click();
    await page.getByText("Disabled", { exact: true }).waitFor({ timeout: 10000 });
    check("plan disabled (badge visible)", true);

    const disabledCard = planCard(PLAN_NAME);
    await disabledCard.getByRole("button", { name: "Enable" }).click();
    await page.getByRole("button", { name: /new plan/i }).waitFor({ timeout: 10000 });
    await disabledCard.getByRole("button", { name: "Subscribe" }).waitFor({ timeout: 10000 });
    check("plan enabled and subscribe button back", true);

    // ── Edit plan ──
    const editCard = planCard(PLAN_NAME);
    await editCard.getByRole("button", { name: "Edit" }).click();
    const editForm = page.locator("form").last();
    await editForm.locator("input").first().fill(`${PLAN_NAME} v2`);
    await editForm.getByRole("button", { name: /save changes/i }).click();
    await page.getByText(`${PLAN_NAME} v2`, { exact: true }).waitFor({ timeout: 10000 });
    check("plan edited (name updated)", true);

    // ── Delete plan ──
    const deleteCard = planCard(`${PLAN_NAME} v2`);
    await deleteCard.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: /delete plan/i }).click();
    await page
      .getByText(`${PLAN_NAME} v2`, { exact: true })
      .waitFor({ state: "detached", timeout: 10000 });
    check("plan deleted from grid", true);
  } catch (err) {
    check("unexpected failure", false, String(err).slice(0, 200));
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
