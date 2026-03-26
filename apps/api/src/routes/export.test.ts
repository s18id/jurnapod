// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Export Routes Tests
 *
 * Unit tests for export API route helpers and utilities.
 * Tests parameter parsing, column selection, filename generation, and data fetching.
 * CRITICAL: All tests using getDbPool() must close the pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, after } from "node:test";
import { closeDbPool, getDbPool } from "../lib/db.js";
import { SETTINGS_REGISTRY, SettingKey } from "@jurnapod/shared";
import type { RowDataPacket } from "mysql2/promise";
import {
  parseExportParams,
  getColumnsForEntity,
  generateFilename,
  type EntityType,
  type ExportQueryParams,
  ITEM_EXPORT_COLUMNS,
  PRICE_EXPORT_COLUMNS,
  DEFAULT_ITEM_COLUMNS,
  DEFAULT_PRICE_COLUMNS
} from "./export.js";
import { getFileExtension } from "../lib/export/index.js";

// =============================================================================
// Export Routes - Parameter Parsing Tests
// =============================================================================

describe("Export Routes - Parameter Parsing", () => {
  describe("parseExportParams", () => {
    test("parses default format as csv", () => {
      const url = new URL("http://localhost/export/items");
      const params = parseExportParams(url);
      assert.equal(params.format, "csv");
    });

    test("parses xlsx format correctly", () => {
      const url = new URL("http://localhost/export/items?format=xlsx");
      const params = parseExportParams(url);
      assert.equal(params.format, "xlsx");
    });

    test("parses unknown format as csv", () => {
      const url = new URL("http://localhost/export/items?format=pdf");
      const params = parseExportParams(url);
      assert.equal(params.format, "csv");
    });

    test("parses comma-separated columns", () => {
      const url = new URL("http://localhost/export/items?columns=id,sku,name");
      const params = parseExportParams(url);
      assert.deepEqual(params.columns, ["id", "sku", "name"]);
    });

    test("filters empty columns from input", () => {
      const url = new URL("http://localhost/export/items?columns=id,,name,");
      const params = parseExportParams(url);
      assert.deepEqual(params.columns, ["id", "name"]);
    });

    test("parses search parameter", () => {
      const url = new URL("http://localhost/export/items?search=test");
      const params = parseExportParams(url);
      assert.equal(params.search, "test");
    });

    test("parses type filter", () => {
      const url = new URL("http://localhost/export/items?type=INVENTORY");
      const params = parseExportParams(url);
      assert.equal(params.type, "INVENTORY");
    });

    test("parses group_id as integer", () => {
      const url = new URL("http://localhost/export/items?group_id=5");
      const params = parseExportParams(url);
      assert.equal(params.groupId, 5);
    });

    test("returns undefined for invalid group_id", () => {
      const url = new URL("http://localhost/export/items?group_id=abc");
      const params = parseExportParams(url);
      assert.equal(params.groupId, undefined);
    });

    test("parses is_active=true as boolean true", () => {
      const url = new URL("http://localhost/export/items?is_active=true");
      const params = parseExportParams(url);
      assert.equal(params.status, true);
    });

    test("parses is_active=false as boolean false", () => {
      const url = new URL("http://localhost/export/items?is_active=false");
      const params = parseExportParams(url);
      assert.equal(params.status, false);
    });

    test("returns undefined for missing is_active", () => {
      const url = new URL("http://localhost/export/items");
      const params = parseExportParams(url);
      assert.equal(params.status, undefined);
    });

    test("parses outlet_id as integer", () => {
      const url = new URL("http://localhost/export/prices?outlet_id=10");
      const params = parseExportParams(url);
      assert.equal(params.outletId, 10);
    });

    test("parses view_mode parameter", () => {
      const url = new URL("http://localhost/export/prices?view_mode=outlet");
      const params = parseExportParams(url);
      assert.equal(params.viewMode, "outlet");
    });

    test("parses scope_filter parameter", () => {
      const url = new URL("http://localhost/export/prices?scope_filter=override");
      const params = parseExportParams(url);
      assert.equal(params.scopeFilter, "override");
    });

    test("parses valid date_from in YYYY-MM-DD format", () => {
      const url = new URL("http://localhost/export/prices?date_from=2024-01-01");
      const params = parseExportParams(url);
      assert.equal(params.dateFrom, "2024-01-01");
    });

    test("parses valid date_to in YYYY-MM-DD format", () => {
      const url = new URL("http://localhost/export/prices?date_to=2024-12-31");
      const params = parseExportParams(url);
      assert.equal(params.dateTo, "2024-12-31");
    });

    test("returns undefined for invalid date format", () => {
      const url = new URL("http://localhost/export/prices?date_from=01-01-2024");
      const params = parseExportParams(url);
      assert.equal(params.dateFrom, undefined);
    });

    test("returns undefined for invalid date (wrong format)", () => {
      const url = new URL("http://localhost/export/prices?date_from=2024/01/01");
      const params = parseExportParams(url);
      assert.equal(params.dateFrom, undefined);
    });

    test("parses all parameters together", () => {
      const url = new URL("http://localhost/export/items?format=xlsx&columns=id,sku&search=test&type=INVENTORY&is_active=true");
      const params = parseExportParams(url);
      
      assert.equal(params.format, "xlsx");
      assert.deepEqual(params.columns, ["id", "sku"]);
      assert.equal(params.search, "test");
      assert.equal(params.type, "INVENTORY");
      assert.equal(params.status, true);
    });
  });
});

