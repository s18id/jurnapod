// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Import Validation Library Tests
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { closeDbPool } from "../db.js";
import {
  checkSkuExists,
  checkItemExistsBySku,
  batchCheckSkusExist,
} from "./validation.js";

test.after(async () => {
  await closeDbPool();
});

describe("Import Validation", () => {
  describe("checkSkuExists", () => {
    test("returns exists=false for non-existent SKU", async () => {
      const result = await checkSkuExists(1, "NONEXISTENT_SKU_12345");
      assert.strictEqual(result.exists, false);
      assert.strictEqual(result.itemId, undefined);
    });
  });

  describe("checkItemExistsBySku", () => {
    test("returns exists=false for non-existent SKU", async () => {
      const result = await checkItemExistsBySku(1, "NONEXISTENT_SKU_67890");
      assert.strictEqual(result.exists, false);
      assert.strictEqual(result.itemId, undefined);
    });
  });

  describe("batchCheckSkusExist", () => {
    test("returns empty map for empty SKU array", async () => {
      const result = await batchCheckSkusExist(1, []);
      assert.strictEqual(result.size, 0);
    });

    test("returns empty map for non-existent SKUs", async () => {
      const result = await batchCheckSkusExist(1, [
        "NONEXISTENT_1",
        "NONEXISTENT_2",
      ]);
      assert.strictEqual(result.size, 0);
    });
  });
});
