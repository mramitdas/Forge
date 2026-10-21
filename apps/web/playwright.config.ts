import { defineConfig } from "@playwright/test";

// E2E runs against the RUNNING dev servers (make dev → :8000, make web →
// :3000). No webServer block on purpose — never let Playwright start/stop
// the servers mid-session.
export default defineConfig({
  testDir: ".",
  testMatch: /e2e\/platform\/.*\.(spec|setup)\.ts/,
  timeout: 60_000,
  retries: 1,
  // RULE: Playwright runs with 1 worker only — default cpus/2 freezes the
  // machine via parallel Next dev compiles + bcrypt. Speed is recovered by
  // the auth-setup route warmup below. Never pass `--workers` > 1; run the
  // suite via `make e2e`. Debug failures with `--trace on-first-retry`.
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
  },
  projects: [
    { name: "auth-setup", testMatch: /e2e\/platform\/auth\.setup\.ts/ },
    {
      name: "platform",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["auth-setup"],
      use: {
        storageState: "test-results/.auth/admin.json",
      },
    },
  ],
});
