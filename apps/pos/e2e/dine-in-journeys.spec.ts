// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { expect, test } from "@playwright/test";
import { E2E_SELECTORS } from "./selectors.js";

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
          orders_cursor: 0,
          tables: [
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
            },
            {
              table_id: 3,
              code: "B1",
              name: "Table B1",
              zone: "Window",
              capacity: 2,
              status: "OCCUPIED",
              updated_at: "2026-03-08T00:00:00.000Z"
            },
            {
              table_id: 4,
              code: "T1",
              name: "Table T1",
              zone: "Terrace",
              capacity: 4,
              status: "UNAVAILABLE",
              updated_at: "2026-03-08T00:00:00.000Z"
            }
          ],
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

async function ensureAssignableTables(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async () => {
    const request = indexedDB.open("jurnapod_pos_v1");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onerror = () => reject(request.error ?? new Error("failed to open indexeddb"));
      request.onsuccess = () => resolve(request.result);
    });

    const tx = db.transaction(["outlet_tables", "reservations"], "readwrite");
    const tableStore = tx.objectStore("outlet_tables");
    const reservationStore = tx.objectStore("reservations");
    const now = new Date().toISOString();

    const tableRows = await new Promise<Array<{
      pk: string;
      table_id: number;
      company_id: number;
      outlet_id: number;
      code: string;
      name: string;
      zone: string | null;
      capacity: number | null;
      status: string;
      updated_at: string;
    }>>((resolve, reject) => {
      const getAllRequest = tableStore.getAll();
      getAllRequest.onerror = () => reject(getAllRequest.error ?? new Error("failed to read outlet_tables"));
      getAllRequest.onsuccess = () => resolve((getAllRequest.result ?? []) as Array<{
        pk: string;
        table_id: number;
        company_id: number;
        outlet_id: number;
        code: string;
        name: string;
        zone: string | null;
        capacity: number | null;
        status: string;
        updated_at: string;
      }>);
    });

    const scopedTableRows = tableRows.filter((row) => row.company_id === 1 && row.outlet_id === 10);
    if (scopedTableRows.length === 0) {
      [
        { table_id: 1, code: "A1", name: "Table A1", zone: "Main Hall", capacity: 2 },
        { table_id: 2, code: "A2", name: "Table A2", zone: "Main Hall", capacity: 4 },
        { table_id: 3, code: "B1", name: "Table B1", zone: "Window", capacity: 2 }
      ].forEach((table) => {
        tableStore.put({
          pk: `1:10:${table.table_id}`,
          table_id: table.table_id,
          company_id: 1,
          outlet_id: 10,
          code: table.code,
          name: table.name,
          zone: table.zone,
          capacity: table.capacity,
          status: "AVAILABLE",
          updated_at: now
        });
      });
    } else {
      scopedTableRows.forEach((row) => {
        tableStore.put({
          ...row,
          status: row.table_id <= 3 ? "AVAILABLE" : row.status,
          updated_at: now
        });
      });
    }

    const reservationRows = await new Promise<Array<{
      table_id: number | null;
      company_id: number;
      outlet_id: number;
      status: string;
      updated_at: string;
      [key: string]: unknown;
    }>>((resolve, reject) => {
      const getAllRequest = reservationStore.getAll();
      getAllRequest.onerror = () => reject(getAllRequest.error ?? new Error("failed to read reservations"));
      getAllRequest.onsuccess = () => resolve((getAllRequest.result ?? []) as Array<{
        table_id: number | null;
        company_id: number;
        outlet_id: number;
        status: string;
        updated_at: string;
        [key: string]: unknown;
      }>);
    });

    reservationRows
      .filter((row) => row.company_id === 1 && row.outlet_id === 10)
      .forEach((row) => {
        if (row.table_id && !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(row.status)) {
          reservationStore.put({
            ...row,
            table_id: null,
            updated_at: now
          });
        }
      });

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("failed to seed table fixtures"));
      tx.onabort = () => reject(tx.error ?? new Error("table fixture transaction aborted"));
    });

    db.close();
  });
}

test("reservation to order journey keeps dine-in context", async ({ page }) => {
  await setupAuthenticatedSession(page);
  await page.goto("/reservations");
  await ensureAssignableTables(page);
  await page.reload();
  await expect(page).toHaveURL(/\/reservations$/);

  await page.locator(E2E_SELECTORS.reservations.customerName).fill(`E2E Guest ${Date.now()}`);

  const createTableSelect = page.locator(E2E_SELECTORS.reservations.tableId);
  const createTableOptionCount = await createTableSelect.locator("option").count();
  expect(createTableOptionCount).toBeGreaterThan(1);
  await createTableSelect.selectOption({ index: 1 });

  await page.locator(E2E_SELECTORS.reservations.create).click();

  await expect(page.getByText("ACTIVE RESERVATION CONTEXT")).toBeVisible();

  await page.locator(E2E_SELECTORS.reservations.anyContinueOrder).first().click();

  await expect(page).toHaveURL(/\/products$/);

  await page.goto("/cart");
  await expect(page.getByText(/Service: DINE_IN/)).toBeVisible();
  await expect(page.getByText(/Service: DINE_IN\s+• Table \d+/)).toBeVisible();
});

