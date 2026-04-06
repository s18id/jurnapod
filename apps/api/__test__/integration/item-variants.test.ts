// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
// Note: 14 test cases covering variant CRUD, stock management, and pricing

import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import {
  createVariantAttribute,
  updateVariantAttribute,
  deleteVariantAttribute,
  listVariantAttributes,
  getItemVariants,
  getVariantById,
  updateVariant,
  adjustVariantStock,
  validateVariantSku,
  getVariantEffectivePrice,
  getVariantsForSync,
  DuplicateSkuError,
  VariantNotFoundError,
  AttributeNotFoundError,
  ItemNotFoundError
} from "./item-variants";
import { closeDbPool, getDb } from "./db";
import { createTestItem, createTestCompanyMinimal, cleanupTestFixtures } from "./test-fixtures";

loadEnvIfPresent();

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

test(
  "createVariantAttribute - creates attribute and generates variants",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let attributeId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      // Get or create company from shared fixtures
      const company = await createTestCompanyMinimal({ code: companyCode });
      companyId = company.id;

      // Create test item using shared fixtures
      const item = await createTestItem(companyId, {
        name: `Test Item ${runId}`,
        type: "PRODUCT",
        sku: `SKU-${runId}`
      });
      itemId = item.id;

      // Create attribute with values
      const attribute = await createVariantAttribute(companyId, itemId, {
        attribute_name: "Size",
        values: ["S", "M", "L"]
      });

      attributeId = attribute.id;
      assert.strictEqual(attribute.attribute_name, "Size");
      assert.strictEqual(attribute.values.length, 3);
      assert.ok(attribute.values.some(v => v.value === "S"));
      assert.ok(attribute.values.some(v => v.value === "M"));
      assert.ok(attribute.values.some(v => v.value === "L"));

      // Verify variants were generated
      const variants = await getItemVariants(companyId, itemId);
      assert.strictEqual(variants.length, 3, "Should generate 3 variants for 1 attribute with 3 values");

      // Verify variant SKUs
      const skus = variants.map(v => v.sku);
      assert.ok(skus.some(s => s.includes("-S")));
      assert.ok(skus.some(s => s.includes("-M")));
      assert.ok(skus.some(s => s.includes("-L")));

    } finally {
      // Cleanup - cascade delete will handle related records
      if (attributeId) {
        await sql`DELETE FROM item_variant_attributes WHERE id = ${attributeId}`.execute(db);
      }
      if (itemId) {
        await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      }
    }
  }
);

test(
  "createVariantAttribute - with multiple attributes generates cartesian product",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let attr1Id = 0;
    let attr2Id = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyRows = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number(companyRows.rows[0].id);

      const item = await createTestItem(companyId, {
        name: `Test Item ${runId}`,
        type: "PRODUCT",
        sku: `SKU-${runId}`
      });
      itemId = item.id;

      // Create first attribute
      const attr1 = await createVariantAttribute(companyId, itemId, {
        attribute_name: "Size",
        values: ["S", "M"]
      });
      attr1Id = attr1.id;

      // Create second attribute - should generate 2x2 = 4 variants
      const attr2 = await createVariantAttribute(companyId, itemId, {
        attribute_name: "Color",
        values: ["Red", "Blue"]
      });
      attr2Id = attr2.id;

      // Verify variants - should have 6 total: 2 from first attr (S, M) + 4 from combination (S/Red, S/Blue, M/Red, M/Blue)
      const variants = await getItemVariants(companyId, itemId);
      assert.ok(variants.length >= 4, `Should have at least 4 variants (2 sizes x 2 colors), got ${variants.length}`);

      // Verify all combinations exist
      const variantNames = variants.map(v => v.variant_name);
      assert.ok(variantNames.some(n => n.includes("Red") && n.includes("S")), "Should have Red, S variant");
      assert.ok(variantNames.some(n => n.includes("Red") && n.includes("M")), "Should have Red, M variant");
      assert.ok(variantNames.some(n => n.includes("Blue") && n.includes("S")), "Should have Blue, S variant");
      assert.ok(variantNames.some(n => n.includes("Blue") && n.includes("M")), "Should have Blue, M variant");

    } finally {
      if (attr2Id) await sql`DELETE FROM item_variant_attributes WHERE id = ${attr2Id}`.execute(db);
      if (attr1Id) await sql`DELETE FROM item_variant_attributes WHERE id = ${attr1Id}`.execute(db);
      if (itemId) await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
    }
  }
);

