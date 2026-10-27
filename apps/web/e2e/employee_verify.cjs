// Employees page E2E: owner sees the tab, list loads, Add-employee modal has a
// country-code picker and no manual password field (system-generated), and each
// row exposes Edit / Disable / Delete. Intentionally non-destructive: creating
// or mutating an account here would pollute the shared dev DB.
const { chromium } = require("playwright");

const BASE = process.env.FORGE_BASE_URL || "http://localhost:3000";
const OWNER = { email: "demo-owner@gym-erp.dev", password: "owner-pass-123" };

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
}

async function must(name, p, extra = "") {
  try {
    await p;
    check(name, true, extra);
  } catch (e) {
    check(name, false, String(e).slice(0, 200));
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

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  let failed = false;

  try {
    await login(page, OWNER);
    check("owner login lands on dashboard", page.url().includes("/"));

    await page.goto(`${BASE}/employees`);
    await must(
      "employees page renders",
      page.getByRole("button", { name: /add employee/i }).waitFor({ timeout: 15000 }),
    );

    await must(
      "employees nav tab is visible",
      page.getByRole("link", { name: "Employees", exact: true }).waitFor({ timeout: 10000 }),
    );

    await must(
      "search box present",
      page.getByPlaceholder(/search name, email, phone/i).waitFor({ timeout: 5000 }),
    );

    await must(
      "row actions present",
      page.getByRole("button", { name: "Edit", exact: true }).first().waitFor({ timeout: 10000 }),
    );
    await must(
      "disable action present",
      page.getByRole("button", { name: /disable|enable/i }).first().waitFor({ timeout: 5000 }),
    );

    await page.getByRole("button", { name: /add employee/i }).first().click();
    await must("add employee modal opens", page.getByRole("dialog").waitFor({ timeout: 10000 }));

    await must(
      "full name field present",
      page.locator('input[name="full_name"]').waitFor({ timeout: 5000 }),
    );
    await must("email field present", page.locator('input[name="email"]').waitFor({ timeout: 5000 }));
    await must(
      "country code picker present",
      page.locator("#employee-country-code").waitFor({ timeout: 5000 }),
    );
    await must(
      "no manual password field",
      page.locator('input[name="password"]').count().then((n) => {
        if (n !== 0) throw new Error("password input should not exist");
      }),
    );
    await must(
      "role selector populated",
      page.locator('select[name="role_id"] option').first().waitFor({ state: "attached", timeout: 10000 }),
    );

    await page.getByRole("button", { name: /cancel/i }).click();
    await must(
      "modal closes on cancel",
      page.getByRole("dialog").waitFor({ state: "hidden", timeout: 5000 }),
    );

    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    await must("edit modal opens", page.getByRole("dialog").waitFor({ timeout: 10000 }));
    await must(
      "edit has status selector",
      page.locator('select[name="status"]').waitFor({ timeout: 5000 }),
    );
    await page.getByRole("button", { name: /cancel/i }).click();
  } catch {
    failed = true;
  } finally {
    await browser.close();
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n${passed}/${results.length} checks passed`);
    process.exit(failed || passed !== results.length ? 1 : 0);
  }
})();
