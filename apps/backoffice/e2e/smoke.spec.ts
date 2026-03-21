// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { expect, test } from "@playwright/test";

test("backoffice app loads", async ({ page }) => {
  // Mock health endpoint to avoid API dependency
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { service: "jurnapod-api" } })
    });
  });

  // Mock login endpoint to avoid redirect
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ success: false, error: "Not authenticated" })
    });
  });

  // Go to the backoffice app
  await page.goto("/");
  
  // Check that the page contains something indicative of the app
  // This could be a login form, title, or specific text
  await expect(page).toHaveTitle(/Jurnapod|Backoffice/i);
  
  // Check for presence of login elements or app container
  const hasLoginForm = await page.getByLabel("Company Code").isVisible().catch(() => false);
  const hasAppContainer = await page.locator("#root").isVisible().catch(() => false);
  
  // At least one should be visible
  expect(hasLoginForm || hasAppContainer).toBeTruthy();
});