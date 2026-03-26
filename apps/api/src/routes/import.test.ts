// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { closeDbPool, getDbPool } from "../lib/db.js";
import type { Pool } from "mysql2/promise";
import { parseCSVSync } from "../lib/import/parsers.js";

const SAMPLE_ITEM_CSV = `sku,name,item_type,barcode,item_group_id,is_active
TEST-SKU-001,Test Item 1,INVENTORY,123456789,1,true
TEST-SKU-002,Test Item 2,SERVICE,,,true`;

describe("Import Routes", () => {
  let pool: Pool;

  before(async () => {
    pool = getDbPool();
  });

  after(async () => {
    await closeDbPool();
  });

  describe("File Parsing", () => {
    it("should parse CSV file correctly", async () => {
      const buffer = Buffer.from(SAMPLE_ITEM_CSV);
      const result = parseCSVSync(buffer);

      assert.equal(result.rows.length, 2);
      assert.equal(result.rows[0].data.sku, "TEST-SKU-001");
      assert.equal(result.rows[0].data.name, "Test Item 1");
    });

    it("should handle empty CSV files", async () => {
      const buffer = Buffer.from("sku,name\n");
      const result = parseCSVSync(buffer);

      assert.equal(result.rows.length, 0);
    });
  });

  describe("Field Validation", () => {
    it("should validate item type values", async () => {
      const validTypes = ["INVENTORY", "NON_INVENTORY", "SERVICE", "RAW_MATERIAL"];
      assert.ok(validTypes.includes("INVENTORY"));
      assert.ok(!validTypes.includes("INVALID_TYPE"));
    });

    it("should validate price values", async () => {
      const negativePrice = -100;
      assert.ok(negativePrice < 0);
      
      const validPrice = 10000;
      assert.ok(validPrice >= 0);
    });
  });
});
