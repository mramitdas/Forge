// Role visibility E2E: per-role nav gating + "Restricted area" enforcement.
//
// Source of truth for permissions: backend/app/modules/identity/permissions.py
// Nav gating + denied empty state: apps/web/src/app/(app)/layout.tsx
//
// Requires the backend + frontend dev servers running locally and a seeded
// dev DB (demo owner = demo-owner@gym-erp.dev / owner-pass-123). The script
// provisions two throwaway roles + employees through the API and cleans them
// up afterwards; it never touches the Gym Owner role.
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const BASE = process.env.FORGE_BASE_URL || "http://localhost:3000";
const OWNER = { email: "demo-owner@gym-erp.dev", password: "owner-pass-123" };
const TS = Date.now().toString(36);

const USERS = {
  viewer: { email: `e2e-viewer-${TS}@gym-erp.dev`, password: "E2e-Viewer-123!" },
  manager: { email: `e2e-manager-${TS}@gym-erp.dev`, password: "E2e-Manager-123!" },
  owner: OWNER,
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
  const api = page.context().request;
  const roleIds = [];
  const employeeIds = [];
  let auth = null;

  try {
    // Owner API session for fixtures.
    const loginRes = await api.post(`${BASE}/api/v1/auth/login`, { data: OWNER });
    const { access_token } = await loginRes.json();
    auth = { Authorization: `Bearer ${access_token}` };

    const viewerRole = await api.post(`${BASE}/api/v1/permissions/roles`, {
      headers: auth,
      data: {
        name: `E2E Viewer ${TS}`,
        description: "View-only members and check-ins",
        permission_codes: ["members.view", "attendance.view", "tenancy.view"],
        branch_scope: "all",
      },
    });
    check("fixture: view-only role created", viewerRole.status() === 201, `status ${viewerRole.status()}`);
    roleIds.push((await viewerRole.json()).id);

    const managerRole = await api.post(`${BASE}/api/v1/permissions/roles`, {
      headers: auth,
      data: {
        name: `E2E Manager ${TS}`,
        description: "Front-desk manager",
        permission_codes: [
          "members.manage",
          "attendance.view",
          "membership.view",
          "billing.view",
          "expenses.view",
          "notifications.view",
          "tenancy.view",
        ],
        branch_scope: "all",
      },
    });
    check("fixture: manager role created", managerRole.status() === 201, `status ${managerRole.status()}`);
    roleIds.push((await managerRole.json()).id);

    for (const [user, roleIndex, name] of [
      [USERS.viewer, 0, "E2E Viewer"],
      [USERS.manager, 1, "E2E Manager"],
    ]) {
      const emp = await api.post(`${BASE}/api/v1/employees`, {
        headers: auth,
        data: {
          email: user.email,
          full_name: `${name} ${TS}`,
          password: user.password,
          role_ids: [roleIds[roleIndex]],
        },
      });
      check(`fixture: employee ${user.email} created`, emp.status() === 201, `status ${emp.status()}`);
      employeeIds.push((await emp.json()).id);
    }

    // ── Viewer: members + check-ins + branches, no writes ──
    await login(page, USERS.viewer);
    await navChecks(
      page,
      "viewer",
      ["/members", "/checkins", "/branches"],
      ["/billing", "/plans", "/subscriptions", "/expenses", "/roles"],
    );
    await forbiddenCheck(page, "viewer", "/expenses");
    await forbiddenCheck(page, "viewer", "/roles");
    await allowedCheck(page, "viewer", ["/members", "/checkins"]);

    await gotoPage(page, "/members");
    const viewerCreate = await page.getByRole("button", { name: /add member/i }).count();
    check('viewer: /members hides "Add member" button (no members.manage)', viewerCreate === 0, `count=${viewerCreate}`);

    // ── Manager: reception set + expenses, still no roles ──
    await login(page, USERS.manager);
    await navChecks(
      page,
      "manager",
      ["/members", "/checkins", "/plans", "/billing", "/expenses", "/branches"],
      ["/roles"],
    );
    await forbiddenCheck(page, "manager", "/roles");
    await allowedCheck(page, "manager", ["/expenses", "/billing"]);

    await gotoPage(page, "/members");
    const managerCreate = await page.getByRole("button", { name: /add member/i }).count();
    check('manager: /members shows "Add member" button (members.manage)', managerCreate >= 1, `count=${managerCreate}`);

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
    if (auth) {
      for (const id of employeeIds) {
        try {
          await api.delete(`${BASE}/api/v1/employees/${id}`, { headers: auth });
        } catch {}
      }
      for (const id of roleIds) {
        try {
          await api.delete(`${BASE}/api/v1/permissions/roles/${id}`, { headers: auth });
        } catch {}
      }
      // There is no employee-delete endpoint and the role delete above 409s
      // while assignments exist. Remove the throwaway rows directly from the
      // dev DB.
      try {
        const rid = roleIds.map((id) => `'${id}'`).join(",");
        const uid = employeeIds.map((id) => `'${id}'`).join(",");
        const userSql = uid
          ? `DELETE FROM user_roles WHERE user_id IN (${uid}); ` +
            `DELETE FROM credentials WHERE user_id IN (${uid}); ` +
            `DELETE FROM users WHERE id IN (${uid}); `
          : "";
        execFileSync(
          "psql",
          [
            "-q",
            "-U",
            process.env.PGUSER || "amit",
            "-h",
            process.env.PGHOST || "localhost",
            "-d",
            process.env.PGDATABASE || "gym_erp",
            "-c",
            userSql +
              `DELETE FROM user_roles WHERE role_id IN (${rid}); ` +
              `DELETE FROM role_permissions WHERE role_id IN (${rid}); ` +
              `DELETE FROM roles WHERE id IN (${rid});`,
          ],
          { stdio: "ignore" },
        );
      } catch {}
    }
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
