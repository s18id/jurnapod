// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { expect, test } from "@playwright/test";

const ACCESS_TOKEN_STORAGE_KEY = "jurnapod_pos_access_token";

async function mockUserMe(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/api/users/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          company_id: 1,
          outlets: [
            {
              id: 1,
              code: "MAIN",
              name: "Main Outlet"
            }
          ]
        }
      })
    });
  });
}

async function mockProductCatalog(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/api/offline/product-catalog*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [
          {
            item_id: 1,
            name: "Coffee",
            price_snapshot: 500,
            category: "Beverages"
          },
          {
            item_id: 2,
            name: "Sandwich",
            price_snapshot: 800,
            category: "Food"
          }
        ]
      })
    });
  });
}

async function mockOutletTables(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/api/offline/outlet-tables*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [
          {
            table_id: 1,
            code: "A1",
            name: "Table A1",
            zone: "Main",
            capacity: 4,
            status: "AVAILABLE"
          },
          {
            table_id: 2,
            code: "A2",
            name: "Table A2",
            zone: "Main",
            capacity: 2,
            status: "AVAILABLE"
          }
        ]
      })
    });
  });
}

async function setupAuthenticatedSession(page: import("@playwright/test").Page): Promise<void> {
  await mockUserMe(page);
  await mockProductCatalog(page);
  await mockOutletTables(page);
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, "test-token");
  }, ACCESS_TOKEN_STORAGE_KEY);
}

test("service mode page is accessible and shows takeaway/dine-in buttons", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await page.goto("/service-mode");

  await expect(page).toHaveURL(/\/service-mode$/);
  await expect(page.getByRole("heading", { name: /select service mode/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /takeaway/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /dine-in/i })).toBeVisible();
});

test("clicking takeaway starts new takeaway order", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await page.goto("/service-mode");

  await page.getByRole("button", { name: /takeaway/i }).click();

  await expect(page).toHaveURL(/\/products$/);
  // Service mode should be set to TAKEAWAY
  await expect(page.getByText(/service mode/i)).toBeVisible();
});

test("clicking dine-in navigates to tables page", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await page.goto("/service-mode");

  await page.getByRole("button", { name: /dine-in/i }).click();

  await expect(page).toHaveURL(/\/tables$/);
});

test("service switch from takeaway to dine-in shows confirmation modal", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await page.goto("/products");

  // Wait for products page to load
  await expect(page.getByText(/start order/i)).toBeVisible();

  // Add an item to cart
  await page.getByRole("button", { name: /coffee/i }).first().click();

  // Try to switch to dine-in
  await page.getByRole("button", { name: /^dine-in$/i }).click();

  // Should show service switch modal
  await expect(page.getByRole("heading", { name: /switch to dine-in/i })).toBeVisible();
  await expect(page.getByText(/select a table/i)).toBeVisible();
});

test("service switch from dine-in to takeaway shows confirmation modal", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await page.goto("/products");

  // Wait for products page to load
  await expect(page.getByText(/start order/i)).toBeVisible();

  // Switch to dine-in mode first (no items, so no modal)
  await page.getByRole("button", { name: /^dine-in$/i }).click();

  // Add an item to cart
  await page.getByRole("button", { name: /coffee/i }).first().click();

  // Try to switch to takeaway
  await page.getByRole("button", { name: /^takeaway$/i }).click();

  // Should show service switch modal
  await expect(page.getByRole("heading", { name: /switch to takeaway/i })).toBeVisible();
});

test("dine-in blocks adding items without table selection", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await page.goto("/products");

  // Wait for products page to load
  await expect(page.getByText(/start order/i)).toBeVisible();

  // Switch to dine-in mode
  await page.getByRole("button", { name: /^dine-in$/i }).click();

  // Try to add an item without selecting a table
  await page.getByRole("button", { name: /coffee/i }).first().click();

  // Should show guard message
  await expect(page.getByText(/select a table.*before adding items/i)).toBeVisible();
});

test("complete takeaway flow: service mode → products → cart → checkout", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await page.goto("/service-mode");

  // Start takeaway order
  await page.getByRole("button", { name: /takeaway/i }).click();
  await expect(page).toHaveURL(/\/products$/);

  // Add items to cart
  await page.getByRole("button", { name: /coffee/i }).first().click();
  await page.getByRole("button", { name: /sandwich/i }).first().click();

  // Navigate to cart
  await page.getByRole("button", { name: /continue to cart/i }).click();
  await expect(page).toHaveURL(/\/cart$/);

  // Cart should show takeaway service type
  await expect(page.getByText(/takeaway/i)).toBeVisible();
});

test("can increase and decrease quantity from products page", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await page.goto("/products");

  // Wait for products page to load
  await expect(page.getByText(/start order/i)).toBeVisible();

  // Add coffee once - should show quantity controls
  await page.getByRole("button", { name: /coffee/i }).first().click();

  // Should now show +/- buttons with quantity 1
  const coffeeCard = page.locator('div:has-text("Coffee")').first();
  await expect(coffeeCard.getByText("1")).toBeVisible();
  await expect(coffeeCard.getByRole("button", { name: "+" })).toBeVisible();
  await expect(coffeeCard.getByRole("button", { name: "−" })).toBeVisible();

  // Click + to increase quantity
  await coffeeCard.getByRole("button", { name: "+" }).click();
  await expect(coffeeCard.getByText("2")).toBeVisible();

  // Click - to decrease quantity
  await coffeeCard.getByRole("button", { name: "−" }).click();
  await expect(coffeeCard.getByText("1")).toBeVisible();

  // Click - again to remove from cart (back to 0)
  await coffeeCard.getByRole("button", { name: "−" }).click();
  
  // Should show Add button again (no quantity)
  await expect(coffeeCard.getByRole("button", { name: /add/i })).toBeVisible();
  await expect(coffeeCard.getByText("1")).not.toBeVisible();
});

test("resume active order button appears when order exists", async ({ page }) => {
  await setupAuthenticatedSession(page);
  
  // First create an order
  await page.goto("/products");
  await page.getByRole("button", { name: /coffee/i }).first().click();

  // Go back to service mode
  await page.goto("/service-mode");

  // Resume button should be visible
  await expect(page.getByRole("button", { name: /resume active order/i })).toBeVisible();

  // Clicking resume should take to products
  await page.getByRole("button", { name: /resume active order/i }).click();
  await expect(page).toHaveURL(/\/products$/);
});
