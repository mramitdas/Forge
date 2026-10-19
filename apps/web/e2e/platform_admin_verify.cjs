// Platform admin panel — v1 REGRESSION GATE.
//
// The platform admin console (/platform, gym/owner management, subscription
// tiers, revenue) is FROZEN for v1. This script is the gate: before merging
// any change that touches shared UI (components/ui, components/skeleton*,
// lib/hooks, lib/api, (app)/layout) or anything under /platform, you MUST
// run it and get 100% PASS.
//
//   cd apps/web && node e2e/platform_admin_verify.cjs
//
// Set FORGE_BASE_URL to point at a non-default origin (e.g. when the dev
// server falls back off port 3000): FORGE_BASE_URL=http://localhost:3001
//
// Requires the backend + frontend dev servers running locally.
const { chromium } = require("playwright");

const BASE = process.env.FORGE_BASE_URL || "http://localhost:3000";
const ADMIN = { email: "admin@gym-erp.dev", password: "admin-pass-123" };
const ts = Date.now().toString(36);
const SLUG = `verify-${ts}`;
const OWNER_EMAIL = `verify-owner-${ts}@gym-erp.dev`;

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
    // ── Login as platform admin ──
    await page.goto(`${BASE}/login`);
    await page.locator('input[type="email"]').fill(ADMIN.email);
    await page.locator('input[type="password"]').fill(ADMIN.password);
    await page.getByRole("button", { name: /enter forge/i }).click();
    await page.waitForURL(/\/platform/, { timeout: 20000 });
    check("platform admin login redirects to /platform", true, page.url());

    // ── Gyms: provision ──
    await page.goto(`${BASE}/platform/gyms`);
    await page.getByRole("button", { name: /provision gym/i }).click();
    await page.locator('input[placeholder="e.g. Iron Temple"]').fill(`Verify Gym ${ts}`);
    await page.locator('input[placeholder="e.g. iron-temple"]').fill(SLUG);
    await page.locator('input[placeholder="e.g. Aisha Kapoor"]').fill("Verify Owner");
    await page.locator('input[placeholder="owner@gym.com"]').fill(OWNER_EMAIL);
    await page.locator('input[placeholder="min 8 chars"]').fill("verify-pass-123");
    await page.getByRole("button", { name: /provision gym/i }).last().click();
    await must("gym provisioned and appears in table", page.getByText(`Verify Gym ${ts}`, { exact: true }).first().waitFor({ timeout: 20000 }));

    // ── Gyms: edit (timezone + currency dropdowns) ──
    let row = page.locator("tr", { hasText: `Verify Gym ${ts}` }).first();
    await row.getByRole("button", { name: "Edit" }).click();
    await page.locator("select").nth(0).selectOption("Europe/Paris");
    await page.locator("select").nth(1).selectOption("USD");
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.getByText("Gym updated").waitFor({ timeout: 10000 });
    await page.locator("tr", { hasText: "Europe/Paris" }).first().waitFor({ timeout: 15000 });
    const gymRowText = await page.locator("tr", { hasText: `Verify Gym ${ts}` }).first().innerText();
    check("gym edit modal updates timezone/currency dropdowns", gymRowText.includes("USD"), gymRowText.slice(0, 80));

    // ── Gyms: suspend / enable ──
    row = page.locator("tr", { hasText: `Verify Gym ${ts}` }).first();
    await row.getByRole("button", { name: "Suspend" }).click();
    await must("gym suspended", page.getByText(new RegExp(`Verify Gym ${ts} suspended`)).waitFor({ timeout: 10000 }));
    row = page.locator("tr", { hasText: `Verify Gym ${ts}` }).first();
    await row.getByRole("button", { name: "Enable" }).click();
    await must("gym enabled again", page.getByText(new RegExp(`Verify Gym ${ts} is now active`)).waitFor({ timeout: 10000 }));

    // ── Owners: edit (password reset) ──
    await page.goto(`${BASE}/platform/owners`);
    let oRow = page.locator("tr", { hasText: OWNER_EMAIL }).first();
    await oRow.waitFor({ timeout: 15000 });
    await oRow.getByRole("button", { name: "Edit" }).click();
    await page.locator('input[placeholder="Leave blank to keep current"]').fill("verify-pass-456");
    await page.getByRole("button", { name: /save changes/i }).click();
    await must("owner edit (password reset) succeeds", page.getByText("Owner updated").waitFor({ timeout: 10000 }));

    // ── Owners: disable / enable ──
    oRow = page.locator("tr", { hasText: OWNER_EMAIL }).first();
    await oRow.getByRole("button", { name: "Disable" }).click();
    await page.getByText("access disabled").waitFor({ timeout: 10000 });
    // The row refetches after the mutation; wait for the Enable button (the
    // refetched state) before reading the status text, to avoid a stale read.
    oRow = page.locator("tr", { hasText: OWNER_EMAIL }).first();
    await oRow.getByRole("button", { name: "Enable" }).waitFor({ timeout: 10000 });
    const disabledText = await page.locator("tr", { hasText: OWNER_EMAIL }).first().innerText();
    check("owner disabled", disabledText.includes("disabled"), disabledText.slice(0, 80));
    await oRow.getByRole("button", { name: "Enable" }).click();
    await must("owner enabled again", page.getByText("can now log in").waitFor({ timeout: 10000 }));

    // ── Owners: login as owner + exit ──
    oRow = page.locator("tr", { hasText: OWNER_EMAIL }).first();
    await oRow.getByRole("button", { name: "Login" }).click();
    await page.waitForURL(/\/$/, { timeout: 20000 });
    await must("login-as-owner enters gym workspace with banner", page.getByText(/Viewing the gym workspace as/).waitFor({ timeout: 10000 }), page.url());
    check("gym nav visible (Members link)", (await page.locator("a", { hasText: "Members" }).count()) > 0);

    await page.getByRole("button", { name: "Exit to platform" }).click();
    await page.waitForURL(/\/platform/, { timeout: 20000 });
    await page.getByText("Gym subscriptions").first().waitFor({ timeout: 15000 });
    const bannerCount = await page.getByText(/Viewing the gym workspace as/).count();
    check("exit impersonation returns to platform", bannerCount === 0, page.url());

    // ── Subscriptions: change tier via overview dropdown (this run's gym only) ──
    await page.goto(`${BASE}/platform`);
    await page.getByText("Gym subscriptions").waitFor({ timeout: 10000 });
    const tierRow = page.locator("tr", { hasText: `Verify Gym ${ts}` }).first();
    await tierRow.waitFor({ timeout: 15000 });
    const tierSelect = tierRow.locator("select").first();
    await tierSelect.selectOption({ label: "Pro" });
    await must("subscription tier changed via overview dropdown", page.getByText("Subscription tier updated").waitFor({ timeout: 10000 }));

    // ── Gyms: delete (must run after owner tests since it disables the owner) ──
    await page.goto(`${BASE}/platform/gyms`);
    const delRow = page.locator("tr", { hasText: `Verify Gym ${ts}` }).first();
    await delRow.waitFor({ timeout: 15000 });
    await delRow.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: /delete gym/i }).click();
    await page.getByText(new RegExp(`Verify Gym ${ts} deleted`)).waitFor({ timeout: 10000 });
    await page.waitForTimeout(1000);
    const stillThere = await page.locator("tr", { hasText: `Verify Gym ${ts}` }).count();
    check("gym deleted from table", stillThere === 0, `remaining rows=${stillThere}`);

    // ── Gyms: restore the just-deleted gym via "Show deleted" ──
    const showDeleted = page.locator('label:has-text("Show deleted") input');
    await showDeleted.check();
    const deletedRow = page.locator("tr", { hasText: `Verify Gym ${ts}` }).first();
    await deletedRow.waitFor({ timeout: 15000 });
    await deletedRow.getByRole("button", { name: "Restore" }).click();
    await must(
      "gym restored via Show deleted toggle",
      page.getByText(new RegExp(`Verify Gym ${ts} restored`)).waitFor({ timeout: 10000 }),
    );
    await showDeleted.uncheck();
    const backRow = page.locator("tr", { hasText: `Verify Gym ${ts}` }).first();
    await backRow.waitFor({ timeout: 15000 });
    check("restored gym reappears in live list", (await backRow.count()) > 0);

    // ── Platform subscriptions: pricing cards + tier CRUD ──
    await page.goto(`${BASE}/platform/subscriptions`);
    await page.getByRole("button", { name: /new tier/i }).waitFor({ timeout: 15000 });
    // The seed tier name is lowercase 'starter'; match case-insensitively so
    // the assertion tests "pricing cards render" and not a cosmetic casing.
    await page.getByText(/starter/i).first().waitFor({ timeout: 15000 });
    // Starter tier's seed price is 100 minor (₹100). Assert the price renders.
    const priceShown = await page.getByText("₹100").count();
    check("pricing cards render with price", priceShown > 0, `starter price rows=${priceShown}`);

    await page.getByRole("button", { name: /new tier/i }).click();
    await page.locator('input[placeholder="e.g. premium"]').fill(`v-tier-${ts}`);
    await page.locator('input[placeholder="e.g. Premium"]').fill("Verify Tier");
    await page.locator('input[placeholder="e.g. 799"]').fill("599");
    await page.locator('input[placeholder="e.g. For growing operators"]').fill("Tier created during verification");
    await page.getByRole("button", { name: /create tier/i }).click();
    // Exact match: the new card's description is "Tier created during
    // verification", which would otherwise collide with the toast.
    await page.getByText("Tier created", { exact: true }).waitFor({ timeout: 10000 });
    await must("tier created via modal", page.getByText("Verify Tier", { exact: true }).waitFor({ timeout: 15000 }));

    let tierCard = page.locator("div.rounded-2xl").filter({ hasText: "Verify Tier" }).first();
    await tierCard.getByRole("button", { name: "Edit" }).click();
    await page.locator('input[placeholder="e.g. Premium"]').fill("Verify Tier Plus");
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.getByText("Tier updated").waitFor({ timeout: 10000 });
    await must("tier edited via modal", page.getByText("Verify Tier Plus", { exact: true }).waitFor({ timeout: 15000 }));

    tierCard = page.locator("div.rounded-2xl").filter({ hasText: "Verify Tier Plus" }).first();
    await tierCard.getByRole("switch", { name: "Toggle Verify Tier Plus" }).click();
    await must("tier disabled via switch", page.getByText("Verify Tier Plus is now disabled").waitFor({ timeout: 10000 }));
    tierCard = page.locator("div.rounded-2xl").filter({ hasText: "Verify Tier Plus" }).first();
    await tierCard.getByRole("switch", { name: "Toggle Verify Tier Plus" }).click();
    await must("tier re-enabled via switch", page.getByText("Verify Tier Plus is now active").waitFor({ timeout: 10000 }));

    // Disabling a tier a live gym uses must be blocked with a reason.
    const starterSwitch = page.getByRole("switch", { name: "Toggle starter" });
    await starterSwitch.click();
    await must(
      "in-use tier disable blocked with reason",
      page.getByText(/Could not update tier: Tier is still referenced by gyms/).waitFor({ timeout: 10000 }),
    );
    const starterStillOn = await starterSwitch.isChecked();
    check("in-use tier switch stays on after failed disable", starterStillOn, `checked=${starterStillOn}`);

    tierCard = page.locator("div.rounded-2xl").filter({ hasText: "Verify Tier Plus" }).first();
    await tierCard.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: /delete tier/i }).click();
    await page.getByText("Verify Tier Plus deleted").waitFor({ timeout: 10000 });
    await page.waitForTimeout(1000);
    const tierGone = await page.getByText("Verify Tier Plus", { exact: true }).count();
    check("tier deleted from list", tierGone === 0, `remaining=${tierGone}`);

    // ── Gyms: tier deleted while gym is tombstoned → attach on restore ──
    // Create a custom tier and point this run's gym at it.
    await page.getByRole("button", { name: /new tier/i }).click();
    await page.locator('input[placeholder="e.g. premium"]').fill(`gymt-${ts}`);
    await page.locator('input[placeholder="e.g. Premium"]').fill("Gym Tier Hold");
    await page.locator('input[placeholder="e.g. 799"]').fill("299");
    await page.locator('input[placeholder="e.g. For growing operators"]').fill("Held by a tombstoned gym");
    await page.getByRole("button", { name: /create tier/i }).click();
    await page.getByText("Tier created", { exact: true }).waitFor({ timeout: 10000 });

    await page.goto(`${BASE}/platform/gyms`);
    let holdRow = page.locator("tr", { hasText: `Verify Gym ${ts}` }).first();
    await holdRow.waitFor({ timeout: 15000 });
    await holdRow.getByRole("button", { name: "Edit" }).click();
    await page.locator("#gym-edit-tier").selectOption("gymt-" + ts);
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.getByText("Gym updated").waitFor({ timeout: 10000 });

    // Delete the gym, then its tier — must succeed (a tombstoned gym no
    // longer pins the tier).
    holdRow = page.locator("tr", { hasText: `Verify Gym ${ts}` }).first();
    await holdRow.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: /delete gym/i }).click();
    await page.getByText(new RegExp(`Verify Gym ${ts} deleted`)).waitFor({ timeout: 10000 });
    await page.waitForTimeout(1000);

    await page.goto(`${BASE}/platform/subscriptions`);
    const holdCard = page.locator("div.rounded-2xl").filter({ hasText: "Gym Tier Hold" }).first();
    await holdCard.waitFor({ timeout: 15000 });
    await holdCard.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: /delete tier/i }).click();
    await page.getByText("Gym Tier Hold deleted").waitFor({ timeout: 10000 });
    await page.waitForTimeout(1000);
    const holdGone = await page.getByText("Gym Tier Hold", { exact: true }).count();
    check("tier deleted while only a deleted gym referenced it", holdGone === 0, `remaining=${holdGone}`);

    // Restore must now offer attaching an active subscription.
    await page.goto(`${BASE}/platform/gyms`);
    const showDeletedHold = page.locator('label:has-text("Show deleted") input');
    await showDeletedHold.check();
    const deadRow = page.locator("tr", { hasText: `Verify Gym ${ts}` }).first();
    await deadRow.waitFor({ timeout: 15000 });
    await deadRow.getByRole("button", { name: "Restore" }).click();
    await must(
      "attach subscription modal opens on restore",
      page.getByText("Attach a subscription").waitFor({ timeout: 10000 }),
    );
    await page.locator("#attach-tier").selectOption("starter");
    await page.getByRole("button", { name: /restore gym/i }).click();
    await must(
      "gym restored after attaching active tier",
      page.getByText(new RegExp(`Verify Gym ${ts} restored`)).waitFor({ timeout: 10000 }),
    );
    await showDeletedHold.uncheck();
    const attachedRow = page.locator("tr", { hasText: `Verify Gym ${ts}` }).first();
    await attachedRow.waitFor({ timeout: 15000 });
    const attachedText = await attachedRow.innerText();
    check(
      "restored gym back in live list on attached tier",
      attachedText.toLowerCase().includes("starter"),
      attachedText.slice(0, 80),
    );

    // ── Settings (platform admin): split name + frozen email + checklist ──
    await page.goto(`${BASE}/settings`);
    let seededFirst = "";
    let seededLast = "";
    await must(
      "settings: profile inputs render with frozen email",
      (async () => {
        const firstInput = page.locator("#settings-first-name");
        await firstInput.waitFor({ timeout: 15000 });
        seededFirst = await firstInput.inputValue();
        seededLast = await page.locator("#settings-last-name").inputValue();
        const emailInput = page.locator("#settings-email");
        await emailInput.waitFor({ timeout: 5000 });
        if (seededFirst !== "Platform" || seededLast !== "Admin") {
          throw new Error(`fixture name drifted: "${seededFirst} ${seededLast}"`);
        }
        if (!(await emailInput.isDisabled())) throw new Error("email input not disabled");
        if ((await emailInput.getAttribute("readonly")) === null) {
          throw new Error("email input not readonly");
        }
        const emailVal = await emailInput.inputValue();
        if (emailVal !== ADMIN.email) throw new Error(`email=${emailVal}`);
      })(),
    );

    // Split-name save persists, then restore the seeded values so the
    // fixture full_name ("Platform Admin") stays intact for other runs.
    // The restore runs in `finally` so a failed toast wait can never leave
    // the shared fixture renamed (the next run would then die on the
    // fixture-name assertion with no self-heal).
    try {
      await must(
        "settings: split-name save persists",
        (async () => {
          await page.locator("#settings-last-name").fill("E2E Temp");
          await page.getByRole("button", { name: "Save changes" }).click();
          await page.getByText("Profile updated").waitFor({ timeout: 10000 });
        })(),
      );
    } catch {
      // must() already recorded this check as failed (and marked the error
      // named); swallow it so the finally-block restore and the remaining
      // checks still run and get reported.
    } finally {
      // Toasts are manual-dismiss only — clear any toast so the wait
      // below observes THIS save's toast, not a previous one.
      const dismissToast = page.locator('button[aria-label="Dismiss"]');
      if ((await dismissToast.count()) > 0) {
        await dismissToast.click();
        await dismissToast.waitFor({ state: "detached", timeout: 5000 });
      }
      await must(
        "settings: seeded names restored",
        (async () => {
          await page.locator("#settings-first-name").fill(seededFirst);
          await page.locator("#settings-last-name").fill(seededLast);
          await page.getByRole("button", { name: "Save changes" }).click();
          await page.getByText("Profile updated").waitFor({ timeout: 10000 });
        })(),
      );
    }

    check(
      "settings: role/permissions sections absent",
      (await page.getByText("Granted permissions").count()) === 0 &&
        (await page.getByText("Your role & permissions").count()) === 0,
    );

    check(
      "settings: password card renders",
      (await page.locator("#settings-current-password").count()) === 1 &&
        (await page.locator("#settings-new-password").count()) === 1 &&
        (await page.locator("#settings-confirm-password").count()) === 1 &&
        (await page.getByRole("button", { name: "Update password" }).count()) === 1,
    );

    // Checklist is live; do NOT click Update password — the admin fixture
    // password must stay admin-pass-123 for other e2e scripts (the API
    // success path is covered by pytest).
    await must(
      "settings: live checklist fails weak then passes strong",
      (async () => {
        await page.locator("#settings-current-password").fill("whatever-1");
        await page.locator("#settings-new-password").fill("alllowercase1!");
        await page.waitForFunction(
          () => {
            const ul = document.querySelector('ul[aria-label="Password strength"]');
            if (!ul) return false;
            const rows = [...ul.querySelectorAll("li")];
            const upper = rows.find((li) => (li.textContent ?? "").includes("Uppercase letter"));
            const btn = [...document.querySelectorAll("button")].find((b) =>
              /update password/i.test(b.textContent ?? ""),
            );
            return (
              rows.filter((li) => (li.textContent ?? "").includes("✗")).length > 0 &&
              (upper?.textContent ?? "").includes("✗") &&
              btn?.disabled === true
            );
          },
          null,
          { timeout: 5000 },
        );
        await page.locator("#settings-new-password").fill("Owner-Pass-123!");
        await page.locator("#settings-confirm-password").fill("Owner-Pass-123!");
        await page.waitForFunction(
          () => {
            const ul = document.querySelector('ul[aria-label="Password strength"]');
            if (!ul) return false;
            const rows = [...ul.querySelectorAll("li")];
            const btn = [...document.querySelectorAll("button")].find((b) =>
              /update password/i.test(b.textContent ?? ""),
            );
            return (
              rows.length === 5 &&
              rows.every((li) => (li.textContent ?? "").includes("✓")) &&
              btn?.disabled === false
            );
          },
          null,
          { timeout: 5000 },
        );
      })(),
    );

    await page.locator("#settings-confirm-password").fill("Mismatch-Pass-1!");
    await must(
      "settings: mismatch hint shows, then fields cleared",
      (async () => {
        await page.getByText("Passwords do not match.").waitFor({ timeout: 5000 });
        await page.locator("#settings-current-password").fill("");
        await page.locator("#settings-new-password").fill("");
        await page.locator("#settings-confirm-password").fill("");
        await page
          .getByText("Passwords do not match.")
          .waitFor({ state: "detached", timeout: 5000 });
        for (const id of [
          "#settings-current-password",
          "#settings-new-password",
          "#settings-confirm-password",
        ]) {
          if ((await page.locator(id).inputValue()) !== "") throw new Error(`${id} not cleared`);
        }
      })(),
    );

    await must(
      "settings: ends with clean toast + untouched form",
      (async () => {
        const dismiss = page.locator('button[aria-label="Dismiss"]');
        if ((await dismiss.count()) > 0) {
          await dismiss.click();
          await dismiss.waitFor({ state: "detached", timeout: 5000 });
        }
        if ((await page.getByText("Profile updated").count()) > 0) {
          throw new Error("stale toast still visible");
        }
        if ((await page.getByText("Passwords do not match.").count()) > 0) {
          throw new Error("stale mismatch hint still visible");
        }
        if ((await page.locator("#settings-first-name").inputValue()) !== seededFirst) {
          throw new Error("first name drifted at end");
        }
        if ((await page.locator("#settings-last-name").inputValue()) !== seededLast) {
          throw new Error("last name drifted at end");
        }
        if ((await page.locator("#settings-email").inputValue()) !== ADMIN.email) {
          throw new Error("email drifted at end");
        }
      })(),
    );

    // ── Platform revenue: MoM chart + sold list ──
    await page.goto(`${BASE}/platform/revenue`);
    await page.getByText("Subscription revenue").waitFor({ timeout: 15000 });
    const bars = await page.locator(".flex.h-44 > div").count();
    check("revenue MoM chart renders 12 month bars", bars === 12, `bars=${bars}`);
    await page.waitForTimeout(800);
    const firstBar = await page.locator(".flex.h-44 > div").first().locator("> div").first().boundingBox();
    check("revenue bars have visible height", !!firstBar && firstBar.height > 2, firstBar ? `h=${firstBar.height.toFixed(1)}` : "no box");
    await must("revenue sold list section renders", page.getByText("Subscriptions sold", { exact: true }).waitFor({ timeout: 15000 }));
  } catch (err) {
    if (!(err && typeof err === "object" && err.named)) {
      check("unexpected failure", false, String(err).slice(0, 300));
    }
    await page.screenshot({ path: "/tmp/opencode/platform_verify_fail.png", fullPage: true }).catch(() => {});
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
