import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", fullyParallel: false, retries: 0, reporter: "list",
  use: { baseURL: "https://127.0.0.1:5186", ignoreHTTPSErrors: true, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "python ../../tools/deploy/serve_test_package.py",
    url: "https://127.0.0.1:5186/health/live", ignoreHTTPSErrors: true, reuseExistingServer: false, timeout: 30000,
  },
});