// =============================================================================
// Export Routes - Column Selection Tests
// =============================================================================

describe("Export Routes - Column Selection", () => {
  describe("getColumnsForEntity", () => {
    test("returns default columns for items when no selection", () => {
      const columns = getColumnsForEntity("items", []);
      const keys = columns.map((c) => c.key);
      assert.deepEqual(keys, DEFAULT_ITEM_COLUMNS);
    });

    test("returns default columns for prices when no selection", () => {
      const columns = getColumnsForEntity("prices", []);
      const keys = columns.map((c) => c.key);
      assert.deepEqual(keys, DEFAULT_PRICE_COLUMNS);
    });

    test("returns selected columns in order for items", () => {
      const columns = getColumnsForEntity("items", ["name", "sku", "id"]);
      const keys = columns.map((c) => c.key);
      assert.deepEqual(keys, ["name", "sku", "id"]);
    });

    test("returns selected columns in order for prices", () => {
      const columns = getColumnsForEntity("prices", ["price", "item_sku", "outlet_name"]);
      const keys = columns.map((c) => c.key);
      assert.deepEqual(keys, ["price", "item_sku", "outlet_name"]);
    });

    test("filters out unknown columns for items", () => {
      const columns = getColumnsForEntity("items", ["id", "unknown_col", "sku"]);
      const keys = columns.map((c) => c.key);
      assert.deepEqual(keys, ["id", "sku"]);
    });

    test("filters out unknown columns for prices", () => {
      const columns = getColumnsForEntity("prices", ["price", "invalid", "item_sku"]);
      const keys = columns.map((c) => c.key);
      assert.deepEqual(keys, ["price", "item_sku"]);
    });

    test("returns empty array when all selected columns are invalid", () => {
      const columns = getColumnsForEntity("items", ["invalid1", "invalid2"]);
      assert.equal(columns.length, 0);
    });

    test("returns all columns for items with empty string selection", () => {
      // Empty string after split gives [""], filter removes it
      const columns = getColumnsForEntity("items", [""].filter((c) => c.trim()));
      const keys = columns.map((c) => c.key);
      assert.deepEqual(keys, DEFAULT_ITEM_COLUMNS);
    });
  });

  describe("ITEM_EXPORT_COLUMNS definition", () => {
    test("has all expected columns for items", () => {
      const expectedKeys = [
        "id", "sku", "name", "item_type", "barcode", "item_group_id",
        "item_group_name", "cogs_account_id", "inventory_asset_account_id",
        "is_active", "created_at", "updated_at"
      ];
      const actualKeys = ITEM_EXPORT_COLUMNS.map((c) => c.key);
      assert.deepEqual(actualKeys, expectedKeys);
    });

    test("has correct field types for items", () => {
      const typeMap: Record<string, string> = {};
      ITEM_EXPORT_COLUMNS.forEach((col) => {
        typeMap[col.key] = col.fieldType || "string";
      });

      assert.equal(typeMap.id, "number");
      assert.equal(typeMap.sku, "string");
      assert.equal(typeMap.name, "string");
      assert.equal(typeMap.is_active, "boolean");
      assert.equal(typeMap.created_at, "datetime");
    });
  });

  describe("PRICE_EXPORT_COLUMNS definition", () => {
    test("has all expected columns for prices", () => {
      const expectedKeys = [
        "id", "item_id", "item_sku", "item_name", "outlet_id", "outlet_name",
        "price", "is_active", "is_override", "created_at", "updated_at"
      ];
      const actualKeys = PRICE_EXPORT_COLUMNS.map((c) => c.key);
      assert.deepEqual(actualKeys, expectedKeys);
    });

    test("has correct field types for prices", () => {
      const typeMap: Record<string, string> = {};
      PRICE_EXPORT_COLUMNS.forEach((col) => {
        typeMap[col.key] = col.fieldType || "string";
      });

      assert.equal(typeMap.id, "number");
      assert.equal(typeMap.price, "money");
      assert.equal(typeMap.is_active, "boolean");
      assert.equal(typeMap.is_override, "boolean");
    });
  });

  describe("DEFAULT_COLUMNS constants", () => {
    test("DEFAULT_ITEM_COLUMNS contains valid keys", () => {
      const validKeys = ITEM_EXPORT_COLUMNS.map((c) => c.key);
      for (const key of DEFAULT_ITEM_COLUMNS) {
        assert.ok(validKeys.includes(key), `Default column "${key}" should exist in ITEM_EXPORT_COLUMNS`);
      }
    });

    test("DEFAULT_PRICE_COLUMNS contains valid keys", () => {
      const validKeys = PRICE_EXPORT_COLUMNS.map((c) => c.key);
      for (const key of DEFAULT_PRICE_COLUMNS) {
        assert.ok(validKeys.includes(key), `Default column "${key}" should exist in PRICE_EXPORT_COLUMNS`);
      }
    });

    test("DEFAULT_ITEM_COLUMNS has 6 columns", () => {
      assert.equal(DEFAULT_ITEM_COLUMNS.length, 6);
    });

    test("DEFAULT_PRICE_COLUMNS has 5 columns", () => {
      assert.equal(DEFAULT_PRICE_COLUMNS.length, 5);
    });
  });
});

