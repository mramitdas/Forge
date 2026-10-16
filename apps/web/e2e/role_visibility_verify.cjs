// Role visibility E2E: per-role nav gating + "Restricted area" enforcement.
//
// Source of truth for permissions: backend/app/modules/identity/permissions.py
// Nav gating + denied empty state: apps/web/src/app/(app)/layout.tsx
//
// Requires the backend + frontend dev servers running locally and a seeded
// dev DB (demo gym users: receptionist@ / trainer@ / branch-manager@ /
// demo-owner@gym-erp.dev).
const { chromium } = require("playwright");

const BASE = process.env.FORGE_BASE_URL || "http://localhost:3000";

const USERS = {
  receptionist: { email: "receptionist@gym-erp.dev", password: "receptionist-pass-123" },
  trainer: { email: "trainer@gym-erp.dev", password: "trainer-pass-123" },
  branchManager: { email: "branch-manager@gym-erp.dev", password: "manager-pass-123" },
  owner: { email: "demo-owner@gym-erp.dev", password: "owner-pass-123" },
};

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
}

async function login(page, user) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="email"]').fill(user.email);
  await page.locator('input[type="password"]').fill(user.password);
  await page.getByRole("button", { name: /enter forge/i }).click();
  await page.waitForURL(/\/$/, { timeout: 20000 });
  await settle(page);
}

// Wait for the app shell header (renders only once `me` is loaded, i.e. once
// nav + permission gating are final), then a short settle for page content.
async function settle(page) {
  await page.locator("header h1").waitFor({ timeout: 20000 });
  await page.waitForTimeout(700);
}

async function gotoPage(page, path) {
  await page.goto(`${BASE}${path}`);
  await settle(page);
}

async function navCount(page, href) {
  return page.locator(`nav a[href="${href}"]`).count();
}

async function navChecks(page, label, present, absent) {
  const missing = [];
  for (const href of present) {
    if ((await navCount(page, href)) === 0) missing.push(href);
  }
  check(`${label}: nav shows allowed links`, missing.length === 0, missing.length ? `missing ${missing.join(", ")}` : present.join(", "));

  const leaked = [];
  for (const href of absent) {
    if ((await navCount(page, href)) > 0) leaked.push(href);
  }
  check(`${label}: nav hides forbidden links`, leaked.length === 0, leaked.length ? `leaked ${leaked.join(", ")}` : `absent ${absent.join(", ")}`);
}

async function isRestricted(page) {
  return (await page.getByText("Restricted area", { exact: true }).count()) > 0;
}

async function forbiddenCheck(page, label, path) {
  await gotoPage(page, path);
  check(`${label}: direct ${path} renders "Restricted area"`, await isRestricted(page));
}

async function allowedCheck(page, label, paths) {
  const bad = [];
  for (const path of paths) {
    await gotoPage(page, path);
    const text = (await page.locator("main").innerText()).trim();
    if (text.length === 0 || text.includes("Restricted area")) bad.push(path);
  }
  check(`${label}: allowed pages render real content`, bad.length === 0, bad.length ? `restricted/empty: ${bad.join(", ")}` : paths.join(", "));
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    // ── Receptionist: front-desk, no expenses/reports/roles ──
    await login(page, USERS.receptionist);
    await navChecks(
      page,
      "receptionist",
      ["/members", "/checkins", "/plans", "/subscriptions", "/billing", "/branches"],
      ["/expenses", "/roles"],
    );
    await forbiddenCheck(page, "receptionist", "/expenses");
    await forbiddenCheck(page, "receptionist", "/roles");
    await allowedCheck(page, "receptionist", ["/billing", "/checkins"]);

    await gotoPage(page, "/members");
    const recCreate = await page.getByRole("button", { name: /add member/i }).count();
    check('receptionist: /members shows "Add member" button', recCreate >= 1, `count=${recCreate}`);

    // ── Trainer: view/check-in only, no billing/expenses/members.create/roles ──
    await login(page, USERS.trainer);
    await navChecks(
      page,
      "trainer",
      ["/members", "/checkins", "/plans", "/notifications", "/branches"],
      ["/billing", "/subscriptions", "/expenses", "/roles"],
    );
    await forbiddenCheck(page, "trainer", "/expenses");
    await forbiddenCheck(page, "trainer", "/roles");
    await allowedCheck(page, "trainer", ["/members", "/checkins"]);

    await gotoPage(page, "/members");
    const trainerCreate = await page.getByRole("button", { name: /add member/i }).count();
    check('trainer: /members hides "Add member" button (no members.create)', trainerCreate === 0, `count=${trainerCreate}`);

    // ── Branch Manager: receptionist set + expenses, still no roles ──
    await login(page, USERS.branchManager);
    await navChecks(
      page,
      "branch-manager",
      ["/members", "/checkins", "/plans", "/subscriptions", "/billing", "/expenses", "/branches"],
      ["/roles"],
    );
    await forbiddenCheck(page, "branch-manager", "/roles");
    await allowedCheck(page, "branch-manager", ["/expenses", "/billing"]);

    // ── Gym Owner control: everything accessible, nothing hidden ──
    await login(page, USERS.owner);
    const ownerNavMissing = [];
    for (const href of ["/expenses", "/roles", "/billing", "/members"]) {
      if ((await navCount(page, href)) === 0) ownerNavMissing.push(href);
    }
    check("owner: nav shows all links (expenses, roles, billing, members)", ownerNavMissing.length === 0, ownerNavMissing.length ? `missing ${ownerNavMissing.join(", ")}` : "all present");
    await allowedCheck(page, "owner", ["/expenses", "/roles", "/billing", "/members"]);
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
