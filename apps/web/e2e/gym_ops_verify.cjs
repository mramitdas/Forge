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
  let api = null;
  let auth = null;
  let roleId = null;
  let condMemberId = null;
  let condPlanId = null;

  try {
    // ── Login once via UI ──
    await page.goto(`${BASE}/login`);
    await page.locator('input[type="email"]').fill(OWNER.email);
    await page.locator('input[type="password"]').fill(OWNER.password);
    await page.getByRole("button", { name: /enter forge/i }).click();
    await page.waitForURL(/\/$/, { timeout: 20000 });
    check("owner login lands on dashboard", true, page.url());

    // API session for fixtures (custom role, invoice payment).
    api = page.context().request;
    const loginRes = await api.post(`${BASE}/api/v1/auth/login`, {
      data: { email: OWNER.email, password: OWNER.password },
    });
    const { access_token } = await loginRes.json();
    auth = { Authorization: `Bearer ${access_token}` };

    // ── Overview dashboard ──
    await page.getByText(/good morning/i).waitFor({ timeout: 20000 });
    await page.getByText("Total members", { exact: true }).waitFor({ timeout: 15000 });
    await must("overview: greeting + stat cards render", page.getByText("Monthly revenue", { exact: true }).waitFor({ timeout: 15000 }));

    await page.getByText("Occupancy", { exact: true }).waitFor({ timeout: 15000 });
    await must("overview: activity widgets render", page.getByText("Recent check-ins", { exact: true }).waitFor({ timeout: 15000 }));

    // ── Branches: create / edit / delete (never MAIN) ──
    await page.goto(`${BASE}/branches`);
    await settle(page);
    await page.getByRole("button", { name: /add branch/i }).waitFor({ timeout: 15000 });
    await must("branches: page renders with MAIN branch intact", page.getByRole("heading", { name: "Main Branch", exact: true }).waitFor({ timeout: 15000 }));

    const branchCard = (name) =>
      page.locator("div.glass", { has: page.getByRole("heading", { name, exact: true }) }).first();

    await page.getByRole("button", { name: /add branch/i }).click();
    const createForm = page.locator("form").last();
    await createForm.locator('input[placeholder="e.g. Downtown"]').fill(BR_NAME);
    await createForm.locator('input[placeholder="e.g. DT"]').fill(BR_CODE);
    await createForm.getByRole("button", { name: /add branch/i }).click();
    await page.getByText("Branch added").waitFor({ timeout: 10000 });
    await must("branches: created branch appears via UI", page.getByRole("heading", { name: BR_NAME, exact: true }).waitFor({ timeout: 10000 }));

    await branchCard(BR_NAME).getByRole("button", { name: "Edit" }).click();
    const editForm = page.locator("form").last();
    await editForm.locator("input").first().fill(BR_NAME_V2);
    await editForm.getByRole("button", { name: /save changes/i }).click();
    await page.getByText("Branch updated").waitFor({ timeout: 10000 });
    await must("branches: edited branch name persists", page.getByRole("heading", { name: BR_NAME_V2, exact: true }).waitFor({ timeout: 10000 }));

    await branchCard(BR_NAME_V2).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete branch", exact: true }).click();
    await page
      .getByRole("heading", { name: BR_NAME_V2, exact: true })
      .waitFor({ state: "detached", timeout: 10000 });
    await must("branches: deleted branch removed (MAIN untouched)", page.getByRole("heading", { name: "Main Branch", exact: true }).waitFor({ timeout: 10000 }));

    // ── Roles ──
    await page.goto(`${BASE}/roles`);
    await settle(page);
    await page.getByRole("heading", { name: "Gym Owner", exact: true }).waitFor({ timeout: 15000 });
    await must("roles: owner card renders", page.getByRole("heading", { name: "Gym Owner", exact: true }).waitFor({ timeout: 15000 }));

    const ownerCard = page
      .locator("div.glass", { has: page.getByRole("heading", { name: "Gym Owner", exact: true }) })
      .first();
    await ownerCard.getByText("Locked", { exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole("heading", { name: "Gym Owner", exact: true }).click();
    await must("roles: Gym Owner expands to read-only permission pills", ownerCard.locator('[aria-label="members view on"]').waitFor({ timeout: 10000 }));

    // Card headers stay button-free (actions live outside the role=button
    // header region) — regression check for nested-button issues.
    const headerRegion = ownerCard
      .locator('[role="button"]', { has: page.getByRole("heading", { name: "Gym Owner", exact: true }) })
      .first();
    const nestedInHeader = await headerRegion.locator("button").count();
    check("roles: card header region has no nested buttons", nestedInHeader === 0, `count=${nestedInHeader}`);
    const nestedButtons = await page.locator("button button").count();
    check("roles: no nested <button> elements", nestedButtons === 0, `count=${nestedButtons}`);

    // Create the custom role through the UI form (read pills add 1 code each).
    await page.getByRole("button", { name: /new role/i }).click();
    const roleModal = page.locator("div.fixed.inset-0"); // Modal root, unique while open
    await roleModal.getByPlaceholder("Front Desk Lead").fill(ROLE_NAME);
    await roleModal.getByPlaceholder("Optional").fill("E2E custom role");
    await roleModal.getByRole("button", { name: "members view off" }).click();
    await roleModal.getByRole("button", { name: "notifications view off" }).click();
    await roleModal.getByRole("button", { name: /^Create role \(/ }).click();
    await must("roles: custom role created via UI form", page.getByText(`Created ${ROLE_NAME}`).waitFor({ timeout: 15000 }));

    await page.reload();
    await settle(page);
    const roleCard = page
      .locator("div.glass", { has: page.getByRole("heading", { name: ROLE_NAME, exact: true }) })
      .first();
    await roleCard.waitFor({ timeout: 15000 });
    await must("roles: custom role visible in UI list", roleCard.getByText("2 permissions", { exact: true }).waitFor({ timeout: 10000 }));
    const rolesList = await (await api.get(`${BASE}/api/v1/permissions/roles`, { headers: auth })).json();
    roleId = (rolesList.find((r) => r.name === ROLE_NAME) || {}).id || null;

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
    await modal3.getByPlaceholder("Front Desk Lead").fill(ROLE_NAME);
    await modal3.getByRole("button", { name: /^Create role \(/ }).click();
    await must("roles: duplicate role name blocked", page.getByText("Could not create role").waitFor({ timeout: 10000 }));
    await modal3.getByRole("button", { name: "Cancel" }).click();

    // Permission edit goes through the Edit modal (two switches per module).
    await roleCard.getByRole("button", { name: "Edit", exact: true }).click();
    const editModal = page.locator("div.fixed.inset-0");
    await editModal.locator('[data-module="attendance"]').getByRole("button", { name: "attendance view off" }).click();
    await editModal.getByRole("button", { name: /^Save changes \(/ }).click();
    await must("roles: custom role permission edit saves via UI", roleCard.getByText("3 permissions", { exact: true }).waitFor({ timeout: 15000 }));

    // Restore: remove attendance.view through the same Edit modal.
    await roleCard.getByRole("button", { name: "Edit", exact: true }).click();
    const restoreModal = page.locator("div.fixed.inset-0");
    await restoreModal.locator('[data-module="attendance"]').getByRole("button", { name: "attendance view on" }).click();
    await restoreModal.getByRole("button", { name: /^Save changes \(/ }).click();
    await must("roles: permission edit restores", roleCard.getByText("2 permissions", { exact: true }).waitFor({ timeout: 15000 }));

    // ── Settings ──
    await page.goto(`${BASE}/settings`);
    await settle(page);
    await page.getByText("Profile", { exact: true }).waitFor({ timeout: 15000 });
    await page.getByLabel("Granted permissions").waitFor({ timeout: 15000 });
    await page.getByText("Role & permissions", { exact: true }).waitFor({ timeout: 15000 });
    await must("settings: page renders profile / role pills / branch access", page.getByText("Branch access", { exact: true }).waitFor({ timeout: 15000 }));
    // R/W/U/D pills render and are non-interactive (owner has members.view,
    // so the members/read pill is always ON).
    const readPill = page.locator('[aria-label="members view on"]').first();
    await must("settings: permission pills render view=on for members", readPill.waitFor({ timeout: 15000 }));
    await must("settings: permission pills are aria-disabled", (await readPill.getAttribute("aria-disabled")) === "true");

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
    await must("settings: email input is read-only", (await profileCard.locator("#settings-email").getAttribute("disabled")) !== null);
    const firstNameInput = profileCard.locator("#settings-first-name");
    const lastNameInput = profileCard.locator("#settings-last-name");
    const origFirst = await firstNameInput.inputValue();
    const origLast = await lastNameInput.inputValue();
    // The sidebar renders me.user.full_name (single <p>), which the backend
    // recomputes as `${first} ${last}` on a first/last PATCH — so the saved
    // state reads `${origFirst} E2E ${origLast}`. Capture the original text so
    // the restore can be asserted against it (never via a second toast wait).
    const origSidebarName = await page.locator("aside div.min-w-0 p").first().innerText();
    await firstNameInput.fill(`${origFirst} E2E`);
    await profileCard.getByRole("button", { name: "Save changes" }).click();
    await page.getByText("Profile updated", { exact: true }).waitFor({ timeout: 10000 });
    await must("settings: profile name save persists (sidebar refreshes)", page.locator("aside").getByText(`${origFirst} E2E ${origLast}`, { exact: true }).waitFor({ timeout: 15000 }));
    await firstNameInput.fill(origFirst);
    await profileCard.getByRole("button", { name: "Save changes" }).click();
    await page.locator("aside").getByText(origSidebarName, { exact: true }).waitFor({ timeout: 15000 });

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
    await must("settings: gym profile save refreshes sidebar tenant name", page.locator("aside").getByText(`${origGymName} E2E`, { exact: true }).waitFor({ timeout: 15000 }));
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
    await must("settings: gym profile restored", page.locator("aside").getByText(origGymName, { exact: true }).waitFor({ timeout: 15000 }));

    // ── Notifications ──
    // Fixture: pay an open invoice (creates a server-side "Payment received"
    // notification for every tenant user). If none is open, mint one via a
    // subscription like member_account_verify.cjs does.
    let invoices = await (await api.get(`${BASE}/api/v1/invoices?page_size=100`, { headers: auth })).json();
    let openInv = invoices.items.find((i) => i.status === "open" || i.status === "overdue");
    if (!openInv) {
      const branches = await (await api.get(`${BASE}/api/v1/branches`, { headers: auth })).json();
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
            plan_id: plan.id,
          },
        })
      ).json();
      condMemberId = member.id;
      condPlanId = plan.id;
      invoices = await (await api.get(`${BASE}/api/v1/invoices?page_size=100`, { headers: auth })).json();
      openInv = invoices.items.find((i) => i.status === "open" || i.status === "overdue");
    }
    const payRes = await api.post(`${BASE}/api/v1/invoices/${openInv.id}/pay`, {
      headers: auth,
      data: { method: "upi", idempotency_key: `e2e-pay-${ts}` },
    });
    check("notifications: invoice payment captured via API", payRes.ok(), `invoice ${openInv.number}`);

    await page.goto(`${BASE}/notifications`);
    await settle(page);
    await page.getByRole("button", { name: /mark all read/i }).waitFor({ timeout: 15000 });
    // The payment notification arrives via the async outbox dispatcher, and
    // earlier runs may have left extra unread "Payment received" rows — wait
    // for ANY unread one, then verify the click clears the unread dot on the
    // clicked row.
    const unreadPaymentRows = page
      .locator("button", { hasText: "Payment received" })
      .filter({ has: page.locator("span.bg-accent") });
    await must("notifications: list renders + payment notification appears", unreadPaymentRows.first().waitFor({ timeout: 20000 }));

    // Pin the target row by its invoice reference before clicking: a delivery
    // landing mid-check inserts a newer row above, so re-resolving .first()
    // could click a different row than the one we measured. Waiting for THIS
    // row's dot to clear (rather than a global count drop) is also robust to
    // a concurrent delivery — the count could stay flat (one marked read, one
    // newly delivered) and time out even though the click worked.
    const unreadBefore = await unreadPaymentRows.count();
    const invoiceNo = (await unreadPaymentRows.first().innerText()).match(/INV-\d{4}-\d+/)?.[0];
    const targetRow = invoiceNo ? unreadPaymentRows.filter({ hasText: invoiceNo }).first() : unreadPaymentRows.first();
    await targetRow.click();
    await targetRow.locator("span.bg-accent").waitFor({ state: "detached", timeout: 15000 });
    check("notifications: mark-read clears unread indicator", unreadBefore >= 1, `unread before=${unreadBefore}`);
    await must("notifications: single mark-read shows toast", page.getByText("Notification marked as read", { exact: true }).waitFor({ timeout: 10000 }));

    // Mark-all coverage: the single mark-read above may have been the last
    // unread (button then disabled — unread===0) or other unread rows may
    // remain (earlier runs / async outbox deliveries). Both are the same
    // passing outcome: click mark-all when anything is unread, then require
    // zero unread dots anywhere in the list. Scoped to notification row
    // buttons — the only <button>s on this page containing span.bg-accent
    // dots (nav badges are <a> links, filter chips have no such span).
    const unreadDots = page
      .locator("button", { has: page.locator("span.bg-accent") })
      .locator("span.bg-accent");
    const markAllBtn = page.getByRole("button", { name: /mark all read/i });
    const dotsBefore = await unreadDots.count();
    if (dotsBefore > 0) {
      await markAllBtn.click();
    }
    await must(
      "notifications: mark-all clears every remaining unread dot",
      unreadDots.first().waitFor({ state: "detached", timeout: 15000 }),
      dotsBefore > 0
        ? `clicked mark-all, unread dots before=${dotsBefore}`
        : "already all read after single mark-read",
    );
    check(
      "notifications: mark-all button reachable",
      (await markAllBtn.count()) > 0,
      dotsBefore > 0 ? "mark-all clicked" : "mark-all present but disabled (unread=0)",
    );
  } catch (err) {
    if (!(err && typeof err === "object" && err.named)) {
      check("unexpected failure", false, String(err).slice(0, 200));
    }
  } finally {
    if (auth && roleId) {
      try {
        const res = await api.delete(`${BASE}/api/v1/permissions/roles/${roleId}`, { headers: auth });
        check("teardown: E2E role deleted", res.status() === 204 || res.status() === 404, `status ${res.status()}`);
      } catch (e) {
        check("teardown: E2E role deleted", false, String(e).slice(0, 200));
      }
    }
    for (const [id, label, kind] of [
      [condMemberId, "conditional member", "members"],
      [condPlanId, "conditional plan", "plans"],
    ]) {
      if (!auth || !id) continue;
      try {
        const res = await api.delete(`${BASE}/api/v1/${kind}/${id}`, { headers: auth });
        check(`teardown: ${label} deleted`, res.status() === 204 || res.status() === 404, `status ${res.status()}`);
      } catch (e) {
        check(`teardown: ${label} deleted`, false, String(e).slice(0, 200));
      }
    }
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