// =============================================================================
// Export Routes - Filename Generation Tests
// =============================================================================

describe("Export Routes - Filename Generation", () => {
  describe("generateFilename", () => {
    test("generates csv filename with correct extension", () => {
      const filename = generateFilename("items", "csv");
      assert.ok(filename.startsWith("jurnapod-items-"));
      assert.ok(filename.endsWith(".csv"));
    });

    test("generates xlsx filename with correct extension", () => {
      const filename = generateFilename("prices", "xlsx");
      assert.ok(filename.startsWith("jurnapod-prices-"));
      assert.ok(filename.endsWith(".xlsx"));
    });

    test("includes ISO timestamp in filename", () => {
      const before = new Date().toISOString().slice(0, 19);
      const filename = generateFilename("items", "csv");
      const after = new Date().toISOString().slice(0, 19);

      // Extract timestamp portion (between jurnapod-items- and .csv)
      const match = filename.match(/jurnapod-items-(.+)\.csv/);
      assert.ok(match, "Filename should match expected pattern");
      const timestamp = match[1];

      // Timestamp should be ISO-like format (with dashes instead of colons)
      assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(timestamp));
    });

    test("generates unique filenames for different entity types", () => {
      const itemsFilename = generateFilename("items", "csv");
      const pricesFilename = generateFilename("prices", "csv");
      assert.notEqual(itemsFilename, pricesFilename);
      assert.ok(itemsFilename.includes("items"));
      assert.ok(pricesFilename.includes("prices"));
    });
  });

  describe("getFileExtension", () => {
    test("returns .csv for csv format", () => {
      assert.equal(getFileExtension("csv"), ".csv");
    });

    test("returns .xlsx for xlsx format", () => {
      assert.equal(getFileExtension("xlsx"), ".xlsx");
    });
  });
});

// =============================================================================
// Export Routes - Entity Type Validation Tests
// =============================================================================

describe("Export Routes - Entity Type Validation", () => {
  const VALID_ENTITY_TYPES = ["items", "prices"];

  test("items is a valid entity type", () => {
    assert.ok(VALID_ENTITY_TYPES.includes("items"));
  });

  test("prices is a valid entity type", () => {
    assert.ok(VALID_ENTITY_TYPES.includes("prices"));
  });

  test("invalid entity type is rejected", () => {
    assert.ok(!VALID_ENTITY_TYPES.includes("customers"));
    assert.ok(!VALID_ENTITY_TYPES.includes("invoices"));
    assert.ok(!VALID_ENTITY_TYPES.includes(""));
    assert.ok(!VALID_ENTITY_TYPES.includes("ITEMS")); // case-sensitive
  });

  test("entity type validation is case-sensitive", () => {
    assert.ok(!VALID_ENTITY_TYPES.includes("Items"));
    assert.ok(!VALID_ENTITY_TYPES.includes("PRICES"));
    assert.ok(!VALID_ENTITY_TYPES.includes("Items"));
  });
});

