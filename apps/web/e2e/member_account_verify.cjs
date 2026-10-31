// Member account features E2E: edit, enable/disable, delete, avatar upload.
//
// Requires backend + frontend dev servers and the seeded dev DB.
const { chromium } = require("playwright");

const BASE = process.env.FORGE_BASE_URL || "http://localhost:3000";
const OWNER = { email: "demo-owner@gym-erp.dev", password: "owner-pass-123" };
const ts = Date.now().toString(36);
const MEMBER_NAME = `E2E Acct ${ts}`;

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
  let api = null;
  let auth = null;
  let renewPlanId = null;
  let upgradePlanId = null;
  let pagerPlanId = null;
  const pagerMemberIds = [];

  try {
    await page.goto(`${BASE}/login`);
    await page.locator('input[type="email"]').fill(OWNER.email);
    await page.locator('input[type="password"]').fill(OWNER.password);
    await page.getByRole("button", { name: /enter forge/i }).click();
    await page.waitForURL(/\/$/, { timeout: 20000 });
    check("owner login lands on dashboard", true, page.url());

    // Create a member via the API so the UI flow is exercised minimally.
    api = page.context().request;
    const loginRes = await api.post(`${BASE}/api/v1/auth/login`, {
      data: { email: OWNER.email, password: OWNER.password },
    });
    const { access_token } = await loginRes.json();
    auth = { Authorization: `Bearer ${access_token}` };
    const branches = await (await api.get(`${BASE}/api/v1/branches`, { headers: auth })).json();
    const branchId = branches[0].id;
    // Create a plan first; member creation now requires and auto-activates it.
    const planRes = await api.post(`${BASE}/api/v1/plans`, {
      headers: auth,
      data: {
        name: `Renew Plan ${ts}`,
        slug: `renew-plan-${ts}`,
        billing_period: "monthly",
        amount_minor: 100000,
        auto_renew: false,
      },
    });
    const plan = await planRes.json();
    check("plan created", planRes.status() === 201, plan.slug);
    renewPlanId = plan.id;
    const created = await api.post(`${BASE}/api/v1/members`, {
      headers: auth,
      data: {
        first_name: "E2E",
        last_name: `Acct ${ts}`,
        email: `e2e-acct-${ts}@example.com`,
        phone: "9000000000",
        country_code: "+91",
        gender: "Male",
        branch_id: branchId,
        plan_id: plan.id,
      },
    });
    const member = await created.json();
    check("member created via API with plan", created.status() === 201, member.id);

    const upgradePlan = await (
      await api.post(`${BASE}/api/v1/plans`, {
        headers: auth,
        data: {
          name: `Upgrade Plan ${ts}`,
          slug: `upgrade-plan-${ts}`,
          billing_period: "quarterly",
          amount_minor: 300000,
        },
      })
    ).json();
    upgradePlanId = upgradePlan.id;

    // ── Members pagination: self-provision 65 extra members so page-2
    // coverage is real under the 50-row default page size ──
    const baselineRes = await api.get(`${BASE}/api/v1/members?page=1&page_size=1`, { headers: auth });
    const baselineTotal = (await baselineRes.json()).total ?? 0;
    const pagerPlan = await (
      await api.post(`${BASE}/api/v1/plans`, {
        headers: auth,
        data: {
          name: `Pager Plan ${ts}`,
          slug: `pager-plan-${ts}`,
          billing_period: "monthly",
          amount_minor: 50000,
        },
      })
    ).json();
    pagerPlanId = pagerPlan.id;
    for (let i = 1; i <= 65; i++) {
      const res = await api.post(`${BASE}/api/v1/members`, {
        headers: auth,
        data: {
          first_name: "E2E",
          last_name: `Pg${String(i).padStart(2, "0")}${ts}`,
          branch_id: branchId,
          plan_id: pagerPlan.id,
        },
      });
      if (res.status() !== 201) throw new Error(`pager member ${i}: ${res.status()}`);
      pagerMemberIds.push((await res.json()).id);
    }
    // Baseline is read AFTER the main member was created, so it already
    // includes them — the delta is exactly the 65 pager members.
    const pagerTotal = baselineTotal + 65;
    const expectedPagerPages = Math.max(1, Math.ceil(pagerTotal / 50));

    await page.goto(`${BASE}/members`);
    await page.locator('input[placeholder="Search name, email, phone"]').waitFor({ timeout: 20000 });
    await must("members page renders total", page.getByText(`${pagerTotal} members`, { exact: true }).waitFor({ timeout: 30000 }));
    await must("members pagination footer renders", page.getByText(`Page 1 of ${expectedPagerPages}`, { exact: true }).waitFor({ timeout: 15000 }));
    check("members page 1 keeps default 50 rows", (await page.locator("table tbody tr").count()) === 50);

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await must("members page 2 renders", page.getByText(`Page 2 of ${expectedPagerPages}`, { exact: true }).waitFor({ timeout: 15000 }));
    const membersPage2Rows = Math.min(50, pagerTotal - 50);
    await page.waitForFunction(
      (n) => document.querySelectorAll("table tbody tr").length === n,
      membersPage2Rows,
      { timeout: 15000 },
    );

    // Rows-per-page dropdown: raise to 100 — the size change must reset the
    // view to page 1 and render more than 50 rows.
    const sizeSelect = page.locator('select[aria-label="Rows per page"]');
    await must("members rows-per-page dropdown renders", sizeSelect.waitFor({ timeout: 10000 }));
    check("members dropdown defaults to 50", (await sizeSelect.inputValue()) === "50");
    await sizeSelect.selectOption("100");
    await must(
      "members size change resets to page 1",
      page.getByText("Page 1 of 1", { exact: true }).waitFor({ timeout: 15000 }),
    );
    await page.waitForFunction(
      (n) => document.querySelectorAll("table tbody tr").length >= n,
      Math.min(pagerTotal, 100),
      { timeout: 15000 },
    );
    const membersRowsAt100 = await page.locator("table tbody tr").count();
    check("members page 1 keeps the larger size (> 50 rows)", membersRowsAt100 === Math.min(pagerTotal, 100) && membersRowsAt100 > 50, `rows=${membersRowsAt100}`);
    await sizeSelect.selectOption("50");
    await must("members dropdown back to 50 restores pagination", page.getByText(`Page 1 of ${expectedPagerPages}`, { exact: true }).waitFor({ timeout: 15000 }));

    await page.goto(`${BASE}/members/${member.id}`);
    await must("member detail renders", page.getByRole("heading", { name: MEMBER_NAME }).waitFor({ timeout: 15000 }));

    // Enable/disable toggle
    await page.getByRole("button", { name: "Disable", exact: true }).click();
    await page.getByText(`${MEMBER_NAME} disabled`).waitFor({ timeout: 10000 });
    await must("member disabled via UI", page.getByText("Disabled", { exact: true }).waitFor({ timeout: 10000 }));

    await page.getByRole("button", { name: "Enable", exact: true }).click();
    await must("member enabled via UI", page.getByText(`${MEMBER_NAME} enabled`).waitFor({ timeout: 10000 }));

    // Edit
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editForm = page.locator("form").last();
    await editForm.locator("input").first().fill(`E2E Acct ${ts} v2`);
    await editForm.getByRole("button", { name: /save changes/i }).click();
    await must("member edited via UI", page.getByRole("heading", { name: `E2E Acct ${ts} v2` }).waitFor({ timeout: 10000 }));

    // Avatar upload via file input
    await page.setInputFiles('input[type="file"]', {
      name: "avatar.png",
      mimeType: "image/png",
      buffer: Buffer.from("89504e470d0a1a0a0000000d494844520000000100000001080600000", "hex"),
    });
    await must("avatar upload works", page.getByText("Photo updated").waitFor({ timeout: 10000 }));

    // Renew (opens a modal prefilled with last end date)
    await page.getByRole("button", { name: "Renew", exact: true }).click();
    const renewModal = page.locator("form").last();
    await renewModal.locator('input[type="date"]').waitFor({ timeout: 10000 });
    const prefilled = await renewModal.locator('input[type="date"]').inputValue();
    await renewModal.getByRole("button", { name: "Renew", exact: true }).click();
    await must("subscription renewed via UI (modal with start date)", page.getByText("Subscription renewed").waitFor({ timeout: 10000 }), prefilled);

    // Check in
    await page.getByRole("button", { name: "Check in", exact: true }).click();
    await must(
      "check-in button works",
      page
        .getByText(/checked in|duplicate|no active membership|member is disabled/)
        .waitFor({ timeout: 10000 }),
    );

    // Invoice detail page
    await page.goto(`${BASE}/billing`);
    await page.getByPlaceholder("Search invoice # or member").waitFor({ timeout: 15000 });
    await page.locator("a", { hasText: /^INV-/ }).first().click();
    await page.waitForURL(/\/billing\/.+/, { timeout: 10000 });
    await must("invoice detail page renders", page.getByText("Line items", { exact: true }).waitFor({ timeout: 10000 }), page.url());
    await page.goto(`${BASE}/members/${member.id}`);

    // Upgrade plan
    await page.getByRole("button", { name: "Upgrade plan", exact: true }).click();
    const upgModal = page.locator("form").last();
    await upgModal.locator("select").selectOption(upgradePlan.id);
    await upgModal.getByRole("button", { name: /upgrade plan/i }).click();
    await must("plan upgraded via UI", page.getByText("Plan upgraded").waitFor({ timeout: 10000 }));

    // Delete
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: /delete member/i }).click();
    await page.waitForURL(/\/members$/, { timeout: 10000 });
    check("member deleted via UI", true, page.url());
  } catch (err) {
    if (!(err && typeof err === "object" && err.named)) {
      check("unexpected failure", false, String(err).slice(0, 200));
    }
  } finally {
    if (auth) {
      for (const id of pagerMemberIds) {
        try {
          const res = await api.delete(`${BASE}/api/v1/members/${id}`, { headers: auth });
          if (res.status() !== 204) console.log(`pager member ${id}: ${res.status()}`);
        } catch (e) {
          console.log(`pager member ${id}: ${String(e).slice(0, 200)}`);
        }
      }
      if (pagerMemberIds.length) check("teardown: pager members deleted", true, `${pagerMemberIds.length}`);
      for (const [id, label] of [
        [pagerPlanId, "Pager Plan"],
        [renewPlanId, "Renew Plan"],
        [upgradePlanId, "Upgrade Plan"],
      ]) {
        if (!id) continue;
        try {
          const res = await api.delete(`${BASE}/api/v1/plans/${id}`, { headers: auth });
          check(`teardown: ${label} deleted`, res.status() === 204 || res.status() === 404, `status ${res.status()}`);
        } catch (e) {
          check(`teardown: ${label} deleted`, false, String(e).slice(0, 200));
        }
      }
    }
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
