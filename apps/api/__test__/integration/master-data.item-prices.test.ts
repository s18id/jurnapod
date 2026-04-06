// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import {test, afterAll} from 'vitest';
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.js";
import { listEffectiveItemPricesForOutlet } from "../../src/lib/item-prices/index.js";
import { createItem } from "../../src/lib/items/index.js";
import { createItemPrice } from "../../src/lib/item-prices/index.js";
import { closeDbPool, getDb } from "../../src/lib/db";
import { sql } from "kysely";
import { DatabaseConflictError, DatabaseReferenceError } from "../../src/lib/master-data-errors.js";

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
  "@slow listEffectiveItemPricesForOutlet - inactive override hides item from active prices",
  { concurrent: false, timeout: 60000 },
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
  "@slow listEffectiveItemPricesForOutlet - active override wins over default",
  { concurrent: false, timeout: 60000 },
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
  "@slow listEffectiveItemPricesForOutlet - default fallback when no override exists",
  { concurrent: false, timeout: 60000 },
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

test(
  "@slow createItemPrice successfully creates and retrieves price",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let priceId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyRows = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      const item = await createItem(companyId, {
        name: `Test Item Create ${runId}`,
        type: "PRODUCT"
      });
      itemId = item.id;

      // Create a company-default item price
      const created = await createItemPrice(companyId, {
        item_id: itemId,
        outlet_id: null,
        price: 2500,
        is_active: true
      });
      priceId = created.id;

      // Verify the returned price has expected fields
      assert.ok(created.id > 0, "Should return a numeric id");
      assert.strictEqual(created.company_id, companyId, "company_id should match");
      assert.strictEqual(created.item_id, itemId, "item_id should match");
      assert.strictEqual(created.outlet_id, null, "outlet_id should be null for company default");
      assert.strictEqual(created.variant_id, null, "variant_id should be null");
      assert.strictEqual(created.price, 2500, "price should match");
      assert.strictEqual(created.is_active, true, "is_active should match");

      // Verify the record can be retrieved from DB
      const retrieved = await sql`
        SELECT id, company_id, item_id, outlet_id, variant_id, price, is_active
        FROM item_prices
        WHERE id = ${priceId}
      `.execute(db);

      assert.ok(retrieved.rows.length === 1, "Created price should be retrievable from DB");
      const row = retrieved.rows[0] as {
        id: number;
        company_id: number;
        item_id: number;
        outlet_id: number | null;
        variant_id: number | null;
        price: string | number;
        is_active: number;
      };
      assert.strictEqual(Number(row.id), priceId, "id should match");
      assert.strictEqual(Number(row.company_id), companyId, "company_id should match");
      assert.strictEqual(Number(row.item_id), itemId, "item_id should match");
      assert.strictEqual(row.outlet_id, null, "outlet_id should be null");
      assert.strictEqual(row.variant_id, null, "variant_id should be null");
      assert.strictEqual(Number(row.price), 2500, "price should match");
      assert.strictEqual(row.is_active, 1, "is_active should be 1");

    } finally {
      if (priceId) {
        await sql`DELETE FROM item_prices WHERE id = ${priceId}`.execute(db);
      }
      if (itemId) {
        await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      }
    }
  }
);

test(
  "@slow createItemPrice throws DatabaseConflictError for duplicate (item_id, outlet_id, variant_id)",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let priceId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyRows = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      const item = await createItem(companyId, {
        name: `Test Item Dup ${runId}`,
        type: "PRODUCT"
      });
      itemId = item.id;

      // Create first price with specific combination
      const first = await createItemPrice(companyId, {
        item_id: itemId,
        outlet_id: null,  // company default
        variant_id: null,
        price: 1000,
        is_active: true
      });
      priceId = first.id;

      // Attempt to create duplicate - should throw DatabaseConflictError
      let conflictThrown = false;
      try {
        await createItemPrice(companyId, {
          item_id: itemId,
          outlet_id: null,  // same company default
          variant_id: null, // same variant (both null)
          price: 2000,
          is_active: true
        });
      } catch (err) {
        if (err instanceof DatabaseConflictError) {
          conflictThrown = true;
        } else {
          throw err;
        }
      }
      assert.strictEqual(conflictThrown, true, "Should throw DatabaseConflictError for duplicate price");

    } finally {
      if (priceId) {
        await sql`DELETE FROM item_prices WHERE id = ${priceId}`.execute(db);
      }
      if (itemId) {
        await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      }
    }
  }
);

test(
  "@slow createItemPrice throws DatabaseReferenceError for invalid item_id",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyRows = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      // Use a high non-existent item_id to trigger FK violation
      const nonExistentItemId = 999999999;

      let refErrorThrown = false;
      try {
        await createItemPrice(companyId, {
          item_id: nonExistentItemId,
          outlet_id: null,
          price: 1000,
          is_active: true
        });
      } catch (err) {
        if (err instanceof DatabaseReferenceError) {
          refErrorThrown = true;
        } else {
          throw err;
        }
      }
      assert.strictEqual(refErrorThrown, true, "Should throw DatabaseReferenceError for invalid item_id");

    } finally {
      // No cleanup needed - the create should have failed
    }
  }
);

afterAll(async () => {
  await closeDbPool();
});
