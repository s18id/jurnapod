// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { listEffectiveItemPricesForOutlet } from "./item-prices/index.js";
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
    let defaultPriceId = 0;
    let overridePriceId = 0;

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

      // Create test item
      const [itemResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'PRODUCT')`,
        [companyId, `Test Item ${runId}`]
      );
      itemId = Number((itemResult as { insertId: number }).insertId);

      // Create company default price (active)
      const [defaultResult] = await pool.execute(
        `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active) VALUES (?, NULL, ?, ?, 1)`,
        [companyId, itemId, 1000]
      );
      defaultPriceId = Number((defaultResult as { insertId: number }).insertId);

      // Create outlet override (inactive) - this should hide the item from active prices
      const [overrideResult] = await pool.execute(
        `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active) VALUES (?, ?, ?, ?, 0)`,
        [companyId, outletId, itemId, 1500]
      );
      overridePriceId = Number((overrideResult as { insertId: number }).insertId);

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
      // Cleanup
      if (overridePriceId) {
        await pool.execute(`DELETE FROM item_prices WHERE id = ?`, [overridePriceId]);
      }
      if (defaultPriceId) {
        await pool.execute(`DELETE FROM item_prices WHERE id = ?`, [defaultPriceId]);
      }
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
    let defaultPriceId = 0;
    let overridePriceId = 0;

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

      const [itemResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'PRODUCT')`,
        [companyId, `Test Item Override ${runId}`]
      );
      itemId = Number((itemResult as { insertId: number }).insertId);

      const [defaultResult] = await pool.execute(
        `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active) VALUES (?, NULL, ?, ?, 1)`,
        [companyId, itemId, 1000]
      );
      defaultPriceId = Number((defaultResult as { insertId: number }).insertId);

      const [overrideResult] = await pool.execute(
        `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active) VALUES (?, ?, ?, ?, 1)`,
        [companyId, outletId, itemId, 2000]
      );
      overridePriceId = Number((overrideResult as { insertId: number }).insertId);

      const activePrices = await listEffectiveItemPricesForOutlet(companyId, outletId, { isActive: true });
      const itemInActive = activePrices.find(p => p.item_id === itemId);

      assert.ok(itemInActive, "Item should be present in active prices");
      assert.strictEqual(itemInActive!.price, 2000, "Override price should be used");
      assert.strictEqual(itemInActive!.is_override, true, "Should be marked as override");

    } finally {
      if (overridePriceId) {
        await pool.execute(`DELETE FROM item_prices WHERE id = ?`, [overridePriceId]);
      }
      if (defaultPriceId) {
        await pool.execute(`DELETE FROM item_prices WHERE id = ?`, [defaultPriceId]);
      }
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
    let defaultPriceId = 0;

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

      const [itemResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'PRODUCT')`,
        [companyId, `Test Item Default ${runId}`]
      );
      itemId = Number((itemResult as { insertId: number }).insertId);

      const [defaultResult] = await pool.execute(
        `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active) VALUES (?, NULL, ?, ?, 1)`,
        [companyId, itemId, 1500]
      );
      defaultPriceId = Number((defaultResult as { insertId: number }).insertId);

      const activePrices = await listEffectiveItemPricesForOutlet(companyId, outletId, { isActive: true });
      const itemInActive = activePrices.find(p => p.item_id === itemId);

      assert.ok(itemInActive, "Item should be present in active prices");
      assert.strictEqual(itemInActive!.price, 1500, "Default price should be used");
      assert.strictEqual(itemInActive!.is_override, false, "Should NOT be marked as override");

    } finally {
      if (defaultPriceId) {
        await pool.execute(`DELETE FROM item_prices WHERE id = ?`, [defaultPriceId]);
      }
      if (itemId) {
        await pool.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      }
    }
  }
);

test.after(async () => {
  await closeDbPool();
});
