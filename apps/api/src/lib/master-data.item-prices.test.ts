// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { listEffectiveItemPricesForOutlet } from "./item-prices/index.js";
import { createItem } from "./items/index.js";
import { createItemPrice } from "./item-prices/index.js";
import { closeDbPool, getDb } from "./db";
import { sql } from "kysely";

loadEnvIfPresent();

type ItemPriceResult = {
  id: number;
  company_id: number;
  outlet_id: number | null;
  item_id: number;
  variant_id: number | null;
  price: number;
  is_active: boolean;
  updated_at: string;
  item_group_id: number | null;
  item_group_name: string | null;
  is_override: boolean;
};

test(
  "listEffectiveItemPricesForOutlet - inactive override hides item from active prices",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let outletId = 0;
    let itemId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";

    try {
      // Get company and outlet from fixtures
      const companyRows = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);

      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      const outletRows = await sql`
        SELECT id FROM outlets WHERE company_id = ${companyId} AND code = ${outletCode} LIMIT 1
      `.execute(db);

      assert.ok(outletRows.rows.length > 0, "Outlet fixture not found");
      outletId = Number((outletRows.rows[0] as { id: number }).id);

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
      const itemInActive = activePrices.find((p: ItemPriceResult) => p.item_id === itemId);
      assert.strictEqual(itemInActive, undefined, "Item should be excluded when override is inactive");

      // Test: unfiltered should include the item (inactive)
      const allPrices = await listEffectiveItemPricesForOutlet(companyId, outletId);
      const itemInAll = allPrices.find((p: ItemPriceResult) => p.item_id === itemId);
      assert.ok(itemInAll, "Item should be present in unfiltered results");
      assert.strictEqual(itemInAll!.is_active, false, "Item should be inactive");

    } finally {
      // Cleanup - use library function for items, direct SQL for prices (cascade handled)
      if (itemId) {
        await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      }
    }
  }
);

test(
  "listEffectiveItemPricesForOutlet - active override wins over default",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let outletId = 0;
    let itemId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";

    try {
      const companyRows = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      const outletRows = await sql`
        SELECT id FROM outlets WHERE company_id = ${companyId} AND code = ${outletCode} LIMIT 1
      `.execute(db);
      outletId = Number((outletRows.rows[0] as { id: number }).id);

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
      const itemInActive = activePrices.find((p: ItemPriceResult) => p.item_id === itemId);

      assert.ok(itemInActive, "Item should be present in active prices");
      assert.strictEqual(itemInActive!.price, 2000, "Override price should be used");
      assert.strictEqual(itemInActive!.is_override, true, "Should be marked as override");

    } finally {
      if (itemId) {
        await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      }
    }
  }
);

test(
  "listEffectiveItemPricesForOutlet - default fallback when no override exists",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let outletId = 0;
    let itemId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";

    try {
      const companyRows = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      const outletRows = await sql`
        SELECT id FROM outlets WHERE company_id = ${companyId} AND code = ${outletCode} LIMIT 1
      `.execute(db);
      outletId = Number((outletRows.rows[0] as { id: number }).id);

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
      const itemInActive = activePrices.find((p: ItemPriceResult) => p.item_id === itemId);

      assert.ok(itemInActive, "Item should be present in active prices");
      assert.strictEqual(itemInActive!.price, 1500, "Default price should be used");
      assert.strictEqual(itemInActive!.is_override, false, "Should NOT be marked as override");

    } finally {
      if (itemId) {
        await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      }
    }
  }
);

test.after(async () => {
  await closeDbPool();
});
