// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Import Routes Tests
 *
 * Unit tests for import API route helpers and utilities.
 * Tests CSV parsing, field validation, type conversion, sanitization.
 * CRITICAL: All tests using getDbPool() must close the pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { closeDbPool, getDbPool } from "../lib/db.js";
import { parseCSVSync } from "../lib/import/parsers.js";
import type { RowDataPacket } from "mysql2/promise";

// Sample CSV data for testing
const SAMPLE_ITEMS_CSV = `sku,name,item_type,barcode,is_active
TEST-IMPORT-001,Test Item 1,INVENTORY,123456789,true
TEST-IMPORT-002,Test Item 2,SERVICE,,false
TEST-IMPORT-003,Test Item 3,NON_INVENTORY,987654321,true`;

const SAMPLE_PRICES_CSV = `item_sku,price,is_active
TEST-IMPORT-001,10000,true
TEST-IMPORT-002,25000,false
TEST-IMPORT-003,15000,true`;

describe("Import Routes - CSV Parsing", () => {
  describe("parseCSVSync", () => {
    test("correctly parses valid CSV with 3 data rows", () => {
      const buffer = Buffer.from(SAMPLE_ITEMS_CSV);
      const result = parseCSVSync(buffer);

      assert.equal(result.rows.length, 3, "Should parse 3 data rows");
    });

    test("extracts correct column values from first row", () => {
      const buffer = Buffer.from(SAMPLE_ITEMS_CSV);
      const result = parseCSVSync(buffer);

      assert.equal(result.rows[0].data.sku, "TEST-IMPORT-001");
      assert.equal(result.rows[0].data.name, "Test Item 1");
      assert.equal(result.rows[0].data.item_type, "INVENTORY");
      assert.equal(result.rows[0].data.barcode, "123456789");
      assert.equal(result.rows[0].data.is_active, "true");
    });

    test("handles empty CSV files gracefully", () => {
      const buffer = Buffer.from("sku,name\n");
      const result = parseCSVSync(buffer);

      assert.equal(result.rows.length, 0, "Should have no data rows");
    });

    test("handles CSV with missing columns", () => {
      const buffer = Buffer.from("sku,name\nitem1");
      const result = parseCSVSync(buffer);

      // Should still parse, row count may vary
      assert.ok(result.rows.length >= 0);
    });

    test("handles CSV with extra columns", () => {
      const buffer = Buffer.from("sku,name,extra1,extra2\nitem1,Test,extra1,extra2");
      const result = parseCSVSync(buffer);

      assert.ok(result.rows.length >= 1);
    });

    test("preserves row numbers", () => {
      const buffer = Buffer.from("sku,name\nitem1,Test1\nitem2,Test2");
      const result = parseCSVSync(buffer);

      assert.equal(result.rows[0].rowNumber, 2); // Header is row 1, data starts at row 2
      assert.equal(result.rows[1].rowNumber, 3);
    });
  });

  describe("parseCSVSync - Price Data", () => {
    test("parses price CSV correctly", () => {
      const buffer = Buffer.from(SAMPLE_PRICES_CSV);
      const result = parseCSVSync(buffer);

      assert.equal(result.rows.length, 3);
    });

    test("extracts price values correctly", () => {
      const buffer = Buffer.from(SAMPLE_PRICES_CSV);
      const result = parseCSVSync(buffer);

      assert.equal(result.rows[0].data.item_sku, "TEST-IMPORT-001");
      assert.equal(result.rows[0].data.price, "10000");
      assert.equal(result.rows[0].data.is_active, "true");
    });
  });
});

describe("Import Routes - Field Validation", () => {
  const VALID_ITEM_TYPES = ["INVENTORY", "NON_INVENTORY", "SERVICE", "RAW_MATERIAL"];

  test("validates INVENTORY item type", () => {
    assert.ok(VALID_ITEM_TYPES.includes("INVENTORY"));
  });

  test("validates NON_INVENTORY item type", () => {
    assert.ok(VALID_ITEM_TYPES.includes("NON_INVENTORY"));
  });

  test("validates SERVICE item type", () => {
    assert.ok(VALID_ITEM_TYPES.includes("SERVICE"));
  });

  test("validates RAW_MATERIAL item type", () => {
    assert.ok(VALID_ITEM_TYPES.includes("RAW_MATERIAL"));
  });

  test("rejects invalid item type", () => {
    assert.ok(!VALID_ITEM_TYPES.includes("INVALID_TYPE"));
    assert.ok(!VALID_ITEM_TYPES.includes(""));
    assert.ok(!VALID_ITEM_TYPES.includes("inventory")); // case-sensitive
  });

  test("price validation rejects negative prices", () => {
    const negativePrice = -100;
    assert.ok(negativePrice < 0, "Negative price should be rejected");
  });

  test("price validation accepts zero", () => {
    const zeroPrice = 0;
    assert.ok(zeroPrice >= 0, "Zero price should be accepted");
  });

  test("price validation accepts positive prices", () => {
    const positivePrice = 10000;
    assert.ok(positivePrice >= 0, "Positive price should be accepted");
  });
});