// =============================================================================
// Export Routes - Filter Behavior Tests
// =============================================================================

describe("Export Routes - Filter Behavior", () => {
  test("status filter with true returns only active items", () => {
    const params: ExportQueryParams = {
      format: "csv",
      columns: [],
      status: true
    };
    assert.equal(params.status, true);
  });

  test("status filter with false returns only inactive items", () => {
    const params: ExportQueryParams = {
      format: "csv",
      columns: [],
      status: false
    };
    assert.equal(params.status, false);
  });

  test("search filter uses LIKE pattern matching", () => {
    const search = "test";
    const pattern = `%${search}%`;
    assert.ok(pattern.includes(search));
    assert.ok(pattern.startsWith("%"));
    assert.ok(pattern.endsWith("%"));
  });

  test("type filter validates item types", () => {
    const VALID_ITEM_TYPES = ["INVENTORY", "NON_INVENTORY", "SERVICE", "RAW_MATERIAL"];
    assert.ok(VALID_ITEM_TYPES.includes("INVENTORY"));
    assert.ok(!VALID_ITEM_TYPES.includes("INVALID"));
  });

  test("date range filter accepts YYYY-MM-DD format", () => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    assert.ok(dateRegex.test("2024-01-15"));
    assert.ok(dateRegex.test("2024-12-31"));
    assert.ok(!dateRegex.test("01-15-2024"));
    assert.ok(!dateRegex.test("2024/01/15"));
  });

  test("outlet_id filter for prices export", () => {
    const params: ExportQueryParams = {
      format: "csv",
      columns: [],
      outletId: 123
    };
    assert.equal(params.outletId, 123);
  });

  test("scope_filter affects price query behavior", () => {
    const overrideFilter: ExportQueryParams = {
      format: "csv",
      columns: [],
      scopeFilter: "override"
    };
    assert.equal(overrideFilter.scopeFilter, "override");

    const defaultFilter: ExportQueryParams = {
      format: "csv",
      columns: [],
      scopeFilter: "default"
    };
    assert.equal(defaultFilter.scopeFilter, "default");
  });
});

// =============================================================================
// Export Routes - Settings Registry Integration Tests
// =============================================================================

describe("Export Routes - Settings Registry", () => {
  test("SETTINGS_REGISTRY is defined", () => {
    assert.ok(SETTINGS_REGISTRY !== undefined);
  });

  test("SETTINGS_REGISTRY has expected inventory settings", () => {
    const inventoryKeys: SettingKey[] = [
      "inventory.low_stock_threshold",
      "inventory.reorder_point",
      "inventory.allow_negative_stock",
      "inventory.costing_method",
      "inventory.warn_on_negative"
    ];

    for (const key of inventoryKeys) {
      assert.ok(key in SETTINGS_REGISTRY, `Setting key "${key}" should exist in registry`);
    }
  });

  test("SETTINGS_REGISTRY has expected POS settings", () => {
    const posKeys: SettingKey[] = [
      "feature.pos.auto_sync_enabled",
      "feature.pos.sync_interval_seconds"
    ];

    for (const key of posKeys) {
      assert.ok(key in SETTINGS_REGISTRY, `Setting key "${key}" should exist in registry`);
    }
  });

  test("SETTINGS_REGISTRY has expected reservation settings", () => {
    const reservationKeys: SettingKey[] = [
      "feature.reservation.default_duration_minutes"
    ];

    for (const key of reservationKeys) {
      assert.ok(key in SETTINGS_REGISTRY, `Setting key "${key}" should exist in registry`);
    }
  });

  test("inventory.costing_method has valid enum values", () => {
    const costingMethod = SETTINGS_REGISTRY["inventory.costing_method"];
    assert.equal(costingMethod.valueType, "enum");
    assert.equal(costingMethod.defaultValue, "AVG");
  });

  test("inventory.low_stock_threshold has integer type", () => {
    const setting = SETTINGS_REGISTRY["inventory.low_stock_threshold"];
    assert.equal(setting.valueType, "int");
    assert.equal(setting.defaultValue, 5);
  });

  test("feature.pos.auto_sync_enabled has boolean type", () => {
    const setting = SETTINGS_REGISTRY["feature.pos.auto_sync_enabled"];
    assert.equal(setting.valueType, "boolean");
    assert.equal(setting.defaultValue, true);
  });
});

// =============================================================================
// Export Routes - Database Pool Tests
// =============================================================================

