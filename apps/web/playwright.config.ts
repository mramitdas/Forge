import { defineConfig } from "@playwright/test";

// E2E runs against the RUNNING dev servers (make dev → :8000, make web →
// :3000). No webServer block on purpose — never let Playwright start/stop
// the servers mid-session.
export default defineConfig({
  testDir: ".",
  testMatch: /e2e\/platform\/.*\.(spec|setup)\.ts/,
  timeout: 60_000,
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
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
