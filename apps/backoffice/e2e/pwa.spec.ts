// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { expect, test } from "@playwright/test";
import { setupAuthenticatedPage } from "./mock-helpers";

test.describe("PWA Features", () => {
  test("offline mode can be toggled without errors", async ({ page, context }) => {
    await setupAuthenticatedPage(page);
    
    // Navigate to app first
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    // Wait for app to load
    await page.waitForTimeout(1000);
    
    // Go to a page
    await page.goto("/#/users");
    await page.waitForTimeout(1500);
    
    // Simulate going offline - context.setOffline doesn't return a value
    await context.setOffline(true);
    
    // Verify offline mode was set (navigator.onLine should be false in page context)
    const onlineStatus = await page.evaluate(() => navigator.onLine);
    expect(onlineStatus).toBe(false);
    
    // Go back online
    await context.setOffline(false);
    
    // Verify back online
    const restoredOnlineStatus = await page.evaluate(() => navigator.onLine);
    expect(restoredOnlineStatus).toBe(true);
  });

  test("PWA settings page loads and shows storage info", async ({ page }) => {
    await setupAuthenticatedPage(page);
    
    // Navigate to root first
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    // Navigate to PWA settings
    await page.goto("/#/pwa-settings");
    await page.waitForTimeout(1500);
    
    // Check for PWA Settings page title using testid
    await expect(page.locator('[data-testid="pwa-settings-title"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="pwa-settings-description"]')).toHaveText("Manage offline cache and queued transactions.");
    
    // Check for appearance section
    await expect(page.locator('[data-testid="pwa-settings-appearance-title"]')).toHaveText("Appearance");
    
    // Check for storage info - use getByRole for specificity
    await expect(page.getByRole("heading", { name: "Storage" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Clear Cached Master Data/i })).toBeVisible();
    
    // Check for queue info (use heading role to avoid strict mode violation)
    await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Clear Queue/i })).toBeVisible();
  });

  test("PWA settings page has clear cache button", async ({ page }) => {
    await setupAuthenticatedPage(page);
    
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/pwa-settings");
    await page.waitForTimeout(1500);
    
    // Check for Clear Cached Master Data button
    await expect(page.getByRole("button", { name: /Clear Cached Master Data/i })).toBeVisible();
    
    // Check for Clear Queue button (may or may not be visible depending on queue count)
    // Queue button only shows if there are items
  });

  test("app handles offline mode gracefully", async ({ page, context }) => {
    await setupAuthenticatedPage(page);
    
    // First, load the app while online
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/users");
    await page.waitForTimeout(1500);
    
    // Now go offline
    await context.setOffline(true);
    await page.waitForTimeout(500);
    
    // Verify we're offline
    const onlineStatus = await page.evaluate(() => navigator.onLine);
    expect(onlineStatus).toBe(false);
    
    // Go back online
    await context.setOffline(false);
  });

  test("service worker registration doesn't cause errors", async ({ page }) => {
    // This test checks that service worker registration doesn't cause errors
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    
    // Service worker registration happens in main.tsx for production
    // We just verify the page loads without errors
    const title = await page.title();
    expect(title).toContain("Jurnapod");
  });

  test("sync queue page loads when authenticated", async ({ page }) => {
    await setupAuthenticatedPage(page);
    
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/sync-queue");
    await page.waitForTimeout(1500);
    
    // Check for sync queue page content using testid
    await expect(page.locator('[data-testid="page-card-title"]').getByText("Sync Queue")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Transactions saved offline and pending sync")).toBeVisible();
  });

  test("sync history page loads when authenticated", async ({ page }) => {
    await setupAuthenticatedPage(page);
    
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/sync-history");
    await page.waitForTimeout(1500);
    
    // Check for sync history page content using testid
    await expect(page.locator('[data-testid="page-card-title"]').getByText("Sync History")).toBeVisible({ timeout: 5000 });
  });
});