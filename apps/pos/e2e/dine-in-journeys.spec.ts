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

async function mockSyncPull(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/api/sync/pull**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          data_version: 1,
          items: [
            {
              id: 101,
              sku: "SKU-101",
              name: "Fried Rice",
              type: "PRODUCT",
              item_group_id: null,
              is_active: true,
              updated_at: "2026-03-08T00:00:00.000Z"
            }
          ],
          item_groups: [],
          prices: [
            {
              id: 5001,
              item_id: 101,
              outlet_id: 10,
              price: 25000,
              is_active: true,
              updated_at: "2026-03-08T00:00:00.000Z"
            }
          ],
          config: {
            tax: {
              rate: 0,
              inclusive: false
            },
            payment_methods: ["CASH"]
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
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, "test-token");
  }, ACCESS_TOKEN_STORAGE_KEY);
}

async function seedProductCache(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async () => {
    const openRequest = indexedDB.open("jurnapod_pos_v1");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onerror = () => reject(openRequest.error ?? new Error("failed to open db"));
      openRequest.onsuccess = () => resolve(openRequest.result);
    });

    const tx = db.transaction("products_cache", "readwrite");
    const store = tx.objectStore("products_cache");
    store.put({
      pk: "1:10:101",
      company_id: 1,
      outlet_id: 10,
      item_id: 101,
      sku: "SKU-101",
      name: "Fried Rice",
      item_type: "PRODUCT",
      item_group_id: null,
      item_group_name: null,
      price_snapshot: 25000,
      is_active: true,
      item_updated_at: "2026-03-08T00:00:00.000Z",
      price_updated_at: "2026-03-08T00:00:00.000Z",
      data_version: 1,
      pulled_at: "2026-03-08T00:00:00.000Z"
    });

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("failed to seed products_cache"));
      tx.onabort = () => reject(tx.error ?? new Error("products_cache transaction aborted"));
    });

    db.close();
  });
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

test("resume order and cancel finalized item captures reason and audit update", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await mockSyncPull(page);

  await page.goto("/products");
  await expect(page).toHaveURL(/\/products$/);
  const noProductsMessage = page.getByText(/No products in local cache for this outlet\./i);
  if (await noProductsMessage.isVisible()) {
    await seedProductCache(page);
    await page.reload();
    await expect(noProductsMessage).not.toBeVisible();
  }

  await page.goto("/tables");
  await expect(page).toHaveURL(/\/tables$/);

  const useTableButton = page.getByRole("button", { name: "Use table" }).first();
  await expect(useTableButton).toBeVisible();
  await useTableButton.click();

  await expect(page).toHaveURL(/\/products$/);
  const addButton = page.getByRole("button", { name: /^add$/i }).first();
  await expect(addButton).toBeVisible();
  await addButton.click();
  await page.getByRole("button", { name: "+" }).first().click();

  await page.getByRole("button", { name: /continue to cart/i }).click();
  await expect(page).toHaveURL(/\/cart$/);

  page.on("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Finalize order", exact: true }).click();

  const cancelPanel = page.locator("div", { hasText: "Cancel finalized item(s)" }).first();
  await expect(cancelPanel).toBeVisible();

  await cancelPanel.locator("input[type='number']").first().fill("1");
  await cancelPanel.getByPlaceholder("Reason for cancellation").fill("Customer removed one portion");
  await cancelPanel.getByRole("button", { name: "Confirm cancellation" }).click();

  await expect(page.getByText(/Committed quantity cancelled and audit event recorded\./)).toBeVisible();
  await expect(cancelPanel.getByText(/Max cancel qty: 1/)).toBeVisible();

  const hasCancelledUpdate = await page.evaluate(async () => {
    const request = indexedDB.open("jurnapod_pos_v1");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onerror = () => reject(request.error ?? new Error("failed to open indexeddb"));
      request.onsuccess = () => resolve(request.result);
    });

    const tx = db.transaction("active_order_updates", "readonly");
    const store = tx.objectStore("active_order_updates");
    const getAllRequest = store.getAll();
    const updates = await new Promise<Array<{ event_type?: string; delta_json?: string }>>((resolve, reject) => {
      getAllRequest.onerror = () => reject(getAllRequest.error ?? new Error("failed to read active_order_updates"));
      getAllRequest.onsuccess = () => resolve((getAllRequest.result ?? []) as Array<{ event_type?: string; delta_json?: string }>);
    });

    db.close();

    return updates.some((row) => {
      if (row.event_type !== "ITEM_CANCELLED") {
        return false;
      }

      if (!row.delta_json) {
        return false;
      }

      try {
        const parsed = JSON.parse(row.delta_json) as { reason?: string; cancelled_qty?: number };
        return parsed.reason === "Customer removed one portion" && parsed.cancelled_qty === 1;
      } catch {
        return false;
      }
    });
  });

  expect(hasCancelledUpdate).toBe(true);
});
