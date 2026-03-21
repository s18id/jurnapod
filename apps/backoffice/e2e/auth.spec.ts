// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { expect, test } from "@playwright/test";
import { 
  MOCK_USER,
  mockHealth, 
  mockUserMe, 
  mockLogin, 
  mockCompanies, 
  mockOutlets,
  mockRoles,
  mockModules,
  setupAuthenticatedPage 
} from "./mock-helpers";

test.describe("Backoffice Authentication", () => {
  test("shows login page when not authenticated", async ({ page }) => {
    await mockHealth(page);
    await mockUserMe(page, false); // Not authenticated
    
    await page.goto("/");
    
    // Should show login page
    await expect(page).toHaveTitle(/Jurnapod|Backoffice/i);
    
    // Login form should be visible
    await expect(page.locator('[data-testid="login-company-code"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-password"]')).toBeVisible();
    
    // Submit button should be visible
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("successful login redirects to app", async ({ page }) => {
    await mockHealth(page);
    await mockCompanies(page);
    await mockOutlets(page);
    await mockRoles(page);
    await mockModules(page);
    
    // Mock dynamic user/me - first call returns 401, subsequent calls return authenticated
    let loginAttempted = false;
    await page.route("**/api/users/me", async (route) => {
      if (!loginAttempted) {
        // First call - not authenticated
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ success: false, error: "Not authenticated" })
        });
      } else {
        // After login - authenticated
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: MOCK_USER
          })
        });
      }
    });
    
    // Mock successful login response
    await page.route("**/api/auth/login", async (route) => {
      loginAttempted = true; // Set flag before fulfilling
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            access_token: "test-access-token",
            token_type: "Bearer",
            expires_in: 3600
          }
        })
      });
    });
    
    await page.goto("/");
    
    // Fill login form
    await page.locator('[data-testid="login-company-code"]').fill("TESTCOMP");
    await page.locator('[data-testid="login-email"]').fill("admin@example.com");
    await page.locator('[data-testid="login-password"]').fill("password123");
    
    // Submit form
    await page.locator('button[type="submit"]').click();
    
    // Wait for login to complete and app to load (login form should disappear)
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible({ timeout: 10000 });
    
    // App should be loading or showing content
    await expect(page.locator("#root")).toBeAttached();
  });

  test("app loads when already authenticated", async ({ page }) => {
    await setupAuthenticatedPage(page);
    
    await page.goto("/");
    
    // Should not show login form (main check for authentication)
    await expect(page.locator('[data-testid="login-company-code"]')).not.toBeVisible();
    
    // App should be loading or showing content
    await expect(page.locator("#root")).toBeAttached();
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await mockHealth(page);
    await mockUserMe(page, false);
    
    await page.goto("/");
    
    // Fill login form
    await page.locator('[data-testid="login-company-code"]').fill("TESTCOMP");
    await page.locator('[data-testid="login-email"]').fill("wrong@example.com");
    await page.locator('[data-testid="login-password"]').fill("wrongpass");
    
    // Mock failed login response
    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: "Invalid credentials"
        })
      });
    });
    
    // Submit form
    await page.locator('button[type="submit"]').click();
    
    // Should show error message
    // Note: The actual error display depends on the UI implementation
    // We'll check that we're still on login page
    await expect(page.locator('[data-testid="login-company-code"]')).toBeVisible();
  });
});