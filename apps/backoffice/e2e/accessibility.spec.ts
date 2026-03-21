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
});