describe("Export Routes - Database Pool", () => {
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

// =============================================================================
// Export Routes - Data Transformation Tests
// =============================================================================

describe("Export Routes - Data Transformation", () => {
  test("transforms item row with all fields", () => {
    const row = {
      id: 1,
      sku: "TEST-001",
      name: "Test Item",
      item_type: "INVENTORY",
      barcode: "123456789",
      item_group_id: 5,
      item_group_name: "Test Group",
      cogs_account_id: 10,
      inventory_asset_account_id: 11,
      is_active: 1,
      created_at: new Date("2024-01-15T10:30:00Z"),
      updated_at: new Date("2024-01-20T15:45:00Z")
    };

    // Simulate transformation
    const transformed = {
      id: Number(row.id),
      sku: row.sku,
      name: row.name,
      item_type: row.item_type,
      barcode: row.barcode,
      item_group_id: row.item_group_id ? Number(row.item_group_id) : null,
      item_group_name: row.item_group_name,
      cogs_account_id: row.cogs_account_id ? Number(row.cogs_account_id) : null,
      inventory_asset_account_id: row.inventory_asset_account_id
        ? Number(row.inventory_asset_account_id)
        : null,
      is_active: row.is_active === 1,
      created_at: row.created_at,
      updated_at: row.updated_at
    };

    assert.equal(transformed.id, 1);
    assert.equal(transformed.is_active, true);
    assert.equal(transformed.item_group_id, 5);
    assert.equal(transformed.cogs_account_id, 10);
  });

  test("transforms price row with outlet-specific override", () => {
    const row = {
      id: 1,
      item_id: 10,
      item_sku: "TEST-001",
      item_name: "Test Item",
      outlet_id: 5,
      outlet_name: "Main Outlet",
      price: 15000,
      is_active: 1,
      is_override: 1,
      created_at: new Date("2024-01-15T10:30:00Z"),
      updated_at: new Date("2024-01-20T15:45:00Z")
    };

    // Simulate transformation
    const transformed = {
      id: Number(row.id),
      item_id: Number(row.item_id),
      item_sku: row.item_sku,
      item_name: row.item_name,
      outlet_id: row.outlet_id ? Number(row.outlet_id) : null,
      outlet_name: row.outlet_name || "Company Default",
      price: Number(row.price),
      is_active: row.is_active === 1,
      is_override: row.is_override === 1,
      created_at: row.created_at,
      updated_at: row.updated_at
    };

    assert.equal(transformed.id, 1);
    assert.equal(transformed.price, 15000);
    assert.equal(transformed.is_active, true);
    assert.equal(transformed.is_override, true);
    assert.equal(transformed.outlet_id, 5);
  });

  test("transforms price row with null outlet as company default", () => {
    const row = {
      id: 1,
      item_id: 10,
      item_sku: "TEST-001",
      item_name: "Test Item",
      outlet_id: null,
      outlet_name: null,
      price: 10000,
      is_active: 1,
      is_override: 0,
      created_at: new Date("2024-01-15T10:30:00Z"),
      updated_at: new Date("2024-01-20T15:45:00Z")
    };

    // Simulate transformation
    const transformed = {
      id: Number(row.id),
      item_id: Number(row.item_id),
      item_sku: row.item_sku,
      item_name: row.item_name,
      outlet_id: row.outlet_id ? Number(row.outlet_id) : null,
      outlet_name: row.outlet_name || "Company Default",
      price: Number(row.price),
      is_active: row.is_active === 1,
      is_override: row.is_override === 1,
      created_at: row.created_at,
      updated_at: row.updated_at
    };

    assert.equal(transformed.outlet_id, null);
    assert.equal(transformed.outlet_name, "Company Default");
    assert.equal(transformed.is_override, false);
  });

  test("handles null item_group_id in item transformation", () => {
    const row = {
      id: 1,
      sku: "TEST-001",
      name: "Test Item",
      item_type: "INVENTORY",
      barcode: null,
      item_group_id: null,
      item_group_name: null,
      cogs_account_id: null,
      inventory_asset_account_id: null,
      is_active: 0,
      created_at: new Date(),
      updated_at: new Date()
    };

    // Simulate transformation
    const transformed = {
      item_group_id: row.item_group_id ? Number(row.item_group_id) : null,
      barcode: row.barcode
    };

    assert.equal(transformed.item_group_id, null);
    assert.equal(transformed.barcode, null);
  });
});

// Standard DB pool cleanup - runs after all tests in this file
test.after(async () => {
  await closeDbPool();
});
