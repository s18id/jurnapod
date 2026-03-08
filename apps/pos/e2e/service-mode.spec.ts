// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { expect, test } from "@playwright/test";
import { E2E_SELECTORS } from "./selectors.js";

const ACCESS_TOKEN_STORAGE_KEY = "jurnapod_pos_access_token";
const CATALOG_VERSION = 10;

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

async function mockSyncPull(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/api/sync/pull**", async (route) => {
    const url = new URL(route.request().url());
    const sinceVersion = Number(url.searchParams.get("since_version") ?? "0");
    const changed = sinceVersion < CATALOG_VERSION;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          data_version: changed ? CATALOG_VERSION : sinceVersion,
          items: changed
            ? [
                {
                  id: 1,
                  sku: "COF-01",
                  name: "Coffee",
                  type: "PRODUCT",
                  item_group_id: null,
                  is_active: true,
                  updated_at: "2026-03-08T00:00:00.000Z"
                },
                {
                  id: 2,
                  sku: "SND-01",
                  name: "Sandwich",
                  type: "PRODUCT",
                  item_group_id: null,
                  is_active: true,
                  updated_at: "2026-03-08T00:00:00.000Z"
                }
              ]
            : [],
          item_groups: [],
          prices: changed
            ? [
                {
                  id: 10,
                  item_id: 1,
                  outlet_id: 1,
                  price: 500,
                  is_active: true,
                  updated_at: "2026-03-08T00:00:00.000Z"
                },
                {
                  id: 11,
                  item_id: 2,
                  outlet_id: 1,
                  price: 800,
                  is_active: true,
                  updated_at: "2026-03-08T00:00:00.000Z"
                }
              ]
            : [],
          config: {
            tax: {
              rate: 0,
              inclusive: false
            },
            payment_methods: ["CASH", "QRIS"]
          },
          open_orders: [],
          open_order_lines: [],
          order_updates: [],
          orders_cursor: 0,
          tables: changed
            ? [
                {
                  table_id: 1,
                  code: "A1",
                  name: "Table A1",
                  zone: "Main Hall",
                  capacity: 2,
                  status: "AVAILABLE",
                  updated_at: "2026-03-08T00:00:00.000Z"
                },
                {
                  table_id: 2,
                  code: "A2",
                  name: "Table A2",
                  zone: "Main Hall",
                  capacity: 4,
                  status: "RESERVED",
                  updated_at: "2026-03-08T00:00:00.000Z"
                }
              ]
            : [],
          reservations: []
        }
      })
    });
  });
}

async function setupAuthenticatedSession(page: import("@playwright/test").Page): Promise<void> {
  await mockHealth(page);
  await mockUserMe(page);
  await mockSyncPull(page);
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, "test-token");
  }, ACCESS_TOKEN_STORAGE_KEY);
}

async function primeCatalog(page: import("@playwright/test").Page): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto("/settings");
    await page.locator(E2E_SELECTORS.settings.refreshCatalog).click();
    await expect(page.locator(E2E_SELECTORS.settings.refreshCatalog)).toBeVisible();
    await page.goto("/products");

    if (await page.getByText("Coffee").first().isVisible()) {
      return;
    }
  }

  await expect(page.getByText("Coffee")).toBeVisible();
}

async function addCoffee(page: import("@playwright/test").Page): Promise<void> {
  await page.locator(E2E_SELECTORS.products.addCoffee).click();
}

test("service mode page is accessible and shows takeaway/dine-in buttons", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await page.goto("/service-mode");

  await expect(page).toHaveURL(/\/service-mode$/);
  await expect(page.locator(E2E_SELECTORS.serviceMode.title)).toBeVisible();
  await expect(page.locator(E2E_SELECTORS.serviceMode.takeaway)).toBeVisible();
  await expect(page.locator(E2E_SELECTORS.serviceMode.dineIn)).toBeVisible();
});

test("clicking takeaway starts new takeaway order", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await page.goto("/service-mode");

  await page.locator(E2E_SELECTORS.serviceMode.takeaway).click();

  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByText(/service mode/i)).toBeVisible();
});

test("clicking dine-in navigates to tables page", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await page.goto("/service-mode");

  await page.locator(E2E_SELECTORS.serviceMode.dineIn).click();

  await expect(page).toHaveURL(/\/tables$/);
});

test("service switch from takeaway to dine-in shows confirmation modal", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await primeCatalog(page);

  await expect(page.getByText(/start order/i)).toBeVisible();
  await addCoffee(page);
  await page.locator(E2E_SELECTORS.products.serviceTypeDineIn).click();

  await expect(page.locator(E2E_SELECTORS.serviceSwitchModal.title)).toContainText("Switch to Dine-In");
  await expect(page.locator(E2E_SELECTORS.serviceSwitchModal.tableTitle)).toBeVisible();
});

test("service switch from dine-in to takeaway shows confirmation modal", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await primeCatalog(page);

  await page.goto("/tables");
  await page.locator(E2E_SELECTORS.tables.anyAction).first().click();
  await expect(page).toHaveURL(/\/products$/);
  await page.locator(E2E_SELECTORS.products.serviceTypeDineIn).click();
  await addCoffee(page);
  await page.locator(E2E_SELECTORS.products.serviceTypeTakeaway).click();

  await expect(page.locator(E2E_SELECTORS.serviceSwitchModal.title)).toContainText("Switch to Takeaway");
});

test("dine-in blocks adding items without table selection", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await primeCatalog(page);

  await expect(page.getByText(/start order/i)).toBeVisible();
  await page.locator(E2E_SELECTORS.products.serviceTypeDineIn).click();
  await addCoffee(page);

  await expect(page.getByText(/select a table.*before adding items/i)).toBeVisible();
});

test("complete takeaway flow: service mode -> products -> cart -> checkout", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await primeCatalog(page);
  await page.goto("/service-mode");

  await page.locator(E2E_SELECTORS.serviceMode.takeaway).click();
  await expect(page).toHaveURL(/\/products$/);

  await page.locator(E2E_SELECTORS.products.addCoffee).click();

  await page.locator(E2E_SELECTORS.products.continueToCart).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByText(/Service:\s*TAKEAWAY/i)).toBeVisible();
});

test("can increase and decrease quantity from products page", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await primeCatalog(page);

  await expect(page.getByText(/start order/i)).toBeVisible();
  await addCoffee(page);

  await expect(page.locator(E2E_SELECTORS.headerNav.cart)).toContainText("(1)");
  await page.locator(E2E_SELECTORS.products.addCoffee).click();
  await expect(page.locator(E2E_SELECTORS.headerNav.cart)).toContainText("(2)");
  await page.locator(E2E_SELECTORS.products.removeCoffee).click();
  await expect(page.locator(E2E_SELECTORS.headerNav.cart)).toContainText("(1)");
  await page.locator(E2E_SELECTORS.products.removeCoffee).click();
  await expect(page.locator(E2E_SELECTORS.headerNav.cart)).toBeVisible();
});

test("resume active order button appears when order exists", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await primeCatalog(page);

  await addCoffee(page);
  await page.goto("/service-mode");

  await expect(page.locator(E2E_SELECTORS.serviceMode.resumeActiveOrder)).toBeVisible();
  await page.locator(E2E_SELECTORS.serviceMode.resumeActiveOrder).click();
  await expect(page).toHaveURL(/\/products$/);
});
