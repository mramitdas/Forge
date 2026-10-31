// Role visibility E2E: per-role nav gating + "Restricted area" enforcement.
//
// Source of truth for permissions: backend/app/modules/identity/permissions.py
// Nav gating + denied empty state: apps/web/src/app/(app)/layout.tsx
//
// Requires the backend + frontend dev servers running locally and a seeded
// dev DB (demo owner = demo-owner@gym-erp.dev / owner-pass-123). The script
// provisions two throwaway roles + employees through the API and cleans them
// up afterwards; it never touches the Gym Owner role. The manager role gets
// the front-desk manage codes so its write affordances are exercised via the
// UI — one representative write per control (plan, member, check-in, invoice
// payment, expense, branch), all script-owned rows cleaned up in `finally`.
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

const PLAN_NAME = `E2E Mgr Plan ${TS}`;
const MEMBER_NAME = `E2E Mgr ${TS}`;
const EXPENSE_NOTE = `e2e-mgr-exp-${TS}`;
const BRANCH_NAME = `E2E Mgr Branch ${TS}`;

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
}

// Await a wait-then-check pair so a timeout fails under the check's own name
// (house pattern: gym_ops/frontdesk/expenses).
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
  const memberIds = [];
  const planIds = [];
  const expenseIds = [];
  const branchIds = [];
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
          "attendance.manage",
          "membership.view",
          "membership.manage",
          "billing.view",
          "billing.manage",
          "expenses.view",
          "expenses.manage",
          "notifications.view",
          "tenancy.view",
          "tenancy.manage",
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

    // Row-level manage actions are can-gated too — viewer sees read-only rows.
    const viewerRowEdits = await page.locator("tbody").getByRole("button", { name: "Edit", exact: true }).count();
    const viewerRowDeletes = await page.locator("tbody").getByRole("button", { name: "Delete", exact: true }).count();
    check("viewer: /members rows hide Edit/Delete actions (members.manage)", viewerRowEdits === 0 && viewerRowDeletes === 0, `edit=${viewerRowEdits} delete=${viewerRowDeletes}`);

    // Check-in write: Quick check-in card only renders with attendance.manage.
    await gotoPage(page, "/checkins");
    const viewerCheckin = await page.getByRole("heading", { name: "Quick check-in" }).count();
    check('viewer: /checkins hides "Quick check-in" card (no attendance.manage)', viewerCheckin === 0, `count=${viewerCheckin}`);

    // Branch write: "Add branch" only renders with tenancy.manage.
    await gotoPage(page, "/branches");
    const viewerAddBranch = await page.getByRole("button", { name: /add branch/i }).count();
    check('viewer: /branches hides "Add branch" button (no tenancy.manage)', viewerAddBranch === 0, `count=${viewerAddBranch}`);

    // Settings: the tenancy.manage-gated gym-profile/branch-access write card.
    await gotoPage(page, "/settings");
    const viewerGymCard = await page.getByText("Gym profile & branch access").count();
    check('viewer: /settings hides "Gym profile & branch access" write card (no tenancy.manage)', viewerGymCard === 0, `count=${viewerGymCard}`);

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

    // ── Manager write flows: one representative write per manage control ──
    // 1. Create a plan via the UI (its id feeds the member + payment writes).
    await gotoPage(page, "/plans");
    const newPlanBtn = await page.getByRole("button", { name: "New plan" }).count();
    check('manager: /plans shows "New plan" button (membership.manage)', newPlanBtn >= 1, `count=${newPlanBtn}`);
    await page.getByRole("button", { name: "New plan" }).click();
    const planForm = page.locator("form").filter({ has: page.locator("#plan-name") });
    await planForm.locator("#plan-name").fill(PLAN_NAME);
    await planForm.locator("#plan-amount").fill("250000");
    await planForm.getByRole("button", { name: "Create plan" }).click();
    await must("manager: plan created via New plan modal", page.getByText("Plan created", { exact: true }).waitFor({ timeout: 15000 }));
    let planId = null;
    {
      const res = await api.get(`${BASE}/api/v1/plans`, { headers: auth });
      planId = ((await res.json()) ?? []).find((p) => p.name === PLAN_NAME)?.id ?? null;
      if (planId) planIds.push(planId);
    }
    check("manager: created plan resolvable via API", Boolean(planId), PLAN_NAME);

    // 2. Add a member with the plan just created (auto-creates subscription
    //    + open invoice — which the Pay now write below consumes).
    await gotoPage(page, "/members");
    await page.getByRole("button", { name: /add member/i }).first().click();
    const addForm = page.locator("form").filter({ has: page.locator('select[aria-label="Plan"]') });
    await addForm.locator("#member-name").fill(MEMBER_NAME);
    await addForm.locator('select[aria-label="Plan"]').selectOption({ label: PLAN_NAME });
    await addForm.getByRole("button", { name: "Add member" }).click();
    await must("manager: member added via Add member modal", page.getByText(`${MEMBER_NAME} added`, { exact: true }).waitFor({ timeout: 15000 }));
    let managerMemberId = null;
    {
      const res = await api.get(`${BASE}/api/v1/members?search=${encodeURIComponent(MEMBER_NAME)}`, { headers: auth });
      managerMemberId = (await res.json()).items?.[0]?.id ?? null;
      if (managerMemberId) memberIds.push(managerMemberId);
    }
    check("manager: UI-created member resolvable via API", Boolean(managerMemberId), MEMBER_NAME);
    const invoiceRes = managerMemberId
      ? await api.get(`${BASE}/api/v1/invoices?member_id=${managerMemberId}&page_size=5`, { headers: auth })
      : { json: () => ({ items: [] }) };
    const invoiceNumber = (await invoiceRes.json()).items?.[0]?.number ?? null;
    check("manager: member has a script-owned open invoice", Boolean(invoiceNumber), invoiceNumber ?? "none");

    // 3. Check the member in through the Quick check-in card.
    await gotoPage(page, "/checkins");
    const quickCard = await page.getByRole("heading", { name: "Quick check-in" }).count();
    check('manager: /checkins shows "Quick check-in" card (attendance.manage)', quickCard >= 1, `count=${quickCard}`);
    await page.locator('input[placeholder="Search member…"]').fill(MEMBER_NAME);
    await page.getByRole("button", { name: "Check in", exact: true }).first().click();
    await must('manager: check-in succeeds ("Access granted")', page.getByRole("heading", { name: "Access granted" }).waitFor({ timeout: 15000 }));

    // 4. Pay the member's open invoice through the Pay now modal.
    await gotoPage(page, "/billing");
    await page.getByPlaceholder("Search invoice # or member").fill(invoiceNumber);
    const payRow = page.locator("tbody tr", { hasText: invoiceNumber });
    await must("manager: open invoice row renders", payRow.first().waitFor({ timeout: 15000 }), invoiceNumber ?? "row");
    const payVisible = await payRow.first().getByRole("button", { name: "Pay now" }).count();
    check("manager: open invoice shows Pay now (billing.manage)", payVisible === 1, `count=${payVisible}`);
    await must(
      "manager: Pay now opens capture modal",
      payRow.first().getByRole("button", { name: "Pay now" }).click({ timeout: 30000 }),
    );
    await page.getByRole("button", { name: /^Pay ₹/ }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: /^Pay ₹/ }).click();
    await must(
      "manager: Pay now captures the invoice",
      page.getByText(`${invoiceNumber} marked as paid`, { exact: false }).waitFor({ timeout: 15000 }),
      invoiceNumber ?? "none",
    );
    await must("manager: paid invoice shows Paid badge", payRow.first().getByText("Paid", { exact: true }).waitFor({ timeout: 15000 }));

    // 5. Record an expense through the Add expense modal.
    await gotoPage(page, "/expenses");
    const addExpenseBtn = await page.getByRole("button", { name: "Add expense" }).count();
    check('manager: /expenses shows "Add expense" button (expenses.manage)', addExpenseBtn >= 1, `count=${addExpenseBtn}`);
    const expenseRowsAt = await page.locator("table tbody tr").count();
    await page.getByRole("button", { name: "Add expense" }).click();
    await page.locator("#expense-category").waitFor({ timeout: 10000 });
    await page.locator("#expense-category").selectOption("Rent");
    await page.locator('input[type="number"]').first().fill("4321");
    await page.locator("#expense-description").fill(EXPENSE_NOTE);
    await page.getByRole("button", { name: "Save expense" }).click();
    await must("manager: expense recorded via modal", page.getByText("Expense recorded", { exact: true }).waitFor({ timeout: 15000 }));
    await page.waitForFunction(
      (n) => document.querySelectorAll("table tbody tr").length === n + 1,
      expenseRowsAt,
      { timeout: 15000 },
    );
    {
      const year = new Date().getFullYear();
      const res = await api.get(`${BASE}/api/v1/expenses?year=${year}`, { headers: auth });
      const note = EXPENSE_NOTE;
      for (const e of ((await res.json()).expenses ?? []).filter((x) => x.description === note)) {
        expenseIds.push(e.id);
      }
    }
    check("manager: created expense resolvable via API", expenseIds.length >= 1, EXPENSE_NOTE);

    // 6. Create a branch through the Add branch modal.
    await gotoPage(page, "/branches");
    const addBranchBtn = await page.getByRole("button", { name: /add branch/i }).count();
    check('manager: /branches shows "Add branch" button (tenancy.manage)', addBranchBtn >= 1, `count=${addBranchBtn}`);
    await page.getByRole("button", { name: /add branch/i }).click();
    const branchForm = page.locator("form").last();
    await branchForm.locator('input[placeholder="e.g. Downtown"]').fill(BRANCH_NAME);
    await branchForm.locator('input[placeholder="e.g. DT"]').fill(`E2E${TS}`);
    await branchForm.getByRole("button", { name: /add branch/i }).click();
    await must("manager: branch added via modal", page.getByText("Branch added", { exact: true }).waitFor({ timeout: 15000 }));
    await must("manager: created branch card renders", page.getByRole("heading", { name: BRANCH_NAME, exact: true }).waitFor({ timeout: 15000 }));
    {
      const res = await api.get(`${BASE}/api/v1/branches`, { headers: auth });
      const branches = (await res.json()) ?? [];
      branchIds.push(...branches.filter((b) => b.name === BRANCH_NAME).map((b) => b.id));
    }

    // 7. Settings: tenancy.manage unlocks the gym-profile write card.
    await gotoPage(page, "/settings");
    const gymCard = await page.getByText("Gym profile & branch access").count();
    check('manager: /settings shows "Gym profile & branch access" write card (tenancy.manage)', gymCard >= 1, `count=${gymCard}`);

    // ── Gym Owner control: everything accessible, nothing hidden ──
    await login(page, USERS.owner);
    const ownerNavMissing = [];
    for (const href of ["/expenses", "/roles", "/billing", "/members"]) {
      if ((await navCount(page, href)) === 0) ownerNavMissing.push(href);
    }
    check("owner: nav shows all links (expenses, roles, billing, members)", ownerNavMissing.length === 0, ownerNavMissing.length ? `missing ${ownerNavMissing.join(", ")}` : "all present");
    await allowedCheck(page, "owner", ["/expenses", "/roles", "/billing", "/members"]);
  } catch (err) {
    if (!(err && typeof err === "object" && err.named)) {
      check("unexpected failure", false, String(err).slice(0, 200));
    }
  } finally {
    if (auth) {
      // Script-owned UI writes first: member deletes cascade subscriptions,
      // invoices, payments, and check-ins; branch/expense deletes are flat;
      // plans go last so member/sub FKs are already gone.
      const sweeps = [
        ["members", memberIds, "UI member"],
        ["branches", branchIds, "UI branch"],
        ["expenses", expenseIds, "UI expense"],
        ["plans", planIds, "UI plan"],
      ];
      for (const [kind, ids, label] of sweeps) {
        for (const id of ids) {
          try {
            const res = await api.delete(`${BASE}/api/v1/${kind}/${id}`, { headers: auth });
            check(`cleanup: ${label} deleted`, res.status() === 204 || res.status() === 404, `status ${res.status()}`);
          } catch (e) {
            check(`cleanup: ${label} deleted`, false, String(e).slice(0, 200));
          }
        }
      }
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