test("table transfer journey moves active dine-in order", async ({ page }) => {
  await setupAuthenticatedSession(page);

  await page.goto("/reservations");
  await ensureAssignableTables(page);
  await page.reload();
  await page.locator(E2E_SELECTORS.reservations.customerName).fill(`E2E Release ${Date.now()}`);

  const reservationTableSelect = page.locator(E2E_SELECTORS.reservations.tableId);
  const reservationOptionCount = await reservationTableSelect.locator("option").count();
  expect(reservationOptionCount).toBeGreaterThan(1);
  await reservationTableSelect.selectOption({ index: 1 });
  await page.locator(E2E_SELECTORS.reservations.create).click();
  await page.locator(E2E_SELECTORS.reservations.anyStatusCancelled).first().click();

  await page.goto("/tables");
  await expect(page).toHaveURL(/\/tables$/);

  await page.locator(E2E_SELECTORS.tables.anyAction).first().click();
  await expect(page).toHaveURL(/\/products$/);

  await page.goto("/cart");
  await expect(page.getByText(/Service: DINE_IN/)).toBeVisible();

  const transferSelect = page.locator(E2E_SELECTORS.cart.transferTargetTable);
  await expect(transferSelect).toBeVisible();

  const optionCount = await transferSelect.locator("option").count();
  expect(optionCount).toBeGreaterThan(1);

  await transferSelect.selectOption({ index: 1 });
  await page.locator(E2E_SELECTORS.cart.moveTable).click();

  await expect(page.getByText(/Table moved to/)).toBeVisible();
});

test("reservation check-in to seated keeps dine-in context for continue order", async ({ page }) => {
  await setupAuthenticatedSession(page);

  await page.goto("/reservations");
  await ensureAssignableTables(page);
  await page.reload();
  await expect(page).toHaveURL(/\/reservations$/);

  await page.locator(E2E_SELECTORS.reservations.customerName).fill(`E2E Seated ${Date.now()}`);

  const createTableSelect = page.locator(E2E_SELECTORS.reservations.tableId);
  const createOptionCount = await createTableSelect.locator("option").count();
  expect(createOptionCount).toBeGreaterThan(1);
  await createTableSelect.selectOption({ index: 1 });
  await page.locator(E2E_SELECTORS.reservations.create).click();

  await expect(page.getByText("ACTIVE RESERVATION CONTEXT")).toBeVisible();

  await page.locator(E2E_SELECTORS.reservations.anyStatusArrived).first().click();
  await page.locator(E2E_SELECTORS.reservations.anyStatusSeated).first().click();
  await expect(page.locator(E2E_SELECTORS.reservations.anyContinueOrder).first()).toBeVisible();

  await page.locator(E2E_SELECTORS.reservations.anyContinueOrder).first().click();
  await expect(page).toHaveURL(/\/products$/);

  await page.goto("/cart");
  await expect(page.getByText(/Service: DINE_IN/)).toBeVisible();
  await expect(page.getByText(/Reservation/)).toBeVisible();
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
  await ensureAssignableTables(page);
  await page.reload();
  await expect(page).toHaveURL(/\/tables$/);

  const useTableButton = page.locator(E2E_SELECTORS.tables.anyAction).first();
  await expect(useTableButton).toBeVisible();
  await useTableButton.click();

  await expect(page).toHaveURL(/\/products$/);
  const addButton = page.locator(E2E_SELECTORS.products.addSku101);
  await expect(addButton).toBeVisible();
  await addButton.click();
  await page.locator(E2E_SELECTORS.products.addSku101).click();

  await page.locator(E2E_SELECTORS.products.continueToCart).click();
  await expect(page).toHaveURL(/\/cart$/);

  page.on("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.locator(E2E_SELECTORS.cart.finalizeOrder).click();

  const cancelPanel = page.locator("div", { hasText: "Cancel finalized item(s)" }).first();
  await expect(cancelPanel).toBeVisible();

  await cancelPanel.locator(E2E_SELECTORS.cart.cancelQuantity).fill("1");
  await cancelPanel.locator(E2E_SELECTORS.cart.cancelReason).fill("Customer removed one portion");
  await cancelPanel.locator(E2E_SELECTORS.cart.confirmCancellation).click();

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
