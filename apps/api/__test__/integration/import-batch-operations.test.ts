// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Import Batch Operations Library Tests
 */

import {test, describe, afterAll} from 'vitest';
import assert from "node:assert/strict";
import { closeDbPool } from "../../src/lib/db.js";
import {
  batchFindItemsBySkus,
  batchFindPricesByItemIds,
} from "../../src/lib/import/batch-operations.js";

afterAll(async () => {
  await closeDbPool();
});

describe("Import Batch Operations", () => {
  describe("batchFindItemsBySkus", () => {
    test("returns empty map for empty SKU array", async () => {
      const result = await batchFindItemsBySkus(1, []);
      assert.strictEqual(result.size, 0);
    });

    test("returns empty map for non-existent SKUs", async () => {
      const result = await batchFindItemsBySkus(1, [
        "NONEXISTENT_1",
        "NONEXISTENT_2",
      ]);
      assert.strictEqual(result.size, 0);
    });
  });

  describe("batchFindPricesByItemIds", () => {
    test("returns empty map for empty item ID array", async () => {
      const result = await batchFindPricesByItemIds(1, []);
      assert.strictEqual(result.size, 0);
    });
  });
});
