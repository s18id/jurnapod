// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { buildSyncPullPayload } from "./master-data";
import { getItemThumbnailsBatch } from "./item-images";
import { closeDbPool, getDbPool } from "./db";
import type { RowDataPacket } from "mysql2";

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
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId1 = 0;
    let itemId2 = 0;
    let imageId1 = 0;
    let imageId2 = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      // Get company from fixtures
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      assert.ok(companyRows.length > 0, "Company fixture not found");
      companyId = Number(companyRows[0].id);

      // Create test items
      const [itemResult1] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'PRODUCT')`,
        [companyId, `Test Item 1 ${runId}`]
      );
      itemId1 = Number((itemResult1 as { insertId: number }).insertId);

      const [itemResult2] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'PRODUCT')`,
        [companyId, `Test Item 2 ${runId}`]
      );
      itemId2 = Number((itemResult2 as { insertId: number }).insertId);

      // Get a valid user ID for uploaded_by
      const [userRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM users WHERE company_id = ? LIMIT 1`,
        [companyId]
      );
      const userId = userRows.length > 0 ? Number(userRows[0].id) : 1;

      // Create primary images for both items
      const [imageResult1] = await pool.execute(
        `INSERT INTO item_images (company_id, item_id, file_name, original_url, large_url, medium_url, thumbnail_url, file_size_bytes, mime_type, uploaded_by, is_primary, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, 0)`,
        [companyId, itemId1, `test1-${runId}.jpg`, `https://cdn.example.com/original1-${runId}.jpg`, `https://cdn.example.com/large1-${runId}.jpg`, `https://cdn.example.com/medium1-${runId}.jpg`, `https://cdn.example.com/thumb1-${runId}.jpg`, 1024, 'image/jpeg', userId]
      );
      imageId1 = Number((imageResult1 as { insertId: number }).insertId);

      const [imageResult2] = await pool.execute(
        `INSERT INTO item_images (company_id, item_id, file_name, original_url, large_url, medium_url, thumbnail_url, file_size_bytes, mime_type, uploaded_by, is_primary, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, 0)`,
        [companyId, itemId2, `test2-${runId}.jpg`, `https://cdn.example.com/original2-${runId}.jpg`, `https://cdn.example.com/large2-${runId}.jpg`, `https://cdn.example.com/medium2-${runId}.jpg`, `https://cdn.example.com/thumb2-${runId}.jpg`, 2048, 'image/jpeg', userId]
      );
      imageId2 = Number((imageResult2 as { insertId: number }).insertId);

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
        await pool.execute(`DELETE FROM item_images WHERE id = ?`, [imageId1]);
      }
      if (imageId2) {
        await pool.execute(`DELETE FROM item_images WHERE id = ?`, [imageId2]);
      }
      if (itemId1) {
        await pool.execute(`DELETE FROM items WHERE id = ?`, [itemId1]);
      }
      if (itemId2) {
        await pool.execute(`DELETE FROM items WHERE id = ?`, [itemId2]);
      }
    }
  }
);

test(
  "getItemThumbnailsBatch - excludes non-primary images",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;
    let primaryImageId = 0;
    let secondaryImageId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      // Get company from fixtures
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      assert.ok(companyRows.length > 0, "Company fixture not found");
      companyId = Number(companyRows[0].id);

      // Create test item
      const [itemResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'PRODUCT')`,
        [companyId, `Test Item ${runId}`]
      );
      itemId = Number((itemResult as { insertId: number }).insertId);

      // Get a valid user ID for uploaded_by
      const [userRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM users WHERE company_id = ? LIMIT 1`,
        [companyId]
      );
      const userId = userRows.length > 0 ? Number(userRows[0].id) : 1;

      // Create primary image
      const [primaryResult] = await pool.execute(
        `INSERT INTO item_images (company_id, item_id, file_name, original_url, large_url, medium_url, thumbnail_url, file_size_bytes, mime_type, uploaded_by, is_primary, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, 0)`,
        [companyId, itemId, `primary-${runId}.jpg`, `https://cdn.example.com/original.jpg`, `https://cdn.example.com/large.jpg`, `https://cdn.example.com/medium.jpg`, `https://cdn.example.com/primary-thumb-${runId}.jpg`, 1024, 'image/jpeg', userId]
      );
      primaryImageId = Number((primaryResult as { insertId: number }).insertId);

      // Create secondary (non-primary) image
      const [secondaryResult] = await pool.execute(
        `INSERT INTO item_images (company_id, item_id, file_name, original_url, large_url, medium_url, thumbnail_url, file_size_bytes, mime_type, uploaded_by, is_primary, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, 1)`,
        [companyId, itemId, `secondary-${runId}.jpg`, `https://cdn.example.com/original2.jpg`, `https://cdn.example.com/large2.jpg`, `https://cdn.example.com/medium2.jpg`, `https://cdn.example.com/secondary-thumb-${runId}.jpg`, 2048, 'image/jpeg', userId]
      );
      secondaryImageId = Number((secondaryResult as { insertId: number }).insertId);

      // Test batch fetch - should only return primary
      const thumbnailMap = await getItemThumbnailsBatch(companyId, [itemId]);

      assert.strictEqual(thumbnailMap.size, 1, "Should return only 1 thumbnail (primary only)");
      assert.ok(thumbnailMap.has(itemId), "Should have thumbnail for item");
      assert.ok(thumbnailMap.get(itemId)?.includes(`primary-thumb-${runId}`), "Should return primary thumbnail URL");
      assert.ok(!thumbnailMap.get(itemId)?.includes(`secondary-thumb-${runId}`), "Should NOT return secondary thumbnail URL");

    } finally {
      // Cleanup
      if (secondaryImageId) {
        await pool.execute(`DELETE FROM item_images WHERE id = ?`, [secondaryImageId]);
      }
      if (primaryImageId) {
        await pool.execute(`DELETE FROM item_images WHERE id = ?`, [primaryImageId]);
      }
      if (itemId) {
        await pool.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      }
    }
  }
);

