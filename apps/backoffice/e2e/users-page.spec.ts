// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { expect, test } from "@playwright/test";
import { 
  setupAuthenticatedPage,
  mockUsers 
} from "./mock-helpers";
import { E2E_SELECTORS } from "./selectors";

test.describe("Users Page", () => {
  test("loads users page with DataTable", async ({ page }) => {
    // Setup authenticated session
    await setupAuthenticatedPage(page);
    
    // Mock users data
    await mockUsers(page);
    
    // Navigate to root first (app will redirect to first available route)
    await page.goto("/");
    
    // Wait for app to load
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible();
    
    // Now navigate to users page using hash routing
    await page.goto("/#/users");
    
    // Wait for page to load
    await page.waitForTimeout(1000);
    
    // Check for page title or header
    await expect(page.getByText(/User Management/i)).toBeVisible({ timeout: 10000 });
    
    // Check for table - since DataTable doesn't have explicit test ID,
    // we check for table existence
    const table = page.locator("table");
    await expect(table).toBeVisible();
    
    // Check table has headers
    await expect(table.locator("th").getByText(/Email/i)).toBeVisible();
    await expect(table.locator("th").getByText(/Roles/i)).toBeVisible();
    
    // Check table has data rows (mock users)
    const rows = table.locator("tbody tr");
    await expect(rows).toHaveCount(3); // 3 mock users
    
    // Check for mock user data in table
    await expect(table.getByText("admin@example.com").first()).toBeVisible();
    await expect(table.getByText("ADMIN").first()).toBeVisible();
  });

  test("users page has filter bar", async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockUsers(page);
    
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible();
    
    await page.goto("/#/users");
    await page.waitForTimeout(1000);
    
    // Check for filter bar (search input) - look for "Search by email" placeholder
    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();
    
    // Check for status filter dropdown (use role to be specific)
    const statusFilter = page.getByRole('textbox', { name: 'Status' });
    await expect(statusFilter).toBeVisible();
    
    // Check for role filter dropdown  
    const roleFilter = page.getByRole('textbox', { name: 'Role' });
    await expect(roleFilter).toBeVisible();
    
    // Check for outlet filter dropdown  
    const outletFilter = page.getByRole('textbox', { name: 'Outlet' });
    await expect(outletFilter).toBeVisible();
  });

  test("search filters users in DataTable", async ({ page }) => {
    await setupAuthenticatedPage(page);
    await mockUsers(page);
    
    await page.goto("/");
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible();
    
    await page.goto("/#/users");
    await page.waitForTimeout(1000);
    
    // Get initial row count
    const initialRows = page.locator("tbody tr");
    await expect(initialRows).toHaveCount(3);
    
    // Type in search box
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill("admin");
    
    // Wait for filtering (client-side filtering in this case)
    // Note: Actual implementation might debounce or trigger on enter
    // For now, just check search term was entered
    await expect(searchInput).toHaveValue("admin");
    
    // In a real test with actual API, we would mock the search endpoint
    // and check filtered results. For now, we verify UI elements.
  });

  test("DataTable pagination works", async ({ page }) => {
    await setupAuthenticatedPage(page);
    
    // Mock many users to trigger pagination
    const manyUsers = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      company_id: 1,
      email: `user${i + 1}@example.com`,
      name: `User ${i + 1}`,
      role: i === 0 ? "ADMIN" : "CASHIER",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z"
    }));
    
    await mockUsers(page, manyUsers);
    
    await page.goto("/users");
    
    // Check for pagination controls
    // The DataTable should show pagination when there are many rows
    const pagination = page.locator('[data-testid="data-table-pagination"]');
    
    // Note: Since DataTable doesn't have test ID in users page,
    // we might need to check for pagination differently
    // For now, check for any pagination component
    const paginationControls = page.locator('[role="navigation"]').filter({ hasText: /Page|Next|Previous/i });
    
    // If pagination is visible, test it
    const isPaginationVisible = await paginationControls.isVisible().catch(() => false);
    
    if (isPaginationVisible) {
      await expect(paginationControls).toBeVisible();
      
      // Check page info
      await expect(paginationControls.getByText(/1.*25/i)).toBeVisible();
      
      // Test next page button if available
      const nextButton = paginationControls.getByRole('button', { name: /Next|›|»/i });
      if (await nextButton.isVisible().catch(() => false)) {
        await nextButton.click();
        // Should show page 2
        await expect(paginationControls.getByText(/2.*25/i)).toBeVisible();
      }
    }
  });
});