// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { expect, test } from "@playwright/test";

const ACCESS_TOKEN_STORAGE_KEY = "jurnapod_pos_access_token";

async function mockHealth(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { service: "jurnapod-api" } })
    });
  });
}

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
              id: 10,
              code: "MAIN",
              name: "Main Outlet"
            }
          ]
        }
      })
    });
  });
}

async function setupAuthenticatedSession(page: import("@playwright/test").Page): Promise<void> {
  await mockHealth(page);
  await mockUserMe(page);
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, "test-token");
  }, ACCESS_TOKEN_STORAGE_KEY);
}

test("reservation to order journey keeps dine-in context", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await page.goto("/reservations");
  await expect(page).toHaveURL(/\/reservations$/);

  await page.getByPlaceholder("Customer name").fill(`E2E Guest ${Date.now()}`);

  const createTableSelect = page.locator("select").first();
  const createTableOptionCount = await createTableSelect.locator("option").count();
  expect(createTableOptionCount).toBeGreaterThan(1);
  await createTableSelect.selectOption({ index: 1 });

  await page.getByRole("button", { name: "Create reservation" }).click();

  await expect(page.getByText("ACTIVE RESERVATION CONTEXT")).toBeVisible();

  await page.getByRole("button", { name: "Continue order" }).first().click();

  await expect(page).toHaveURL(/\/products$/);

  await page.goto("/cart");
  await expect(page.getByText(/Service: DINE_IN/)).toBeVisible();
  await expect(page.getByText(/Service: DINE_IN\s+• Table \d+/)).toBeVisible();
});

test("table transfer journey moves active dine-in order", async ({ page }) => {
  await setupAuthenticatedSession(page);

  await page.goto("/reservations");
  await page.getByPlaceholder("Customer name").fill(`E2E Release ${Date.now()}`);

  const reservationTableSelect = page.locator("select").first();
  const reservationOptionCount = await reservationTableSelect.locator("option").count();
  if (reservationOptionCount <= 1) {
    test.skip(true, "No available table options in reservation form for this dataset.");
  }
  await reservationTableSelect.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Create reservation" }).click();
  await page.getByRole("button", { name: "CANCELLED" }).first().click();

  await page.goto("/tables");
  await expect(page).toHaveURL(/\/tables$/);

  await page.getByRole("button", { name: /Use table|Resume current order|Resume table order|Resume occupied table/ }).first().click();
  await expect(page).toHaveURL(/\/products$/);

  await page.goto("/cart");
  await expect(page.getByText(/Service: DINE_IN/)).toBeVisible();

  const transferSelect = page.locator("select").filter({ hasText: "Select available table" }).first();
  await expect(transferSelect).toBeVisible();

  const optionCount = await transferSelect.locator("option").count();
  if (optionCount <= 1) {
    test.skip(true, "No transfer target table available in this dataset.");
  }

  await transferSelect.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Move table" }).click();

  await expect(page.getByText(/Table moved to/)).toBeVisible();
});