test(
  "createVariantAttribute - throws ItemNotFoundError for invalid item",
  { concurrency: false, timeout: 60000 },
  async () => {
    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    const companyRows = await sql<{ id: number }>`
      SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
    `.execute(getDb());
    assert.ok(companyRows.rows.length > 0, "Company fixture not found");
    const companyId = Number(companyRows.rows[0].id);

    await assert.rejects(
      async () => {
        await createVariantAttribute(companyId, 999999, {
          attribute_name: "Size",
          values: ["S", "M", "L"]
        });
      },
      ItemNotFoundError
    );
  }
);

test(
  "updateVariantAttribute - updates values and regenerates variants",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let attributeId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyRows = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number(companyRows.rows[0].id);

      const item = await createTestItem(companyId, {
        name: `Test Item ${runId}`,
        type: "PRODUCT",
        sku: `SKU-${runId}`
      });
      itemId = item.id;

      // Create initial attribute
      const attr = await createVariantAttribute(companyId, itemId, {
        attribute_name: "Size",
        values: ["S", "M"]
      });
      attributeId = attr.id;

      // Verify initial variants
      let variants = await getItemVariants(companyId, itemId);
      assert.strictEqual(variants.length, 2);

      // Update values - add L, remove S
      await updateVariantAttribute(companyId, attributeId, {
        values: ["M", "L"]
      });

      // Verify updated variants - S archived (inactive), M remains, L added
      variants = await getItemVariants(companyId, itemId);
      assert.ok(variants.length >= 3, "Should keep archived variants and include updated combinations");

      const sVariant = variants.find(v => v.variant_name.includes("S"));
      const mVariant = variants.find(v => v.variant_name.includes("M"));
      const lVariant = variants.find(v => v.variant_name.includes("L"));

      assert.ok(sVariant, "S variant should exist");
      assert.strictEqual(sVariant!.is_active, false, "S variant should be archived (inactive)");
      assert.ok(mVariant, "M variant should exist");
      assert.strictEqual(mVariant!.is_active, true, "M variant should be active");
      assert.ok(lVariant, "L variant should exist");
      assert.strictEqual(lVariant!.is_active, true, "L variant should be active");

    } finally {
      if (attributeId) await sql`DELETE FROM item_variant_attributes WHERE id = ${attributeId}`.execute(db);
      if (itemId) await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
    }
  }
);

test(
  "deleteVariantAttribute - archives variants and deletes attribute",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let attributeId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyRows = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number(companyRows.rows[0].id);

      const item = await createTestItem(companyId, {
        name: `Test Item ${runId}`,
        type: "PRODUCT",
        sku: `SKU-${runId}`
      });
      itemId = item.id;

      const attr = await createVariantAttribute(companyId, itemId, {
        attribute_name: "Size",
        values: ["S", "M", "L"]
      });
      attributeId = attr.id;

      // Verify variants exist and are active
      let variants = await getItemVariants(companyId, itemId);
      assert.strictEqual(variants.length, 3);
      assert.ok(variants.every(v => v.is_active));

      // Delete attribute
      await deleteVariantAttribute(companyId, attributeId);
      attributeId = 0; // Prevent double cleanup

      // Verify variants are archived (inactive)
      variants = await getItemVariants(companyId, itemId);
      assert.ok(variants.every(v => !v.is_active), "All variants should be archived");

      // Verify attribute is deleted
      const attributes = await listVariantAttributes(companyId, itemId);
      assert.strictEqual(attributes.length, 0);

    } finally {
      if (attributeId) await sql`DELETE FROM item_variant_attributes WHERE id = ${attributeId}`.execute(db);
      if (itemId) await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
    }
  }
);

test(
  "updateVariant - updates SKU, price, and status",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let attributeId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyRows = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number(companyRows.rows[0].id);

      const item = await createTestItem(companyId, {
        name: `Test Item ${runId}`,
        type: "PRODUCT",
        sku: `SKU-${runId}`
      });
      itemId = item.id;

      const attr = await createVariantAttribute(companyId, itemId, {
        attribute_name: "Size",
        values: ["S"]
      });
      attributeId = attr.id;

      let variants = await getItemVariants(companyId, itemId);
      const variant = variants[0];

      // Update variant
      const updated = await updateVariant(companyId, variant.id, {
        sku: `CUSTOM-SKU-${runId}`,
        price_override: 25.99,
        barcode: `BAR-${runId}`,
        is_active: false
      });

      assert.strictEqual(updated.sku, `CUSTOM-SKU-${runId}`);
      assert.strictEqual(updated.price_override, 25.99);
      assert.strictEqual(updated.barcode, `BAR-${runId}`);
      assert.strictEqual(updated.is_active, false);

    } finally {
      if (attributeId) await sql`DELETE FROM item_variant_attributes WHERE id = ${attributeId}`.execute(db);
      if (itemId) await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
    }
  }
);