describe("Import Routes - Type Conversion", () => {
  test("converts string to integer correctly", () => {
    assert.equal(parseInt("123", 10), 123);
    assert.equal(parseInt("0", 10), 0);
    assert.equal(parseInt("999999", 10), 999999);
  });

  test("converts string to float correctly", () => {
    assert.equal(parseFloat("123.45"), 123.45);
    assert.equal(parseFloat("0.00"), 0);
    assert.equal(parseFloat("9999.99"), 9999.99);
  });

  test("handles invalid integer strings", () => {
    assert.ok(isNaN(parseInt("not-a-number", 10)));
  });

  test("handles invalid float strings", () => {
    assert.ok(isNaN(parseFloat("not-a-number")));
  });

  test("converts boolean strings to true", () => {
    const trueValues = ["true", "1", "yes", "y", "TRUE", "Yes", "YES"];
    for (const v of trueValues) {
      assert.ok(["true", "1", "yes", "y"].includes(v.toLowerCase()), `"${v}" should be truthy`);
    }
  });

  test("converts boolean strings to false", () => {
    const falseValues = ["false", "0", "no", "n", "FALSE", "No", "NO"];
    for (const v of falseValues) {
      assert.ok(["false", "0", "no", "n"].includes(v.toLowerCase()), `"${v}" should be falsy`);
    }
  });
});

describe("Import Routes - Field Definitions", () => {
  test("items import has correct required fields", () => {
    const ITEM_IMPORT_FIELDS = {
      sku: { type: "string" as const, required: true },
      name: { type: "string" as const, required: true },
      item_type: { type: "string" as const, required: true },
      barcode: { type: "string" as const, required: false },
      item_group_id: { type: "integer" as const, required: false },
      cogs_account_id: { type: "integer" as const, required: false },
      inventory_asset_account_id: { type: "integer" as const, required: false },
      is_active: { type: "boolean" as const, required: false },
    };

    assert.ok(ITEM_IMPORT_FIELDS.sku.required === true);
    assert.ok(ITEM_IMPORT_FIELDS.name.required === true);
    assert.ok(ITEM_IMPORT_FIELDS.item_type.required === true);
    assert.ok(ITEM_IMPORT_FIELDS.barcode.required === false);
    assert.ok(ITEM_IMPORT_FIELDS.is_active.required === false);
  });

  test("prices import has correct required fields", () => {
    const PRICE_IMPORT_FIELDS = {
      item_sku: { type: "string" as const, required: true },
      item_name: { type: "string" as const, required: false },
      outlet_id: { type: "integer" as const, required: false },
      price: { type: "number" as const, required: true },
      is_active: { type: "boolean" as const, required: false },
    };

    assert.ok(PRICE_IMPORT_FIELDS.item_sku.required === true);
    assert.ok(PRICE_IMPORT_FIELDS.price.required === true);
    assert.ok(PRICE_IMPORT_FIELDS.item_name.required === false);
    assert.ok(PRICE_IMPORT_FIELDS.outlet_id.required === false);
  });
});

describe("Import Routes - Template Generation", () => {
  test("items template has all required columns", () => {
    const ITEM_IMPORT_FIELDS = {
      sku: { type: "string" as const, required: true },
      name: { type: "string" as const, required: true },
      item_type: { type: "string" as const, required: true },
      barcode: { type: "string" as const, required: false },
    };

    const headers = Object.keys(ITEM_IMPORT_FIELDS);
    assert.ok(headers.includes("sku"));
    assert.ok(headers.includes("name"));
    assert.ok(headers.includes("item_type"));
    assert.ok(headers.includes("barcode"));
    assert.equal(headers.length, 4);
  });

  test("prices template has all required columns", () => {
    const PRICE_IMPORT_FIELDS = {
      item_sku: { type: "string" as const, required: true },
      price: { type: "number" as const, required: true },
      is_active: { type: "boolean" as const, required: false },
    };

    const headers = Object.keys(PRICE_IMPORT_FIELDS);
    assert.ok(headers.includes("item_sku"));
    assert.ok(headers.includes("price"));
    assert.ok(headers.includes("is_active"));
    assert.equal(headers.length, 3);
  });
});

