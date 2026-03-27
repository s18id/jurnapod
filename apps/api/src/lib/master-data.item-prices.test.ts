// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { listEffectiveItemPricesForOutlet } from "./item-prices/index.js";
import { createItem } from "./items/index.js";
import { createItemPrice } from "./item-prices/index.js";
import { closeDbPool, getDbPool } from "./db";
import type { RowDataPacket } from "mysql2";

loadEnvIfPresent();

test(
  "listEffectiveItemPricesForOutlet - inactive override hides item from active prices",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let outletId = 0;
    let itemId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";

    try {
      // Get company and outlet from fixtures
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      assert.ok(companyRows.length > 0, "Company fixture not found");
      companyId = Number(companyRows[0].id);

      const [outletRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM outlets WHERE company_id = ? AND code = ? LIMIT 1`,
        [companyId, outletCode]
      );
      assert.ok(outletRows.length > 0, "Outlet fixture not found");
      outletId = Number(outletRows[0].id);

      // Create test item using library function
      const item = await createItem(companyId, {
        name: `Test Item ${runId}`,
        type: "PRODUCT"
      });
      itemId = item.id;

      // Create company default price (active)
      const defaultPrice = await createItemPrice(companyId, {
        item_id: itemId,
        outlet_id: null,
        price: 1000,
        is_active: true
      });

      // Create outlet override (inactive) - this should hide the item from active prices
      const overridePrice = await createItemPrice(companyId, {
        item_id: itemId,
        outlet_id: outletId,
        price: 1500,
        is_active: false
      });

      // Test: active filter should exclude the item (inactive override takes precedence)
      const activePrices = await listEffectiveItemPricesForOutlet(companyId, outletId, { isActive: true });
      const itemInActive = activePrices.find(p => p.item_id === itemId);
      assert.strictEqual(itemInActive, undefined, "Item should be excluded when override is inactive");

      // Test: unfiltered should include the item (inactive)
      const allPrices = await listEffectiveItemPricesForOutlet(companyId, outletId);
      const itemInAll = allPrices.find(p => p.item_id === itemId);
      assert.ok(itemInAll, "Item should be present in unfiltered results");
      assert.strictEqual(itemInAll!.is_active, false, "Item should be inactive");

    } finally {
      // Cleanup - use library function for items, direct SQL for prices (cascade handled)
      if (itemId) {
        await pool.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      }
    }
  }
);

test(
  "listEffectiveItemPricesForOutlet - active override wins over default",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let outletId = 0;
    let itemId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";

    try {
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      companyId = Number(companyRows[0].id);

      const [outletRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM outlets WHERE company_id = ? AND code = ? LIMIT 1`,
        [companyId, outletCode]
      );
      outletId = Number(outletRows[0].id);

      const item = await createItem(companyId, {
        name: `Test Item Override ${runId}`,
        type: "PRODUCT"
      });
      itemId = item.id;

      await createItemPrice(companyId, {
        item_id: itemId,
        outlet_id: null,
        price: 1000,
        is_active: true
      });

      await createItemPrice(companyId, {
        item_id: itemId,
        outlet_id: outletId,
        price: 2000,
        is_active: true
      });

      const activePrices = await listEffectiveItemPricesForOutlet(companyId, outletId, { isActive: true });
      const itemInActive = activePrices.find(p => p.item_id === itemId);

      assert.ok(itemInActive, "Item should be present in active prices");
      assert.strictEqual(itemInActive!.price, 2000, "Override price should be used");
      assert.strictEqual(itemInActive!.is_override, true, "Should be marked as override");

    } finally {
      if (itemId) {
        await pool.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      }
    }
  }
);

test(
  "listEffectiveItemPricesForOutlet - default fallback when no override exists",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let outletId = 0;
    let itemId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";

    try {
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      companyId = Number(companyRows[0].id);

      const [outletRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM outlets WHERE company_id = ? AND code = ? LIMIT 1`,
        [companyId, outletCode]
      );
      outletId = Number(outletRows[0].id);

      const item = await createItem(companyId, {
        name: `Test Item Default ${runId}`,
        type: "PRODUCT"
      });
      itemId = item.id;

      await createItemPrice(companyId, {
        item_id: itemId,
        outlet_id: null,
        price: 1500,
        is_active: true
      });

      const activePrices = await listEffectiveItemPricesForOutlet(companyId, outletId, { isActive: true });
      const itemInActive = activePrices.find(p => p.item_id === itemId);

      assert.ok(itemInActive, "Item should be present in active prices");
      assert.strictEqual(itemInActive!.price, 1500, "Default price should be used");
      assert.strictEqual(itemInActive!.is_override, false, "Should NOT be marked as override");

    } finally {
      if (itemId) {
        await pool.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      }
    }
  }
);

test.after(async () => {
  await closeDbPool();
});
