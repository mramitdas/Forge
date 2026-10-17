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

  try {
    await page.goto(`${BASE}/login`);
    await page.locator('input[type="email"]').fill(OWNER.email);
    await page.locator('input[type="password"]').fill(OWNER.password);
    await page.getByRole("button", { name: /enter forge/i }).click();
    await page.waitForURL(/\/$/, { timeout: 20000 });
    check("owner login lands on dashboard", true, page.url());

    // Create a member via the API so the UI flow is exercised minimally.
    const api = page.context().request;
    const loginRes = await api.post(`${BASE}/api/v1/auth/login`, {
      data: { email: OWNER.email, password: OWNER.password },
    });
    const { access_token } = await loginRes.json();
    const auth = { Authorization: `Bearer ${access_token}` };
    const branches = await (await api.get(`${BASE}/api/v1/branches`, { headers: auth })).json();
    const branchId = branches[0].id;
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
        status: "active",
      },
    });
    const member = await created.json();
    check("member created via API", created.status() === 201, member.id);

    // Create a plan + subscription via API so the Renew/Upgrade UI can be tested.
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
    const subRes = await api.post(`${BASE}/api/v1/plans/subscribe`, {
      headers: auth,
      data: { member_id: member.id, plan_id: plan.id, branch_id: branchId },
    });
    const sub = await subRes.json();
    await api.post(`${BASE}/api/v1/plans/subscriptions/${sub.id}/activate`, { headers: auth });
    check("plan + subscription created", subRes.status() === 201, plan.slug);

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
    await page.getByText("Invoices", { exact: true }).waitFor({ timeout: 15000 });
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
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