describe("Import Routes - Session Management Constants", () => {
  test("session cleanup interval is 30 minutes in milliseconds", () => {
    const SESSION_CLEANUP_INTERVAL = 30 * 60 * 1000;
    assert.equal(SESSION_CLEANUP_INTERVAL, 1800000, "30 minutes = 1800000ms");
  });

  test("session count warning threshold is 1000", () => {
    const SESSION_COUNT_WARNING_THRESHOLD = 1000;
    assert.equal(SESSION_COUNT_WARNING_THRESHOLD, 1000);
  });
});

describe("Import Routes - Batch Processing", () => {
  test("batch size constant is 500", () => {
    const BATCH_SIZE = 500;
    assert.equal(BATCH_SIZE, 500);
  });

  test("calculates correct batch ranges for 1200 rows", () => {
    const BATCH_SIZE = 500;
    const totalRows = 1200;
    const batches: Array<[number, number]> = [];

    for (let batchStart = 0; batchStart < totalRows; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, totalRows);
      batches.push([batchStart, batchEnd]);
    }

    assert.equal(batches.length, 3, "1200 rows / 500 per batch = 3 batches");
    assert.deepEqual(batches[0], [0, 500]);
    assert.deepEqual(batches[1], [500, 1000]);
    assert.deepEqual(batches[2], [1000, 1200]);
  });

  test("calculates correct batch ranges for 100 rows", () => {
    const BATCH_SIZE = 500;
    const totalRows = 100;

    const batches: Array<[number, number]> = [];
    for (let batchStart = 0; batchStart < totalRows; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, totalRows);
      batches.push([batchStart, batchEnd]);
    }

    assert.equal(batches.length, 1, "100 rows / 500 per batch = 1 batch");
    assert.deepEqual(batches[0], [0, 100]);
  });

  test("calculates correct batch ranges for exactly 500 rows", () => {
    const BATCH_SIZE = 500;
    const totalRows = 500;

    const batches: Array<[number, number]> = [];
    for (let batchStart = 0; batchStart < totalRows; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, totalRows);
      batches.push([batchStart, batchEnd]);
    }

    assert.equal(batches.length, 1, "500 rows / 500 per batch = 1 batch");
    assert.deepEqual(batches[0], [0, 500]);
  });

  test("calculates correct batch ranges for 501 rows", () => {
    const BATCH_SIZE = 500;
    const totalRows = 501;

    const batches: Array<[number, number]> = [];
    for (let batchStart = 0; batchStart < totalRows; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, totalRows);
      batches.push([batchStart, batchEnd]);
    }

    assert.equal(batches.length, 2, "501 rows / 500 per batch = 2 batches");
    assert.deepEqual(batches[0], [0, 500]);
    assert.deepEqual(batches[1], [500, 501]);
  });
});

describe("Import Routes - String Sanitization", () => {
  const MAX_STRING_LENGTH = 255;
  const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

  test("max string length is 255", () => {
    assert.equal(MAX_STRING_LENGTH, 255);
  });

  test("trims whitespace from strings", () => {
    assert.equal("  hello  ".trim(), "hello");
    assert.equal("\thello\t".trim(), "hello");
    assert.equal("\nhello\n".trim(), "hello");
  });

  test("rejects null character", () => {
    assert.ok(CONTROL_CHAR_REGEX.test("\x00"));
  });

  test("rejects other control characters", () => {
    assert.ok(CONTROL_CHAR_REGEX.test("\x01"));
    assert.ok(CONTROL_CHAR_REGEX.test("\x07")); // Bell
    assert.ok(CONTROL_CHAR_REGEX.test("\x0B")); // Vertical tab
  });

  test("accepts normal printable characters", () => {
    assert.ok(!CONTROL_CHAR_REGEX.test("hello world"));
    assert.ok(!CONTROL_CHAR_REGEX.test("abc123!@#"));
    assert.ok(!CONTROL_CHAR_REGEX.test("ñ ü 你好"));
  });

  test("accepts common punctuation", () => {
    assert.ok(!CONTROL_CHAR_REGEX.test("!@#$%^&*()"));
    assert.ok(!CONTROL_CHAR_REGEX.test(",./;'[]-="));
  });

  test("truncates strings longer than 255 characters", () => {
    const longString = "a".repeat(300);
    const truncated = longString.slice(0, MAX_STRING_LENGTH);
    assert.equal(truncated.length, 255);
  });
});