test(
  "getItemThumbnailsBatch - returns null for items without images",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);

    let companyId = 0;
    let itemId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";

    try {
      // Get company from fixtures
      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      assert.ok(companyRows.length > 0, "Company fixture not found");
      companyId = Number(companyRows[0].id);

      // Create test item WITHOUT image
      const [itemResult] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'PRODUCT')`,
        [companyId, `Test Item No Image ${runId}`]
      );
      itemId = Number((itemResult as { insertId: number }).insertId);

      // Test batch fetch - should return empty map
      const thumbnailMap = await getItemThumbnailsBatch(companyId, [itemId]);

      assert.strictEqual(thumbnailMap.size, 0, "Should return empty map for items without images");
      assert.ok(!thumbnailMap.has(itemId), "Should NOT have entry for item without image");

    } finally {
      // Cleanup
      if (itemId) {
        await pool.execute(`DELETE FROM items WHERE id = ?`, [itemId]);
      }
    }
  }
);

test(
  "buildSyncPullPayload - includes thumbnail URLs in sync payload",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
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

      // Create test item WITH image
      const [itemResult1] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type, is_active) VALUES (?, ?, 'PRODUCT', TRUE)`,
        [companyId, `Test Item With Image ${runId}`]
      );
      itemIdWithImage = Number((itemResult1 as { insertId: number }).insertId);

      // Create test item WITHOUT image
      const [itemResult2] = await pool.execute(
        `INSERT INTO items (company_id, name, item_type, is_active) VALUES (?, ?, 'PRODUCT', TRUE)`,
        [companyId, `Test Item Without Image ${runId}`]
      );
      itemIdWithoutImage = Number((itemResult2 as { insertId: number }).insertId);

      // Get a valid user ID for uploaded_by
      const [userRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM users WHERE company_id = ? LIMIT 1`,
        [companyId]
      );
      const userId = userRows.length > 0 ? Number(userRows[0].id) : 1;

      // Create primary image for first item
      const [imageResult] = await pool.execute(
        `INSERT INTO item_images (company_id, item_id, file_name, original_url, large_url, medium_url, thumbnail_url, file_size_bytes, mime_type, uploaded_by, is_primary, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, 0)`,
        [companyId, itemIdWithImage, `sync-test-${runId}.jpg`, `https://cdn.example.com/original-${runId}.jpg`, `https://cdn.example.com/large-${runId}.jpg`, `https://cdn.example.com/medium-${runId}.jpg`, `https://cdn.example.com/thumb-${runId}.jpg`, 1024, 'image/jpeg', userId]
      );
      imageId = Number((imageResult as { insertId: number }).insertId);

      // Create a price for the item with image so it appears in effective prices
      await pool.execute(
        `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active) VALUES (?, NULL, ?, ?, TRUE)`,
        [companyId, itemIdWithImage, 1000]
      );

      // Create a price for the item without image
      await pool.execute(
        `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active) VALUES (?, NULL, ?, ?, TRUE)`,
        [companyId, itemIdWithoutImage, 2000]
      );

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
        await pool.execute(`DELETE FROM item_images WHERE id = ?`, [imageId]);
      }
      await pool.execute(`DELETE FROM item_prices WHERE company_id = ? AND item_id IN (?, ?)`, [companyId, itemIdWithImage, itemIdWithoutImage]);
      if (itemIdWithImage) {
        await pool.execute(`DELETE FROM items WHERE id = ?`, [itemIdWithImage]);
      }
      if (itemIdWithoutImage) {
        await pool.execute(`DELETE FROM items WHERE id = ?`, [itemIdWithoutImage]);
      }
    }
  }
);

test.after(async () => {
  await closeDbPool();
});
