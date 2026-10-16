// Gym operations E2E: overview dashboard, branches CRUD, roles, settings,
// notifications.
//
// Requires the backend + frontend dev servers running locally and a seeded
// dev DB (demo owner = demo-owner@gym-erp.dev / owner-pass-123).
// NOTE: the demo gym has ONE branch (MAIN). This script only ever deletes
// the ts-suffixed branch it creates itself — never MAIN.
const { chromium } = require("playwright");

const BASE = process.env.FORGE_BASE_URL || "http://localhost:3000";
const OWNER = { email: "demo-owner@gym-erp.dev", password: "owner-pass-123" };
const ts = Date.now().toString(36);
const BR_NAME = `E2E Branch ${ts}`;
const BR_NAME_V2 = `${BR_NAME} v2`;
const BR_CODE = `E${ts}`;
const ROLE_NAME = `E2E Role ${ts}`;

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
}

// Wait for the app shell header (renders only once `me` is loaded), then a
// short settle for page content.
async function settle(page) {
  await page.locator("header h1").waitFor({ timeout: 20000 });
  await page.waitForTimeout(700);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    // ── Login once via UI ──
    await page.goto(`${BASE}/login`);
    await page.locator('input[type="email"]').fill(OWNER.email);
    await page.locator('input[type="password"]').fill(OWNER.password);
    await page.getByRole("button", { name: /enter forge/i }).click();
    await page.waitForURL(/\/$/, { timeout: 20000 });
    check("owner login lands on dashboard", true, page.url());

    // API session for fixtures (custom role, invoice payment).
    const api = page.context().request;
    const loginRes = await api.post(`${BASE}/api/v1/auth/login`, {
      data: { email: OWNER.email, password: OWNER.password },
    });
    const { access_token } = await loginRes.json();
    const auth = { Authorization: `Bearer ${access_token}` };

    // ── Overview dashboard ──
    await page.getByText(/good morning/i).waitFor({ timeout: 20000 });
    await page.getByText("Total members", { exact: true }).waitFor({ timeout: 15000 });
    await page.getByText("Monthly revenue", { exact: true }).waitFor({ timeout: 15000 });
    check("overview: greeting + stat cards render", true);

    await page.getByText("Occupancy", { exact: true }).waitFor({ timeout: 15000 });
    await page.getByText("Recent check-ins", { exact: true }).waitFor({ timeout: 15000 });
    check("overview: activity widgets render", true);

    // ── Branches: create / edit / delete (never MAIN) ──
    await page.goto(`${BASE}/branches`);
    await settle(page);
    await page.getByRole("button", { name: /add branch/i }).waitFor({ timeout: 15000 });
    await page.getByRole("heading", { name: "Main Branch", exact: true }).waitFor({ timeout: 15000 });
    check("branches: page renders with MAIN branch intact", true);

    const branchCard = (name) =>
      page.locator("div.glass", { has: page.getByRole("heading", { name, exact: true }) }).first();

    await page.getByRole("button", { name: /add branch/i }).click();
    const createForm = page.locator("form").last();
    await createForm.locator('input[placeholder="e.g. Downtown"]').fill(BR_NAME);
    await createForm.locator('input[placeholder="e.g. DT"]').fill(BR_CODE);
    await createForm.getByRole("button", { name: /add branch/i }).click();
    await page.getByText("Branch added").waitFor({ timeout: 10000 });
    await page.getByRole("heading", { name: BR_NAME, exact: true }).waitFor({ timeout: 10000 });
    check("branches: created branch appears via UI", true);

    await branchCard(BR_NAME).getByRole("button", { name: "Edit" }).click();
    const editForm = page.locator("form").last();
    await editForm.locator("input").first().fill(BR_NAME_V2);
    await editForm.getByRole("button", { name: /save changes/i }).click();
    await page.getByText("Branch updated").waitFor({ timeout: 10000 });
    await page.getByRole("heading", { name: BR_NAME_V2, exact: true }).waitFor({ timeout: 10000 });
    check("branches: edited branch name persists", true);

    await branchCard(BR_NAME_V2).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete branch", exact: true }).click();
    await page
      .getByRole("heading", { name: BR_NAME_V2, exact: true })
      .waitFor({ state: "detached", timeout: 10000 });
    await page.getByRole("heading", { name: "Main Branch", exact: true }).waitFor({ timeout: 10000 });
    check("branches: deleted branch removed (MAIN untouched)", true);

    // ── Roles ──
    await page.goto(`${BASE}/roles`);
    await settle(page);
    await page.getByRole("heading", { name: "Gym Owner", exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole("heading", { name: "Receptionist", exact: true }).waitFor({ timeout: 15000 });
    check("roles: page renders role catalog cards", true);

    const ownerCard = page
      .locator("div.glass", { has: page.getByRole("heading", { name: "Gym Owner", exact: true }) })
      .first();
    await ownerCard.getByText("Locked", { exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole("heading", { name: "Gym Owner", exact: true }).click();
    await ownerCard.getByText("Locked system role").waitFor({ timeout: 10000 });
    check("roles: Gym Owner shows Locked badge + locked empty state", true);

    // The header's Save button only renders when a card has unsaved edits —
    // make Receptionist dirty so the nested-button bug is observable.
    const recvCard = page
      .locator("div.glass", { has: page.getByRole("heading", { name: "Receptionist", exact: true }) })
      .first();
    await page.getByRole("heading", { name: "Receptionist", exact: true }).click();
    await recvCard.getByRole("switch", { name: "reports.view" }).click();
    await recvCard.getByRole("button", { name: /^Save \(/ }).waitFor({ timeout: 10000 });
    const nestedButtons = await page.locator("button button").count();
    check("roles: no nested <button> elements", nestedButtons === 0, `count=${nestedButtons}`);
    // Revert the toggle without saving so the card is clean again.
    await recvCard.getByRole("switch", { name: "reports.view" }).click();
    await recvCard.getByRole("button", { name: /^Save \(/ }).waitFor({ state: "detached", timeout: 10000 });

    // Create the custom role through the UI form.
    await page.getByRole("button", { name: /new role/i }).click();
    const roleModal = page.locator("div.fixed.inset-0"); // Modal root, unique while open
    await roleModal.getByPlaceholder("Front Desk Lead").fill(ROLE_NAME);
    await roleModal.getByPlaceholder("Optional").fill("E2E custom role");
    await roleModal.getByRole("switch", { name: "members.view" }).click();
    await roleModal.getByRole("switch", { name: "notifications.view" }).click();
    await roleModal.getByRole("button", { name: /^Create role \(/ }).click();
    await page.getByText(`Created ${ROLE_NAME}`).waitFor({ timeout: 15000 });
    check("roles: custom role created via UI form", true);

    await page.reload();
    await settle(page);
    const roleCard = page
      .locator("div.glass", { has: page.getByRole("heading", { name: ROLE_NAME, exact: true }) })
      .first();
    await roleCard.waitFor({ timeout: 15000 });
    await roleCard.getByText("2 permissions", { exact: true }).waitFor({ timeout: 10000 });
    check("roles: custom role visible in UI list", true);

    // Cancel must reset modal state (no stale draft on reopen).
    await page.getByRole("button", { name: /new role/i }).click();
    const modal2 = page.locator("div.fixed.inset-0");
    await modal2.getByPlaceholder("Front Desk Lead").fill("Stale Draft");
    await modal2.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: /new role/i }).click();
    const modal3 = page.locator("div.fixed.inset-0");
    const draftVal = await modal3.getByPlaceholder("Front Desk Lead").inputValue();
    check("roles: modal state resets on cancel", draftVal === "", `value=${draftVal}`);

    // Duplicate names must be blocked client-side (backend has NO uniqueness
    // check — POST would silently 201 a second identical role).
    await modal3.getByPlaceholder("Front Desk Lead").fill("Receptionist");
    await modal3.getByRole("button", { name: /^Create role \(/ }).click();
    await page.getByText("Could not create role").waitFor({ timeout: 10000 });
    check("roles: duplicate role name blocked", true);
    await modal3.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("heading", { name: ROLE_NAME, exact: true }).click();
    await roleCard.getByRole("switch", { name: "reports.view" }).waitFor({ timeout: 10000 });
    await roleCard.getByRole("switch", { name: "reports.view" }).click();
    // The card header is also a <button> whose accessible name embeds the
    // nested Save label — match the inner button exactly to avoid ambiguity.
    await roleCard.getByRole("button", { name: "Save (3 perms)", exact: true }).click();
    await page.getByText(`Saved ${ROLE_NAME} permissions`).waitFor({ timeout: 10000 });
    await roleCard.getByText("3 permissions", { exact: true }).waitFor({ timeout: 10000 });
    check("roles: custom role permission edit saves via UI", true);

    // ── Settings ──
    await page.goto(`${BASE}/settings`);
    await settle(page);
    await page.getByText("Profile", { exact: true }).waitFor({ timeout: 15000 });
    await page.getByText("Granted permissions", { exact: true }).waitFor({ timeout: 15000 });
    await page.getByText("Branch access", { exact: true }).waitFor({ timeout: 15000 });
    check("settings: page renders profile / permissions / branch access", true);

    const crossSwitch = page.getByRole("switch", { name: "Cross-branch access" });
    await crossSwitch.waitFor({ timeout: 15000 });
    const before = await crossSwitch.getAttribute("aria-checked");
    await crossSwitch.click();
    await page
      .getByText(/members can now use any branch|restricted to their home branch/i)
      .waitFor({ timeout: 10000 });
    await page.reload();
    await settle(page);
    const after = await page
      .getByRole("switch", { name: "Cross-branch access" })
      .getAttribute("aria-checked");
    check(
      "settings: cross-branch toggle persists after reload",
      after === (before === "true" ? "false" : "true"),
      `${before} → ${after}`,
    );

    await page.getByRole("switch", { name: "Cross-branch access" }).click();
    // The success toast fires before the query refetch updates the controlled
    // switch — wait for the DOM value to actually flip before asserting.
    await page.waitForFunction(
      (expected) => {
        const el = document.querySelector('[role="switch"][aria-label="Cross-branch access"]');
        return el?.getAttribute("aria-checked") === expected;
      },
      before,
      { timeout: 10000 },
    );
    const restored = await page
      .getByRole("switch", { name: "Cross-branch access" })
      .getAttribute("aria-checked");
    check("settings: cross-branch toggle restored to original", restored === before, restored);

    // ── Profile save persists (was a local-toast no-op) ──
    // Toast does not auto-dismiss and the page has a single toast slot, so a
    // second "Profile updated" wait would resolve against the FIRST toast.
    // Assert the restore landed by reading the sidebar instead.
    const profileCard = page
      .locator("div.glass", { has: page.getByText("Your account details across the organization") })
      .first();
    await profileCard.waitFor({ timeout: 15000 });
    const nameInput = profileCard.locator("input").first();
    const origName = await nameInput.inputValue();
    await nameInput.fill(`${origName} E2E`);
    await profileCard.getByRole("button", { name: "Save changes" }).click();
    await page.getByText("Profile updated", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator("aside").getByText(`${origName} E2E`, { exact: true }).waitFor({ timeout: 15000 });
    check("settings: profile name save persists (sidebar refreshes)", true);
    await nameInput.fill(origName);
    await profileCard.getByRole("button", { name: "Save changes" }).click();
    await page.locator("aside").getByText(origName, { exact: true }).waitFor({ timeout: 15000 });

    // ── Gym profile save persists (name + timezone) ──
    const gymCard = page.locator("div.glass", { hasText: "Gym profile" }).first();
    await gymCard.waitFor({ timeout: 15000 });
    const gName = gymCard.locator("input").first();
    const gTz = gymCard.locator("select").first();
    const origGymName = await gName.inputValue();
    const origTz = await gTz.inputValue();
    await gName.fill(`${origGymName} E2E`);
    await gTz.selectOption("Asia/Dubai");
    await gymCard.getByRole("button", { name: /save gym profile/i }).click();
    await page.getByText("Gym profile updated", { exact: true }).waitFor({ timeout: 10000 });
    // Sidebar tenant name must refresh WITHOUT a reload — proves the save landed
    // and refreshMe ran.
    await page.locator("aside").getByText(`${origGymName} E2E`, { exact: true }).waitFor({ timeout: 15000 });
    check("settings: gym profile save refreshes sidebar tenant name", true);
    await page.reload();
    await settle(page);
    const gymCard2 = page.locator("div.glass", { hasText: "Gym profile" }).first();
    const persistedName = await gymCard2.locator("input").first().inputValue();
    const persistedTz = await gymCard2.locator("select").first().inputValue();
    check(
      "settings: gym name + timezone persist after reload",
      persistedName === `${origGymName} E2E` && persistedTz === "Asia/Dubai",
      `${persistedName} / ${persistedTz}`,
    );
    await gymCard2.locator("input").first().fill(origGymName);
    await gymCard2.locator("select").first().selectOption(origTz);
    await gymCard2.getByRole("button", { name: /save gym profile/i }).click();
    // Toast does NOT auto-dismiss — waiting for text here would match the stale
    // pre-restore toast. Assert the restored name in the sidebar instead.
    await page.locator("aside").getByText(origGymName, { exact: true }).waitFor({ timeout: 15000 });
    check("settings: gym profile restored", true);

    // ── Notifications ──
    // Fixture: pay an open invoice (creates a server-side "Payment received"
    // notification for every tenant user). If none is open, mint one via a
    // subscription like member_account_verify.cjs does.
    let invoices = await (await api.get(`${BASE}/api/v1/invoices`, { headers: auth })).json();
    let openInv = invoices.find((i) => i.status === "open" || i.status === "overdue");
    if (!openInv) {
      const branches = await (await api.get(`${BASE}/api/v1/branches`, { headers: auth })).json();
      const member = await (
        await api.post(`${BASE}/api/v1/members`, {
          headers: auth,
          data: {
            first_name: "E2E",
            last_name: `Ops ${ts}`,
            email: `e2e-ops-${ts}@example.com`,
            phone: "9000000000",
            country_code: "+91",
            gender: "Male",
            branch_id: branches[0].id,
            status: "active",
          },
        })
      ).json();
      const plan = await (
        await api.post(`${BASE}/api/v1/plans`, {
          headers: auth,
          data: {
            name: `E2E Ops Plan ${ts}`,
            slug: `e2e-ops-plan-${ts}`,
            billing_period: "monthly",
            amount_minor: 100000,
          },
        })
      ).json();
      const sub = await (
        await api.post(`${BASE}/api/v1/plans/subscribe`, {
          headers: auth,
          data: { member_id: member.id, plan_id: plan.id, branch_id: branches[0].id },
        })
      ).json();
      await api.post(`${BASE}/api/v1/plans/subscriptions/${sub.id}/activate`, { headers: auth });
      invoices = await (await api.get(`${BASE}/api/v1/invoices`, { headers: auth })).json();
      openInv = invoices.find((i) => i.status === "open" || i.status === "overdue");
    }
    const payRes = await api.post(`${BASE}/api/v1/invoices/${openInv.id}/pay`, {
      headers: auth,
      data: { method: "upi", idempotency_key: `e2e-pay-${ts}` },
    });
    check("notifications: invoice payment captured via API", payRes.ok(), `invoice ${openInv.number}`);

    await page.goto(`${BASE}/notifications`);
    await settle(page);
    await page.getByRole("button", { name: /mark all read/i }).waitFor({ timeout: 15000 });
    await page.getByText("Payment received", { exact: true }).first().waitFor({ timeout: 15000 });
    check("notifications: list renders + payment notification appears", true);

    const notifRow = page.locator("button", { hasText: "Payment received" }).first();
    const dotsBefore = await notifRow.locator("span.bg-accent").count();
    await notifRow.click();
    await notifRow.locator("span.bg-accent").waitFor({ state: "detached", timeout: 10000 });
    check("notifications: mark-read clears unread indicator", dotsBefore === 1, `dots before=${dotsBefore}`);
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
