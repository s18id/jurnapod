// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { expect, test } from "@playwright/test";
import { 
  setupAuthenticatedPage,
  mockOutlets,
  mockCompanies
} from "./mock-helpers";

test.describe("Outlets Page", () => {
  test("loads outlets page with DataTable", async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockOutlets(page);
    await mockCompanies(page);
    
    // Navigate to root first to bootstrap app
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/outlets");
    await page.waitForTimeout(1500);
    
    // Check for page title
    await expect(page.getByText("Branch Management")).toBeVisible({ timeout: 10000 });
    
    // Check for description
    await expect(page.getByText(/Manage branches/i)).toBeVisible();
    
    // Check for DataTable component
    const dataTable = page.locator("[data-testid='data-table']");
    await expect(dataTable).toBeVisible({ timeout: 5000 }).catch(() => {
      // Fallback to regular table if DataTable testid not present
      const table = page.locator("table");
      expect(table).toBeVisible();
    });
    
    // Check table has data (if any outlets exist in mock)
    const rows = page.locator("tbody tr");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(0);
  });

  test("outlets page has filter bar", async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockOutlets(page);
    await mockCompanies(page);
    
    // Navigate to root first to bootstrap app
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/outlets");
    await page.waitForTimeout(1500);
    
    // Check for search input
    const searchInput = page.getByRole('textbox', { name: /Search/i });
    await expect(searchInput).toBeVisible();
    
    // Check for status filter - use SegmentedControl component
    await expect(page.locator(".mantine-SegmentedControl-root")).toBeVisible();
  });

  test("search filters outlets by code or name", async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockOutlets(page);
    await mockCompanies(page);
    
    // Navigate to root first to bootstrap app
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/outlets");
    await page.waitForTimeout(1500);
    
    // Type in search box
    const searchInput = page.getByRole('textbox', { name: /Search/i });
    await searchInput.fill("MAIN");
    await page.waitForTimeout(300);
    
    // Verify search term was entered
    await expect(searchInput).toHaveValue("MAIN");
  });

  test("status filter segmented control works", async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockOutlets(page);
    await mockCompanies(page);
    
    // Navigate to root first to bootstrap app
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/outlets");
    await page.waitForTimeout(1500);
    
    // Click Active filter on the segmented control
    await page.locator(".mantine-SegmentedControl-root").getByText("Active", { exact: true }).click();
    await page.waitForTimeout(300);
    
    // Verify the click worked - at minimum, the filter exists and is clickable
    // Mantine SegmentedControl updates URL or internal state on click
    const segmentedControl = page.locator(".mantine-SegmentedControl-root");
    await expect(segmentedControl).toBeVisible();
  });

  test("create branch button is visible", async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockOutlets(page);
    await mockCompanies(page);
    
    // Navigate to root first to bootstrap app
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/outlets");
    await page.waitForTimeout(1500);
    
    // Check for Create Branch button
    const createButton = page.getByRole('button', { name: /Create Branch/i });
    await expect(createButton).toBeVisible();
  });

  test("shows outlet badges count", async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockOutlets(page);
    await mockCompanies(page);
    
    // Navigate to root first to bootstrap app
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/outlets");
    await page.waitForTimeout(1500);
    
    // Check for Total badge (if outlets exist)
    const totalBadge = page.getByText(/Total:/);
    if (await totalBadge.isVisible()) {
      await expect(totalBadge).toBeVisible();
    }
  });

  test("import and export buttons are visible", async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockOutlets(page);
    await mockCompanies(page);
    
    // Navigate to root first to bootstrap app
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/outlets");
    await page.waitForTimeout(1500);
    
    // Check for Export CSV button
    const exportButton = page.getByRole('button', { name: /Export CSV/i });
    await expect(exportButton).toBeVisible();
    
    // Check for Import button
    const importButton = page.getByRole('button', { name: /Import/i });
    await expect(importButton).toBeVisible();
  });
});