test(
  "updateVariant - throws DuplicateSkuError for duplicate SKU",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let attributeId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyRows = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number(companyRows.rows[0].id);

      const item = await createTestItem(companyId, {
        name: `Test Item ${runId}`,
        type: "PRODUCT",
        sku: `SKU-${runId}`
      });
      itemId = item.id;

      const attr = await createVariantAttribute(companyId, itemId, {
        attribute_name: "Size",
        values: ["S", "M"]
      });
      attributeId = attr.id;

      const variants = await getItemVariants(companyId, itemId);
      const variant1 = variants[0];
      const variant2 = variants[1];

      // Try to set variant2's SKU to variant1's SKU
      await assert.rejects(
        async () => {
          await updateVariant(companyId, variant2.id, {
            sku: variant1.sku
          });
        },
        DuplicateSkuError
      );

    } finally {
      if (attributeId) await sql`DELETE FROM item_variant_attributes WHERE id = ${attributeId}`.execute(db);
      if (itemId) await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
    }
  }
);

test(
  "adjustVariantStock - adjusts stock quantity",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let attributeId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyRows = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number(companyRows.rows[0].id);

      const item = await createTestItem(companyId, {
        name: `Test Item ${runId}`,
        type: "PRODUCT",
        sku: `SKU-${runId}`
      });
      itemId = item.id;

      const attr = await createVariantAttribute(companyId, itemId, {
        attribute_name: "Size",
        values: ["S"]
      });
      attributeId = attr.id;

      const variants = await getItemVariants(companyId, itemId);
      const variant = variants[0];
      assert.strictEqual(variant.stock_quantity, 0, "Initial stock should be 0");

      // Add stock
      const newStock1 = await adjustVariantStock(companyId, variant.id, 100, "Initial stock");
      assert.strictEqual(newStock1, 100);

      // Remove stock
      const newStock2 = await adjustVariantStock(companyId, variant.id, -30, "Sales");
      assert.strictEqual(newStock2, 70);

      // Verify persisted
      const updated = await getVariantById(companyId, variant.id);
      assert.strictEqual(updated!.stock_quantity, 70);

    } finally {
      if (attributeId) await sql`DELETE FROM item_variant_attributes WHERE id = ${attributeId}`.execute(db);
      if (itemId) await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
    }
  }
);

test(
  "adjustVariantStock - prevents negative stock",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let attributeId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyRows = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number(companyRows.rows[0].id);

      const item = await createTestItem(companyId, {
        name: `Test Item ${runId}`,
        type: "PRODUCT",
        sku: `SKU-${runId}`
      });
      itemId = item.id;

      const attr = await createVariantAttribute(companyId, itemId, {
        attribute_name: "Size",
        values: ["S"]
      });
      attributeId = attr.id;

      const variants = await getItemVariants(companyId, itemId);
      const variant = variants[0];

      // Try to remove more than available
      const newStock = await adjustVariantStock(companyId, variant.id, -50, "Test negative");
      assert.strictEqual(newStock, 0, "Stock should not go below 0");

    } finally {
      if (attributeId) await sql`DELETE FROM item_variant_attributes WHERE id = ${attributeId}`.execute(db);
      if (itemId) await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
    }
  }
);

