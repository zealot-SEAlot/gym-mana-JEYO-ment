import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "e2e",
  // A test.only left in a spec would silently skip every other test in CI
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Keep a step-by-step recording of each failed test; open it with `npx playwright show-trace`
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Test the built page, the way the gym PC will serve it, not the development server
    command: `npm run build --workspace @jeyos/client && npm run preview --workspace @jeyos/client -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Never reuse a server that is already running, since it may be showing an old build
    reuseExistingServer: false,
  },
});
