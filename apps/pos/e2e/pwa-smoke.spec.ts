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
          id: 1,
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
                  id: 100,
                  sku: "AMER",
                  name: "Americano",
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
                  id: 200,
                  item_id: 100,
                  outlet_id: 10,
                  price: 18000,
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
          orders_cursor: 0
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
    if (await page.getByText("Americano").first().isVisible()) {
      return;
    }
  }

  await expect(page.getByText("Americano")).toBeVisible();
}

test("sync badge changes to Offline when network goes down", async ({ context, page }) => {
  await setupAuthenticatedSession(page);

  await page.goto("/");
  await expect(page.getByText("Sync: Synced")).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText("Sync: Offline")).toBeVisible();

  await context.setOffline(false);
});

test("login + sync pull works with mocked API", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await primeCatalog(page);

  await page.goto("/products");
  await expect(page.getByText("Americano")).toBeVisible();
  await expect(page.locator(E2E_SELECTORS.products.addAmericano)).toBeVisible();
});

test("dine-in flow blocks product add until table selected", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await primeCatalog(page);

  await page.goto("/products");
  await page.locator(E2E_SELECTORS.products.serviceTypeDineIn).click();
  await page.locator(E2E_SELECTORS.products.addAmericano).click();
  await expect(page.getByText("Select a table from the Tables page before adding items for dine-in.")).toBeVisible();

  await page.goto("/tables");
  await page.locator(E2E_SELECTORS.tables.anyAction).first().click();
  await expect(page).toHaveURL(/\/products$/);

  await page.locator(E2E_SELECTORS.products.addAmericano).click();
  await expect(page.getByText("Cart: 1")).toBeVisible();
});
