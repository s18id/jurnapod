// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { defineConfig, devices } from "@playwright/test";

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.real.spec.ts",
  timeout: 45_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: [
    {
      command: "npm run dev -w @jurnapod/api",
      url: `${apiBaseUrl}/api/health`,
      reuseExistingServer: true,
      timeout: 120_000
    },
    {
      command: `VITE_API_BASE_URL=${apiBaseUrl} npm run qa:pwa:build -w @jurnapod/pos && VITE_API_BASE_URL=${apiBaseUrl} npm run qa:pwa:preview -w @jurnapod/pos`,
      url: "http://127.0.0.1:4173",
      reuseExistingServer: true,
      timeout: 120_000
    }
  ]
});