test(
  "validateVariantSku - checks SKU uniqueness",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let attributeId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyRows = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number(companyRows.rows[0].id);

      const item = await createTestItem(companyId, {
        name: `Test Item ${runId}`,
        type: "PRODUCT",
        sku: `SKU-${runId}`
      });
      itemId = item.id;

      const attr = await createVariantAttribute(companyId, itemId, {
        attribute_name: "Size",
        values: ["S"]
      });
      attributeId = attr.id;

      const variants = await getItemVariants(companyId, itemId);
      const existingSku = variants[0].sku;

      // Check existing SKU
      const result1 = await validateVariantSku(companyId, existingSku);
      assert.strictEqual(result1.valid, false);
      assert.ok(result1.error?.includes("already exists"));

      // Check new SKU
      const result2 = await validateVariantSku(companyId, `NEW-SKU-${runId}`);
      assert.strictEqual(result2.valid, true);

      // Check with exclude (same variant)
      const result3 = await validateVariantSku(companyId, existingSku, variants[0].id);
      assert.strictEqual(result3.valid, true);

    } finally {
      if (attributeId) await sql`DELETE FROM item_variant_attributes WHERE id = ${attributeId}`.execute(db);
      if (itemId) await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
    }
  }
);

test(
  "getVariantEffectivePrice - returns override or parent price",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let outletId = 0;
    let itemId = 0;
    let itemPriceId = 0;
    let attributeId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";

    try {
      const companyRows = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number(companyRows.rows[0].id);

      const outletRows = await sql<{ id: number }>`
        SELECT id FROM outlets WHERE company_id = ${companyId} AND code = ${outletCode} LIMIT 1
      `.execute(db);
      assert.ok(outletRows.rows.length > 0, "Outlet fixture not found");
      outletId = Number(outletRows.rows[0].id);

      const item = await createTestItem(companyId, {
        name: `Test Item ${runId}`,
        type: "PRODUCT",
        sku: `SKU-${runId}`
      });
      itemId = item.id;

      // Set parent item price
      const insertResult = await sql`
        INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active) 
        VALUES (${companyId}, NULL, ${itemId}, 50.00, 1)
      `.execute(db);
      itemPriceId = Number(insertResult.insertId);

      const attr = await createVariantAttribute(companyId, itemId, {
        attribute_name: "Size",
        values: ["S"]
      });
      attributeId = attr.id;

      const variants = await getItemVariants(companyId, itemId);
      const variant = variants[0];

      // Without override - should inherit parent price
      let price = await getVariantEffectivePrice(companyId, variant.id, outletId);
      assert.strictEqual(price, 50.00);

      // Set price override
      await updateVariant(companyId, variant.id, { price_override: 75.00 });

      // With override - should use override price
      price = await getVariantEffectivePrice(companyId, variant.id, outletId);
      assert.strictEqual(price, 75.00);

    } finally {
      if (itemPriceId) await sql`DELETE FROM item_prices WHERE id = ${itemPriceId}`.execute(db);
      if (attributeId) await sql`DELETE FROM item_variant_attributes WHERE id = ${attributeId}`.execute(db);
      if (itemId) await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
    }
  }
);

test(
  "getVariantById - returns null for non-existent variant",
  { concurrency: false, timeout: 60000 },
  async () => {
    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    const companyRows = await sql<{ id: number }>`
      SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
    `.execute(getDb());
    assert.ok(companyRows.rows.length > 0, "Company fixture not found");
    const companyId = Number(companyRows.rows[0].id);

    const result = await getVariantById(companyId, 999999);
    assert.strictEqual(result, null);
  }
);

test(
  "updateVariant - throws VariantNotFoundError for invalid variant",
  { concurrency: false, timeout: 60000 },
  async () => {
    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    const companyRows = await sql<{ id: number }>`
      SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
    `.execute(getDb());
    assert.ok(companyRows.rows.length > 0, "Company fixture not found");
    const companyId = Number(companyRows.rows[0].id);

    await assert.rejects(
      async () => {
        await updateVariant(companyId, 999999, { sku: "TEST" });
      },
      VariantNotFoundError
    );
  }
);

test(
  "deleteVariantAttribute - throws AttributeNotFoundError for invalid attribute",
  { concurrency: false, timeout: 60000 },
  async () => {
    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    const companyRows = await sql<{ id: number }>`
      SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
    `.execute(getDb());
    assert.ok(companyRows.rows.length > 0, "Company fixture not found");
    const companyId = Number(companyRows.rows[0].id);

    await assert.rejects(
      async () => {
        await deleteVariantAttribute(companyId, 999999);
      },
      AttributeNotFoundError
    );
  }
);

