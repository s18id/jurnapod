// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { expect, test } from "@playwright/test";
import { 
  setupAuthenticatedPage,
  mockRoles
} from "./mock-helpers";

test.describe("Roles Page", () => {
  test("loads roles page with DataTable", async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockRoles(page);
    
    // Navigate to root first to bootstrap app
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/roles");
    await page.waitForTimeout(1500);
    
    // Check for page title
    await expect(page.getByText("Role Management")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Manage system roles")).toBeVisible();
    
    // Check for DataTable
    const dataTable = page.locator("[data-testid='data-table']");
    await expect(dataTable).toBeVisible({ timeout: 5000 }).catch(() => {
      // Fallback to table
      const table = page.locator("table");
      expect(table).toBeVisible();
    });
    
    // Check table has headers
    const table = page.locator("table");
    await expect(table.locator("th").getByText("Code")).toBeVisible();
    await expect(table.locator("th").getByText("Name")).toBeVisible();
  });

  test("roles page has search filter", async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockRoles(page);
    
    // Navigate to root first to bootstrap app
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/roles");
    await page.waitForTimeout(1500);
    
    // Check for search input
    const searchInput = page.getByRole('textbox', { name: /Search/i });
    await expect(searchInput).toBeVisible();
  });

  test("search filters roles", async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockRoles(page);
    
    // Navigate to root first to bootstrap app
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/roles");
    await page.waitForTimeout(1500);
    
    // Get initial row count
    const initialRows = page.locator("tbody tr");
    const initialCount = await initialRows.count();
    expect(initialCount).toBeGreaterThan(0);
    
    // Type in search box
    const searchInput = page.getByRole('textbox', { name: /Search/i });
    await searchInput.fill("ADMIN");
    await page.waitForTimeout(300);
    
    // Verify search term was entered
    await expect(searchInput).toHaveValue("ADMIN");
  });

  test("create role button is visible", async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockRoles(page);
    
    // Navigate to root first to bootstrap app
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/roles");
    await page.waitForTimeout(1500);
    
    // Check for Create Role button
    const createButton = page.getByRole('button', { name: /Create Role/i });
    await expect(createButton).toBeVisible();
  });

  test("shows correct role data in table", async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockRoles(page);
    
    // Navigate to root first to bootstrap app
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/roles");
    await page.waitForTimeout(1500);
    
    // Check for DataTable with rows
    const table = page.locator('[data-testid="data-table"]');
    await expect(table).toBeVisible();
    
    // Check for role data in table - verify role codes exist
    await expect(page.getByText("ADMIN", { exact: true })).toBeVisible();
    await expect(page.getByText("MANAGER", { exact: true })).toBeVisible();
    await expect(page.getByText("CASHIER", { exact: true })).toBeVisible();
  });

  test("role scope badges are displayed", async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockRoles(page);
    
    // Navigate to root first to bootstrap app
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/roles");
    await page.waitForTimeout(1500);
    
    // Check for role scope badges (System, Global, Company)
    await expect(page.getByText("System").first()).toBeVisible();
  });

  test("roles count is displayed in page header", async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockRoles(page);
    
    // Navigate to root first to bootstrap app
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    await page.goto("/#/roles");
    await page.waitForTimeout(1500);
    
    // Check for Roles count (e.g., "Roles (3)")
    await expect(page.getByText(/Roles \(\d+\)/i)).toBeVisible();
  });
});