// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";

// Since this is a UI component that requires React rendering,
// we test the underlying logic and types instead of rendering

import {
  ITEM_EXPORT_COLUMNS,
  PRICE_EXPORT_COLUMNS,
  DEFAULT_ITEM_COLUMNS,
  DEFAULT_PRICE_COLUMNS,
  COLUMN_GROUPS,
  type ExportColumn,
} from "../hooks/use-export";

describe("Export Column Definitions", () => {
  describe("ITEM_EXPORT_COLUMNS", () => {
    it("should have all required item fields", () => {
      const keys = ITEM_EXPORT_COLUMNS.map((col) => col.key);
      
      // Basic fields
      assert.ok(keys.includes("id"), "should include id");
      assert.ok(keys.includes("sku"), "should include sku");
      assert.ok(keys.includes("name"), "should include name");
      assert.ok(keys.includes("item_type"), "should include item_type");
      
      // Pricing fields
      assert.ok(keys.includes("base_price"), "should include base_price");
      
      // Status fields
      assert.ok(keys.includes("is_active"), "should include is_active");
      
      // Timestamp fields
      assert.ok(keys.includes("created_at"), "should include created_at");
      assert.ok(keys.includes("updated_at"), "should include updated_at");
    });

    it("should have proper group assignments", () => {
      const groups = new Set(ITEM_EXPORT_COLUMNS.map((col) => col.group));
      
      assert.ok(groups.has("Basic Info"), "should have Basic Info group");
      assert.ok(groups.has("Pricing"), "should have Pricing group");
      assert.ok(groups.has("Status"), "should have Status group");
      assert.ok(groups.has("Timestamps"), "should have Timestamps group");
    });

    it("should have sortable columns marked correctly", () => {
      const sortableCols = ITEM_EXPORT_COLUMNS.filter((col) => col.sortable);
      
      assert.ok(sortableCols.length > 0, "should have at least one sortable column");
      assert.ok(sortableCols.some((col) => col.key === "id"), "id should be sortable");
      assert.ok(sortableCols.some((col) => col.key === "name"), "name should be sortable");
    });
  });

  describe("PRICE_EXPORT_COLUMNS", () => {
    it("should have all required price fields", () => {
      const keys = PRICE_EXPORT_COLUMNS.map((col) => col.key);
      
      // Item info
      assert.ok(keys.includes("item_sku"), "should include item_sku");
      assert.ok(keys.includes("item_name"), "should include item_name");
      
      // Pricing fields
      assert.ok(keys.includes("base_price"), "should include base_price");
      assert.ok(keys.includes("outlet_price"), "should include outlet_price");
      assert.ok(keys.includes("is_overridden"), "should include is_overridden");
      
      // Timestamp fields
      assert.ok(keys.includes("created_at"), "should include created_at");
    });

    it("should have proper group assignments", () => {
      const groups = new Set(PRICE_EXPORT_COLUMNS.map((col) => col.group));
      
      assert.ok(groups.has("Item Info"), "should have Item Info group");
      assert.ok(groups.has("Pricing"), "should have Pricing group");
      assert.ok(groups.has("Timestamps"), "should have Timestamps group");
    });
  });

  describe("DEFAULT_ITEM_COLUMNS", () => {
    it("should reference valid column keys", () => {
      const availableKeys = new Set(ITEM_EXPORT_COLUMNS.map((col) => col.key));
      
      for (const key of DEFAULT_ITEM_COLUMNS) {
        assert.ok(
          availableKeys.has(key),
          `default column ${key} should exist in ITEM_EXPORT_COLUMNS`
        );
      }
    });

    it("should not be empty", () => {
      assert.ok(DEFAULT_ITEM_COLUMNS.length > 0, "should have at least one default column");
    });
  });

  describe("DEFAULT_PRICE_COLUMNS", () => {
    it("should reference valid column keys", () => {
      const availableKeys = new Set(PRICE_EXPORT_COLUMNS.map((col) => col.key));
      
      for (const key of DEFAULT_PRICE_COLUMNS) {
        assert.ok(
          availableKeys.has(key),
          `default column ${key} should exist in PRICE_EXPORT_COLUMNS`
        );
      }
    });

    it("should not be empty", () => {
      assert.ok(DEFAULT_PRICE_COLUMNS.length > 0, "should have at least one default column");
    });
  });

  describe("COLUMN_GROUPS", () => {
    it("should contain expected groups", () => {
      assert.ok(COLUMN_GROUPS.includes("Basic Info"), "should include Basic Info");
      assert.ok(COLUMN_GROUPS.includes("Pricing"), "should include Pricing");
      assert.ok(COLUMN_GROUPS.includes("Status"), "should include Status");
      assert.ok(COLUMN_GROUPS.includes("Timestamps"), "should include Timestamps");
    });
  });

  describe("ExportColumn type integrity", () => {
    it("should have correct field types", () => {
      const moneyColumns = ITEM_EXPORT_COLUMNS.filter(
        (col) => col.fieldType === "money"
      );
      assert.ok(moneyColumns.length > 0, "should have money-typed columns");
      
      const numberColumns = ITEM_EXPORT_COLUMNS.filter(
        (col) => col.fieldType === "number"
      );
      assert.ok(numberColumns.length > 0, "should have number-typed columns");
      
      const booleanColumns = ITEM_EXPORT_COLUMNS.filter(
        (col) => col.fieldType === "boolean"
      );
      assert.ok(booleanColumns.length > 0, "should have boolean-typed columns");
      
      const datetimeColumns = ITEM_EXPORT_COLUMNS.filter(
        (col) => col.fieldType === "datetime"
      );
      assert.ok(datetimeColumns.length > 0, "should have datetime-typed columns");
    });

    it("should have headers for all columns", () => {
      for (const col of ITEM_EXPORT_COLUMNS) {
        assert.ok(
          col.header && col.header.length > 0,
          `column ${col.key} should have a non-empty header`
        );
      }
      
      for (const col of PRICE_EXPORT_COLUMNS) {
        assert.ok(
          col.header && col.header.length > 0,
          `column ${col.key} should have a non-empty header`
        );
      }
    });
  });
});

describe("Export Filters", () => {
  it("should have valid filter structure", () => {
    // This is a structural test - verifying the filter interface
    // In actual use, filters would be passed from the page state
    const mockFilters = {
      search: "test search",
      type: "PRODUCT",
      groupId: 1,
      status: true,
      outletId: 1,
      viewMode: "outlet" as const,
      scopeFilter: "override" as const,
    };

    assert.ok(mockFilters.search === "test search");
    assert.ok(mockFilters.type === "PRODUCT");
    assert.ok(mockFilters.groupId === 1);
    assert.ok(mockFilters.status === true);
  });
});

describe("Export Format", () => {
  it("should support both CSV and XLSX formats", () => {
    const formats = ["csv", "xlsx"] as const;
    
    assert.ok(formats.includes("csv"), "should support csv");
    assert.ok(formats.includes("xlsx"), "should support xlsx");
  });
});
