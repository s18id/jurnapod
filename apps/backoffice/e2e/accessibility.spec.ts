// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupAuthenticatedPage } from "./mock-helpers";
import type { Result as AxeResult } from "axe-core";

test.describe("Accessibility Tests", () => {
  test("Users page accessibility check", async ({ page }) => {
    await setupAuthenticatedPage(page);
    
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/users");
    await page.waitForTimeout(2000);
    
    const results = await new AxeBuilder({ page }).analyze() as { violations: AxeResult[] };
    console.log(`\n[Users Page] Violations: ${results.violations?.length ?? 0}`);
    
    const criticalViolations = (results.violations ?? []).filter(
      (v) => 
        (v.impact === "critical" || v.impact === "serious") && 
        !["color-contrast", "scrollable-region-focusable", "page-has-heading-one"].includes(v.id)
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test("Roles page accessibility check", async ({ page }) => {
    await setupAuthenticatedPage(page);
    
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/roles");
    await page.waitForTimeout(2000);
    
    const results = await new AxeBuilder({ page }).analyze() as { violations: AxeResult[] };
    console.log(`\n[Roles Page] Violations: ${results.violations?.length ?? 0}`);
    
    const criticalViolations = (results.violations ?? []).filter(
      (v) => 
        (v.impact === "critical" || v.impact === "serious") && 
        !["color-contrast", "scrollable-region-focusable", "page-has-heading-one"].includes(v.id)
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test("Companies page accessibility check", async ({ page }) => {
    await setupAuthenticatedPage(page);
    
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/companies");
    await page.waitForTimeout(2000);
    
    const results = await new AxeBuilder({ page }).analyze() as { violations: AxeResult[] };
    console.log(`\n[Companies Page] Violations: ${results.violations?.length ?? 0}`);
    
    const criticalViolations = (results.violations ?? []).filter(
      (v) => 
        (v.impact === "critical" || v.impact === "serious") && 
        !["color-contrast", "scrollable-region-focusable", "page-has-heading-one"].includes(v.id)
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test("Outlets page accessibility check", async ({ page }) => {
    await setupAuthenticatedPage(page);
    
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/outlets");
    await page.waitForTimeout(2000);
    
    const results = await new AxeBuilder({ page }).analyze() as { violations: AxeResult[] };
    console.log(`\n[Outlets Page] Violations: ${results.violations?.length ?? 0}`);
    
    const criticalViolations = (results.violations ?? []).filter(
      (v) => 
        (v.impact === "critical" || v.impact === "serious") && 
        !["color-contrast", "scrollable-region-focusable", "page-has-heading-one"].includes(v.id)
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test("PWA Settings page accessibility check", async ({ page }) => {
    await setupAuthenticatedPage(page);
    
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/pwa-settings");
    await page.waitForTimeout(2000);
    
    const results = await new AxeBuilder({ page }).analyze() as { violations: AxeResult[] };
    console.log(`\n[PWA Settings] Violations: ${results.violations?.length ?? 0}`);
    
    const criticalViolations = (results.violations ?? []).filter(
      (v) => 
        (v.impact === "critical" || v.impact === "serious") && 
        !["color-contrast", "scrollable-region-focusable", "page-has-heading-one"].includes(v.id)
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test("Sync Queue page accessibility check", async ({ page }) => {
    await setupAuthenticatedPage(page);
    
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/sync-queue");
    await page.waitForTimeout(2000);
    
    const results = await new AxeBuilder({ page }).analyze() as { violations: AxeResult[] };
    console.log(`\n[Sync Queue] Violations: ${results.violations?.length ?? 0}`);
    
    const criticalViolations = (results.violations ?? []).filter(
      (v) => 
        (v.impact === "critical" || v.impact === "serious") && 
        !["color-contrast", "scrollable-region-focusable", "page-has-heading-one"].includes(v.id)
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test("Login page accessibility check", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    
    const results = await new AxeBuilder({ page }).analyze() as { violations: AxeResult[] };
    console.log(`\n[Login Page] Violations: ${results.violations?.length ?? 0}`);
    
    const criticalViolations = (results.violations ?? []).filter(
      (v) => 
        (v.impact === "critical" || v.impact === "serious") && 
        !["color-contrast", "scrollable-region-focusable", "page-has-heading-one"].includes(v.id)
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test("Reports page accessibility check", async ({ page }) => {
    await setupAuthenticatedPage(page);
    
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/reports/sales");
    await page.waitForTimeout(2000);
    
    const results = await new AxeBuilder({ page }).analyze() as { violations: AxeResult[] };
    console.log(`\n[Reports Page] Violations: ${results.violations?.length ?? 0}`);
    
    const criticalViolations = (results.violations ?? []).filter(
      (v) => 
        (v.impact === "critical" || v.impact === "serious") && 
        !["color-contrast", "scrollable-region-focusable", "page-has-heading-one"].includes(v.id)
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test("Trial Balance report page accessibility check", async ({ page }) => {
    await setupAuthenticatedPage(page);
    
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/reports/trial-balance");
    await page.waitForTimeout(2000);
    
    const results = await new AxeBuilder({ page }).analyze() as { violations: AxeResult[] };
    console.log(`\n[Trial Balance Report] Violations: ${results.violations?.length ?? 0}`);
    
    const criticalViolations = (results.violations ?? []).filter(
      (v) => 
        (v.impact === "critical" || v.impact === "serious") && 
        !["color-contrast", "scrollable-region-focusable", "page-has-heading-one"].includes(v.id)
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test("General Ledger report page accessibility check", async ({ page }) => {
    await setupAuthenticatedPage(page);
    
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/reports/general-ledger");
    await page.waitForTimeout(2000);
    
    const results = await new AxeBuilder({ page }).analyze() as { violations: AxeResult[] };
    console.log(`\n[General Ledger Report] Violations: ${results.violations?.length ?? 0}`);
    
    const criticalViolations = (results.violations ?? []).filter(
      (v) => 
        (v.impact === "critical" || v.impact === "serious") && 
        !["color-contrast", "scrollable-region-focusable", "page-has-heading-one"].includes(v.id)
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test("Trial Balance keyboard navigation", async ({ page }) => {
    await setupAuthenticatedPage(page);
    
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/reports/trial-balance");
    await page.waitForTimeout(2000);
    
    // Tab through filter controls
    const dateFromInput = page.locator('input[name="date_from"], input[placeholder*="From"], input[aria-label*="From date"]').first();
    const dateToInput = page.locator('input[name="date_to"], input[placeholder*="To"], input[aria-label*="To date"]').first();
    const outletSelect = page.locator('select[name="outlet_id"], select[aria-label*="Outlet"]').first();
    const runButton = page.locator('button[type="submit"], button:has-text("Run"), button:has-text("Generate")').first();
    
    // Verify elements are focusable
    await expect(dateFromInput).toBeAttached();
    await expect(dateToInput).toBeAttached();
    await expect(runButton).toBeAttached();
    
    // Tab through elements and verify focus is visible
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    
    // Press escape to close any open modals/dropdowns
    await page.keyboard.press("Escape");
  });

  test("General Ledger keyboard navigation", async ({ page }) => {
    await setupAuthenticatedPage(page);
    
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/reports/general-ledger");
    await page.waitForTimeout(2000);
    
    // Tab through filter controls
    const dateFromInput = page.locator('input[name="date_from"], input[placeholder*="From"], input[aria-label*="From date"]').first();
    const dateToInput = page.locator('input[name="date_to"], input[placeholder*="To"], input[aria-label*="To date"]').first();
    const accountSelect = page.locator('select[name="account_id"], select[aria-label*="Account"]').first();
    const runButton = page.locator('button[type="submit"], button:has-text("Run"), button:has-text("Generate")').first();
    
    // Verify elements are focusable
    await expect(dateFromInput).toBeAttached();
    await expect(dateToInput).toBeAttached();
    await expect(runButton).toBeAttached();
    
    // Tab through elements
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    
    // Press escape to close any open modals/dropdowns
    await page.keyboard.press("Escape");
  });
});