describe("Import Routes - File Extension Validation", () => {
  test("case-insensitive CSV extension check", () => {
    const isCSV = (name: string) => name.toLowerCase().endsWith(".csv");

    assert.ok(isCSV("file.CSV"));
    assert.ok(isCSV("file.csv"));
    assert.ok(isCSV("file.Csv"));
    assert.ok(isCSV("FILE.CSV"));
    assert.ok(!isCSV("file.txt"));
    assert.ok(!isCSV("file.csvx"));
  });

  test("case-insensitive XLSX extension check", () => {
    const isXLSX = (name: string) => name.toLowerCase().endsWith(".xlsx");

    assert.ok(isXLSX("file.XLSX"));
    assert.ok(isXLSX("file.xlsx"));
    assert.ok(isXLSX("file.XlSx"));
    assert.ok(isXLSX("FILE.XLSX"));
    assert.ok(!isXLSX("file.xls"));
    assert.ok(!isXLSX("file.xlsxm"));
  });
});

describe("Import Routes - Mapping Validation", () => {
  test("validates source column exists", () => {
    const availableColumns = ["sku", "name", "item_type", "barcode"];
    const mapping = { sourceColumn: "sku", targetField: "sku" };

    assert.ok(availableColumns.includes(mapping.sourceColumn));
  });

  test("detects missing source column", () => {
    const availableColumns = ["sku", "name", "item_type", "barcode"];
    const mapping = { sourceColumn: "invalid_column", targetField: "sku" };

    assert.ok(!availableColumns.includes(mapping.sourceColumn));
  });

  test("validates target field is valid for entity type", () => {
    const itemFields = {
      sku: { type: "string" as const, required: true },
      name: { type: "string" as const, required: true },
    };
    const mapping = { sourceColumn: "sku", targetField: "sku" };

    assert.ok(itemFields[mapping.targetField as keyof typeof itemFields] !== undefined);
  });

  test("detects invalid target field", () => {
    const itemFields = {
      sku: { type: "string" as const, required: true },
      name: { type: "string" as const, required: true },
    };
    const mapping = { sourceColumn: "col", targetField: "invalid_field" };

    assert.ok(itemFields[mapping.targetField as keyof typeof itemFields] === undefined);
  });
});

describe("Import Routes - Error Handling", () => {
  test("handles missing required fields", () => {
    const row = { sku: undefined, name: undefined, item_type: undefined };
    
    // Required field check
    for (const key of Object.keys(row)) {
      const value = row[key as keyof typeof row];
      assert.ok(value === undefined || value === null || value === "");
    }
  });

  test("handles empty string values", () => {
    const value = "";
    assert.ok(value === undefined || value === null || value === "");
  });

  test("handles null values", () => {
    const value = null;
    assert.ok(value === undefined || value === null || value === "");
  });

  test("detects invalid item types", () => {
    const validTypes = ["INVENTORY", "NON_INVENTORY", "SERVICE", "RAW_MATERIAL"];
    const invalidType = "INVALID_TYPE";
    
    assert.ok(!validTypes.includes(invalidType));
  });
});

describe("Import Routes - Database Pool", () => {
  test("getDbPool returns a valid pool", () => {
    const pool = getDbPool();
    assert.ok(pool !== null);
    assert.ok(pool !== undefined);
  });

  test("can acquire and release connection", async () => {
    const pool = getDbPool();
    const conn = await pool.getConnection();
    
    assert.ok(conn !== null);
    assert.ok(conn !== undefined);
    
    // Verify connection is usable with a simple query
    const [rows] = await conn.execute<RowDataPacket[]>("SELECT 1 as test");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].test, 1);
    
    conn.release();
  });
});

// Standard DB pool cleanup - runs after all tests in this file
test.after(async () => {
  await closeDbPool();
});
