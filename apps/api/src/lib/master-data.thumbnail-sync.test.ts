// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { buildSyncPullPayload } from "./sync/master-data";
import { getItemThumbnailsBatch } from "./item-images";
import { closeDbPool, getDb } from "./db";
import { createItem } from "./items/index.js";
import { sql } from "kysely";

loadEnvIfPresent();

test(
  "getItemThumbnailsBatch - returns empty map for empty item list",
  { concurrency: false, timeout: 60000 },
  async () => {
    const result = await getItemThumbnailsBatch(1, []);
    assert.strictEqual(result.size, 0, "Should return empty map for empty list");
  }
);

test(
  "getItemThumbnailsBatch - returns thumbnails for items with primary images",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId1 = 0;
    let itemId2 = 0;
    let imageId1 = 0;
    let imageId2 = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      // Get company from fixtures
      const companyRows = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      // Create test items
      const item1 = await createItem(companyId, {
        name: `Test Item 1 ${runId}`,
        type: 'PRODUCT'
      });
      itemId1 = item1.id;

      const item2 = await createItem(companyId, {
        name: `Test Item 2 ${runId}`,
        type: 'PRODUCT'
      });
      itemId2 = item2.id;

      // Get a valid user ID for uploaded_by
      const userRows = await sql`
        SELECT id FROM users WHERE company_id = ${companyId} LIMIT 1
      `.execute(db);
      const userId = userRows.rows.length > 0 ? Number((userRows.rows[0] as { id: number }).id) : 1;

      // Create primary images for both items
      const imageResult1 = await sql`
        INSERT INTO item_images (company_id, item_id, file_name, original_url, large_url, medium_url, thumbnail_url, file_size_bytes, mime_type, uploaded_by, is_primary, sort_order)
        VALUES (${companyId}, ${itemId1}, ${`test1-${runId}.jpg`}, ${`https://cdn.example.com/original1-${runId}.jpg`}, ${`https://cdn.example.com/large1-${runId}.jpg`}, ${`https://cdn.example.com/medium1-${runId}.jpg`}, ${`https://cdn.example.com/thumb1-${runId}.jpg`}, 1024, 'image/jpeg', ${userId}, TRUE, 0)
      `.execute(db);
      imageId1 = Number((imageResult1.insertId ?? 0));

      const imageResult2 = await sql`
        INSERT INTO item_images (company_id, item_id, file_name, original_url, large_url, medium_url, thumbnail_url, file_size_bytes, mime_type, uploaded_by, is_primary, sort_order)
        VALUES (${companyId}, ${itemId2}, ${`test2-${runId}.jpg`}, ${`https://cdn.example.com/original2-${runId}.jpg`}, ${`https://cdn.example.com/large2-${runId}.jpg`}, ${`https://cdn.example.com/medium2-${runId}.jpg`}, ${`https://cdn.example.com/thumb2-${runId}.jpg`}, 2048, 'image/jpeg', ${userId}, TRUE, 0)
      `.execute(db);
      imageId2 = Number((imageResult2.insertId ?? 0));

      // Test batch fetch
      const thumbnailMap = await getItemThumbnailsBatch(companyId, [itemId1, itemId2]);

      assert.strictEqual(thumbnailMap.size, 2, "Should return 2 thumbnails");
      assert.ok(thumbnailMap.has(itemId1), "Should have thumbnail for item 1");
      assert.ok(thumbnailMap.has(itemId2), "Should have thumbnail for item 2");
      assert.ok(thumbnailMap.get(itemId1)?.includes(`thumb1-${runId}`), "Thumbnail URL should match for item 1");
      assert.ok(thumbnailMap.get(itemId2)?.includes(`thumb2-${runId}`), "Thumbnail URL should match for item 2");

    } finally {
      // Cleanup
      if (imageId1) {
        await sql`DELETE FROM item_images WHERE id = ${imageId1}`.execute(db);
      }
      if (imageId2) {
        await sql`DELETE FROM item_images WHERE id = ${imageId2}`.execute(db);
      }
      if (itemId1) {
        await sql`DELETE FROM items WHERE id = ${itemId1}`.execute(db);
      }
      if (itemId2) {
        await sql`DELETE FROM items WHERE id = ${itemId2}`.execute(db);
      }
    }
  }
);

test(
  "getItemThumbnailsBatch - excludes non-primary images",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let primaryImageId = 0;
    let secondaryImageId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      // Get company from fixtures
      const companyRows = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      // Create test item
      const item = await createItem(companyId, {
        name: `Test Item ${runId}`,
        type: 'PRODUCT'
      });
      itemId = item.id;

      // Get a valid user ID for uploaded_by
      const userRows = await sql`
        SELECT id FROM users WHERE company_id = ${companyId} LIMIT 1
      `.execute(db);
      const userId = userRows.rows.length > 0 ? Number((userRows.rows[0] as { id: number }).id) : 1;

      // Create primary image
      const primaryResult = await sql`
        INSERT INTO item_images (company_id, item_id, file_name, original_url, large_url, medium_url, thumbnail_url, file_size_bytes, mime_type, uploaded_by, is_primary, sort_order)
        VALUES (${companyId}, ${itemId}, ${`primary-${runId}.jpg`}, ${`https://cdn.example.com/original.jpg`}, ${`https://cdn.example.com/large.jpg`}, ${`https://cdn.example.com/medium.jpg`}, ${`https://cdn.example.com/primary-thumb-${runId}.jpg`}, 1024, 'image/jpeg', ${userId}, TRUE, 0)
      `.execute(db);
      primaryImageId = Number((primaryResult.insertId ?? 0));

      // Create secondary (non-primary) image
      const secondaryResult = await sql`
        INSERT INTO item_images (company_id, item_id, file_name, original_url, large_url, medium_url, thumbnail_url, file_size_bytes, mime_type, uploaded_by, is_primary, sort_order)
        VALUES (${companyId}, ${itemId}, ${`secondary-${runId}.jpg`}, ${`https://cdn.example.com/original2.jpg`}, ${`https://cdn.example.com/large2.jpg`}, ${`https://cdn.example.com/medium2.jpg`}, ${`https://cdn.example.com/secondary-thumb-${runId}.jpg`}, 2048, 'image/jpeg', ${userId}, FALSE, 1)
      `.execute(db);
      secondaryImageId = Number((secondaryResult.insertId ?? 0));

      // Test batch fetch - should only return primary
      const thumbnailMap = await getItemThumbnailsBatch(companyId, [itemId]);

      assert.strictEqual(thumbnailMap.size, 1, "Should return only 1 thumbnail (primary only)");
      assert.ok(thumbnailMap.has(itemId), "Should have thumbnail for item");
      assert.ok(thumbnailMap.get(itemId)?.includes(`primary-thumb-${runId}`), "Should return primary thumbnail URL");
      assert.ok(!thumbnailMap.get(itemId)?.includes(`secondary-thumb-${runId}`), "Should NOT return secondary thumbnail URL");

    } finally {
      // Cleanup
      if (secondaryImageId) {
        await sql`DELETE FROM item_images WHERE id = ${secondaryImageId}`.execute(db);
      }
      if (primaryImageId) {
        await sql`DELETE FROM item_images WHERE id = ${primaryImageId}`.execute(db);
      }
      if (itemId) {
        await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      }
    }
  }
);

test(
  "getItemThumbnailsBatch - returns null for items without images",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      // Get company from fixtures
      const companyRows = await sql`
        SELECT id FROM companies WHERE code = ${companyCode} LIMIT 1
      `.execute(db);
      assert.ok(companyRows.rows.length > 0, "Company fixture not found");
      companyId = Number((companyRows.rows[0] as { id: number }).id);

      // Create test item WITHOUT image
      const item = await createItem(companyId, {
        name: `Test Item No Image ${runId}`,
        type: 'PRODUCT'
      });
      itemId = item.id;

      // Test batch fetch - should return empty map
      const thumbnailMap = await getItemThumbnailsBatch(companyId, [itemId]);

      assert.strictEqual(thumbnailMap.size, 0, "Should return empty map for items without images");
      assert.ok(!thumbnailMap.has(itemId), "Should NOT have entry for item without image");

    } finally {
      // Cleanup
      if (itemId) {
        await sql`DELETE FROM items WHERE id = ${itemId}`.execute(db);
      }
    }
  }
);

test(
  "buildSyncPullPayload - includes thumbnail URLs in sync payload",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let outletId = 0;
    let itemIdWithImage = 0;
    let itemIdWithoutImage = 0;
    let imageId = 0;

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

      // Create test item WITH image
      const newItemWithImage = await createItem(companyId, {
        name: `Test Item With Image ${runId}`,
        type: 'PRODUCT',
        is_active: true
      });
      itemIdWithImage = newItemWithImage.id;

      // Create test item WITHOUT image
      const newItemWithoutImage = await createItem(companyId, {
        name: `Test Item Without Image ${runId}`,
        type: 'PRODUCT',
        is_active: true
      });
      itemIdWithoutImage = newItemWithoutImage.id;

      // Get a valid user ID for uploaded_by
      const userRows = await sql`
        SELECT id FROM users WHERE company_id = ${companyId} LIMIT 1
      `.execute(db);
      const userId = userRows.rows.length > 0 ? Number((userRows.rows[0] as { id: number }).id) : 1;

      // Create primary image for first item
      const imageResult = await sql`
        INSERT INTO item_images (company_id, item_id, file_name, original_url, large_url, medium_url, thumbnail_url, file_size_bytes, mime_type, uploaded_by, is_primary, sort_order)
        VALUES (${companyId}, ${itemIdWithImage}, ${`sync-test-${runId}.jpg`}, ${`https://cdn.example.com/original-${runId}.jpg`}, ${`https://cdn.example.com/large-${runId}.jpg`}, ${`https://cdn.example.com/medium-${runId}.jpg`}, ${`https://cdn.example.com/thumb-${runId}.jpg`}, 1024, 'image/jpeg', ${userId}, TRUE, 0)
      `.execute(db);
      imageId = Number((imageResult.insertId ?? 0));

      // Create a price for the item with image so it appears in effective prices
      await sql`
        INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active) VALUES (${companyId}, NULL, ${itemIdWithImage}, 1000, TRUE)
      `.execute(db);

      // Create a price for the item without image
      await sql`
        INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active) VALUES (${companyId}, NULL, ${itemIdWithoutImage}, 2000, TRUE)
      `.execute(db);

      // Build sync payload
      const payload = await buildSyncPullPayload(companyId, outletId, 0);

      // Find items in payload
      const itemWithImage = payload.items.find((i) => i.id === itemIdWithImage);
      const itemWithoutImage = payload.items.find((i) => i.id === itemIdWithoutImage);

      // Verify item with image has thumbnail_url
      assert.ok(itemWithImage, "Item with image should be in payload");
      assert.ok(itemWithImage!.thumbnail_url, "Item with image should have thumbnail_url");
      assert.ok(itemWithImage!.thumbnail_url?.includes(`thumb-${runId}`), "Thumbnail URL should match");

      // Verify item without image has null thumbnail_url
      assert.ok(itemWithoutImage, "Item without image should be in payload");
      assert.strictEqual(itemWithoutImage!.thumbnail_url, null, "Item without image should have null thumbnail_url");

    } finally {
      // Cleanup
      if (imageId) {
        await sql`DELETE FROM item_images WHERE id = ${imageId}`.execute(db);
      }
      await sql`DELETE FROM item_prices WHERE company_id = ${companyId} AND item_id IN (${itemIdWithImage}, ${itemIdWithoutImage})`.execute(db);
      if (itemIdWithImage) {
        await sql`DELETE FROM items WHERE id = ${itemIdWithImage}`.execute(db);
      }
      if (itemIdWithoutImage) {
        await sql`DELETE FROM items WHERE id = ${itemIdWithoutImage}`.execute(db);
      }
    }
  }
);

test.after(async () => {
  await closeDbPool();
});
