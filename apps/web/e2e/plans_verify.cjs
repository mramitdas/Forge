// Plans page E2E: create / edit / disable / enable / delete with branch scope.
//
// Requires the backend + frontend dev servers running locally and a seeded
// dev DB (demo owner = demo-owner@gym-erp.dev / owner-pass-123).
const { chromium } = require("playwright");

const BASE = process.env.FORGE_BASE_URL || "http://localhost:3000";
const OWNER = { email: "demo-owner@gym-erp.dev", password: "owner-pass-123" };
const ts = Date.now().toString(36);
const PLAN_NAME = `Plan ${ts}`;
const PLAN_SLUG = `plan-${ts}`;

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

    await page.goto(`${BASE}/plans`);
    await must("plans page renders", page.getByRole("heading", { name: /plans/i }).first().waitFor({ timeout: 20000 }));

    // ── Create plan ──
    await page.getByRole("button", { name: /new plan/i }).click();
    const createForm = page.locator("form").last();
    await createForm.locator("input").first().fill(PLAN_NAME);
    // Leave slug blank → should auto-generate from name (no branch → name only).
    await createForm.locator('input[placeholder*="150000"]').fill("125000");
    await createForm.locator('input[placeholder="0"]').fill("5000");
    await createForm.getByRole("button", { name: /create plan/i }).click();
    await must("plan created and visible", page.getByText(PLAN_NAME, { exact: true }).waitFor({ timeout: 15000 }));

    // Auto-generated slug = slugified plan name.
    const autoSlug = PLAN_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const planCard = (name) => page.locator("div.glass", { hasText: name }).last();
    const card = planCard(PLAN_NAME);
    await must("common plan shows All branches scope", card.getByText("All branches", { exact: true }).first().waitFor({ timeout: 10000 }));

    // Duplicate slug → detailed error, not a generic one.
    await page.getByRole("button", { name: /new plan/i }).click();
    const dupForm = page.locator("form").last();
    await dupForm.locator("input").first().fill(`${PLAN_NAME} dup`);
    await dupForm.locator("input").nth(1).fill(autoSlug);
    await dupForm.getByRole("button", { name: /create plan/i }).click();
    await must("duplicate slug shows detailed error", page.getByText(/slug already exists/i).waitFor({ timeout: 10000 }));
    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    // ── Disable / enable ──
    await card.getByRole("button", { name: "Disable" }).click();
    await page.getByRole("button", { name: /disable plan/i }).click();
    await must("plan disabled (badge visible)", page.getByText("Disabled", { exact: true }).waitFor({ timeout: 10000 }));

    const disabledCard = planCard(PLAN_NAME);
    await disabledCard.getByRole("button", { name: "Enable" }).click();
    await page.getByRole("button", { name: /new plan/i }).waitFor({ timeout: 10000 });
    await must("plan enabled and subscribe button back", disabledCard.getByRole("button", { name: "Subscribe" }).waitFor({ timeout: 10000 }));

    // ── Edit plan ──
    const editCard = planCard(PLAN_NAME);
    await editCard.getByRole("button", { name: "Edit" }).click();
    const editForm = page.locator("form").last();
    await editForm.locator("input").first().fill(`${PLAN_NAME} v2`);
    await editForm.getByRole("button", { name: /save changes/i }).click();
    await must("plan edited (name updated)", page.getByText(`${PLAN_NAME} v2`, { exact: true }).waitFor({ timeout: 10000 }));

    // ── Delete plan ──
    const deleteCard = planCard(`${PLAN_NAME} v2`);
    await deleteCard.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: /delete plan/i }).click();
    await must(
      "plan deleted from grid",
      page
        .getByText(`${PLAN_NAME} v2`, { exact: true })
        .waitFor({ state: "detached", timeout: 10000 }),
    );
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