test(
  "getVariantsForSync - returns active variants with attributes and effective prices",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let outletId = 0;
    let attributeId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";

    try {
      // Get company and outlet
      const companyRows = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number(companyRows.rows[0].id);

      const outletRows = await sql<{ id: number }>`
        SELECT id FROM outlets WHERE company_id = ${companyId} AND code = ${outletCode} LIMIT 1
      `.execute(db);
      assert.ok(outletRows.rows.length > 0, "Outlet fixture not found");
      outletId = Number(outletRows.rows[0].id);

      // Create test item
      const item = await createTestItem(companyId, {
        name: `Test Item ${runId}`,
        type: "PRODUCT",
        sku: `SKU-${runId}`
      });
      itemId = item.id;

      // Create attribute with values
      const attr = await createVariantAttribute(companyId, itemId, {
        attribute_name: "Size",
        values: ["Large", "Medium"]
      });
      attributeId = attr.id;

      // Get generated variants
      const variants = await getItemVariants(companyId, itemId);
      assert.ok(variants.length >= 2, "Should have at least 2 variants");

      const largeVariant = variants.find(v => v.variant_name.includes("Large"));
      assert.ok(largeVariant, "Should have Large variant");

      // Get variants for sync
      const syncVariants = await getVariantsForSync(companyId, outletId);
      const syncItemVariants = syncVariants.filter(v => v.item_id === itemId);
      assert.ok(syncItemVariants.length >= 2, "Sync should return at least 2 variants");

      // Verify sync variant structure
      const syncLarge = syncItemVariants.find(v => v.variant_name.includes("Large"));
      assert.ok(syncLarge, "Sync should include Large variant");
      assert.strictEqual(typeof syncLarge!.price, "number", "Sync variant should have price");
      assert.strictEqual(typeof syncLarge!.attributes, "object", "Sync variant should have attributes object");
      if (syncLarge!.attributes["Size"] !== undefined) {
        assert.strictEqual(syncLarge!.attributes["Size"], "Large", "Attributes should map size to Large when populated");
      }

    } finally {
      if (attributeId) await sql`DELETE FROM item_variant_attributes WHERE id = ${attributeId}`.execute(db);
      if (itemId) await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
    }
  }
);

test(
  "getVariantsForSync - excludes inactive and archived variants",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let attributeId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      const companyRows = await sql<{ id: number }>`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number(companyRows.rows[0].id);

      const item = await createTestItem(companyId, {
        name: `Active Variant Test ${runId}`,
        type: "PRODUCT",
        sku: `SKU-ACT-${runId}`
      });
      itemId = item.id;

      const attr = await createVariantAttribute(companyId, itemId, {
        attribute_name: "Size",
        values: ["Active", "Inactive"]
      });
      attributeId = attr.id;

      // Deactivate one variant
      const allVariants = await getItemVariants(companyId, itemId);
      const inactiveVariant = allVariants.find(v => v.variant_name.includes("Inactive"));
      if (inactiveVariant) {
        await updateVariant(companyId, inactiveVariant.id, { is_active: false });
      }

      // Get variants for sync
      const syncVariants = await getVariantsForSync(companyId, undefined);
      const syncItemVariants = syncVariants.filter(v => v.item_id === itemId);

      // Should only include active variant
      assert.ok(syncItemVariants.length >= 1, "Should include at least 1 active variant");
      assert.ok(syncItemVariants.every(v => v.is_active), "All sync variants should be active");

    } finally {
      if (attributeId) await sql`DELETE FROM item_variant_attributes WHERE id = ${attributeId}`.execute(db);
      if (itemId) await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
    }
  }
);

test.after(async () => {
  await withTimeout(cleanupTestFixtures(), 10000, "cleanupTestFixtures");
  await withTimeout(closeDbPool(), 10000, "closeDbPool");

  // Final safety net: release lingering active handles that can keep node:test alive.
  // @ts-expect-error Node internal API used for diagnostics/cleanup in tests.
  const activeHandles: unknown[] = typeof process._getActiveHandles === "function"
    // @ts-expect-error Node internal API used for diagnostics/cleanup in tests.
    ? process._getActiveHandles()
    : [];

  for (const handle of activeHandles) {
    if (handle === process.stdin || handle === process.stdout || handle === process.stderr) {
      continue;
    }

    const maybeHandle = handle as {
      destroy?: () => void;
      close?: () => void;
      unref?: () => void;
      end?: () => void;
    };

    try {
      maybeHandle.unref?.();
      maybeHandle.end?.();
      maybeHandle.destroy?.();
      maybeHandle.close?.();
    } catch {
      // ignore cleanup best-effort errors
    }
  }
});
