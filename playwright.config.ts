import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "phone",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command:
        "node --import ./tests/google-provider.mjs node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100/login",
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command:
        "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3101",
      url: "http://127.0.0.1:3101/login",
      env: {
        PRIVATE_OWNER_EMAIL: "",
        BETTER_AUTH_URL: "http://127.0.0.1:3101",
      },
      reuseExistingServer: false,
    },
    {
      command:
        "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3102",
      url: "http://127.0.0.1:3102/login",
      env: {
        BETTER_AUTH_URL: "http://127.0.0.1:3102",
        APPLE_CLIENT_SECRET: "",
      },
      reuseExistingServer: false,
    },
  ],
});
