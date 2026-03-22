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

  // Mock user endpoint - return 401 to show login page
  await page.route("**/api/users/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ success: false, error: "Not authenticated" })
    });
  });

  // Go to the backoffice app
  await page.goto("/");
  
  // Wait for the page to settle
  await page.waitForLoadState("domcontentloaded");
  
  // Check that the page title contains Jurnapod or Backoffice
  await expect(page).toHaveTitle(/Jurnapod|Backoffice/i, { timeout: 10000 });
  
  // Check for presence of login form elements
  const hasLoginForm = await page.getByLabel("Company Code").isVisible().catch(() => false);
  
  // The login form should be visible since we're not authenticated
  await expect(page.locator('[data-testid="login-company-code"]')).toBeVisible({ timeout: 5000 });
});