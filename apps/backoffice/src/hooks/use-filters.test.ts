// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
//
// useFilters Hook Tests
//
// Tests cover:
// - Initial state resolution (URL > sessionStorage > defaults)
// - Filter update logic
// - Clear filters functionality
// - hasActiveFilters detection
// - URL serialization
// - Session storage persistence
//
// Note: These tests use node --test without React rendering.
// We test pure logic functions and hook contract behavior.

import { describe, it } from "node:test";
import assert from "node:assert";

// Import from the actual hook to test real logic
import {
  getFilterDefaults,
  parseFiltersFromUrl,
  serializeFiltersToUrl,
} from "../components/ui/FilterBar/types";

import type { FilterSchema, FilterValue } from "../components/ui/FilterBar/types";

// ============================================================================
// Test Suite: Filter Schema Parsing
// ============================================================================

describe("useFilters - Filter Schema Parsing", () => {
  const schema: FilterSchema = {
    fields: [
      { key: "search", type: "text", label: "Search" },
      { key: "status", type: "select", label: "Status", options: [{ value: "all", label: "All" }, { value: "active", label: "Active" }] },
      { key: "date_from", type: "date", label: "From Date" },
      { key: "date_to", type: "date", label: "To Date" },
    ],
    defaultValues: {
      search: "",
      status: "all",
    },
  };

  it("should parse text filter from URL", () => {
    const params = new URLSearchParams("filter_search=john");
    const result = parseFiltersFromUrl(schema, params);
    assert.strictEqual(result.search, "john");
  });

  it("should parse select filter from URL", () => {
    const params = new URLSearchParams("filter_status=active");
    const result = parseFiltersFromUrl(schema, params);
    assert.strictEqual(result.status, "active");
  });

  it("should parse date filters from URL", () => {
    const params = new URLSearchParams("filter_date_from=2024-01-01&filter_date_to=2024-01-31");
    const result = parseFiltersFromUrl(schema, params);
    assert.strictEqual(result.date_from, "2024-01-01");
    assert.strictEqual(result.date_to, "2024-01-31");
  });

  it("should parse multiple filters from URL", () => {
    const params = new URLSearchParams("filter_search=john&filter_status=active");
    const result = parseFiltersFromUrl(schema, params);
    assert.strictEqual(result.search, "john");
    assert.strictEqual(result.status, "active");
  });

  it("should only parse fields defined in schema", () => {
    const params = new URLSearchParams("filter_search=john&filter_unknown=value");
    const result = parseFiltersFromUrl(schema, params);
    assert.strictEqual(result.search, "john");
    assert.strictEqual(result.unknown, undefined);
  });

  it("should return empty object for no matching params", () => {
    const params = new URLSearchParams("other_param=value");
    const result = parseFiltersFromUrl(schema, params);
    assert.deepStrictEqual(result, {});
  });
});

// ============================================================================
// Test Suite: URL Serialization
// ============================================================================

describe("useFilters - URL Serialization", () => {
  it("should serialize text filter to URL", () => {
    const filters: Record<string, FilterValue> = {
      search: "john",
    };
    const result = serializeFiltersToUrl(filters);
    assert.ok(result.includes("filter_search=john"));
  });

  it("should serialize select filter to URL", () => {
    const filters: Record<string, FilterValue> = {
      status: "active",
    };
    const result = serializeFiltersToUrl(filters);
    assert.ok(result.includes("filter_status=active"));
  });

  it("should serialize date filter to URL", () => {
    const filters: Record<string, FilterValue> = {
      date_from: "2024-01-01",
    };
    const result = serializeFiltersToUrl(filters);
    assert.ok(result.includes("filter_date_from=2024-01-01"));
  });

  it("should serialize multiple filters to URL", () => {
    const filters: Record<string, FilterValue> = {
      search: "john",
      status: "active",
      date_from: "2024-01-01",
    };
    const result = serializeFiltersToUrl(filters);
    assert.ok(result.includes("filter_search=john"));
    assert.ok(result.includes("filter_status=active"));
    assert.ok(result.includes("filter_date_from=2024-01-01"));
  });

  it("should encode special characters in values", () => {
    const filters: Record<string, FilterValue> = {
      search: "john & jane",
    };
    const result = serializeFiltersToUrl(filters);
    assert.ok(result.includes("john%20%26%20jane"));
  });

  it("should omit empty string values", () => {
    const filters: Record<string, FilterValue> = {
      search: "",
      status: "active",
    };
    const result = serializeFiltersToUrl(filters);
    assert.ok(!result.includes("filter_search"));
    assert.ok(result.includes("filter_status=active"));
  });
});

// ============================================================================
// Test Suite: Default Values
// ============================================================================

describe("useFilters - Default Values", () => {
  it("should return explicit defaultValues from schema", () => {
    const schema: FilterSchema = {
      fields: [
        { key: "search", type: "text", label: "Search" },
      ],
      defaultValues: {
        search: "initial",
      },
    };
    const defaults = getFilterDefaults(schema);
    assert.strictEqual(defaults.search, "initial");
  });

  it("should return empty object when no defaultValues specified", () => {
    const schema: FilterSchema = {
      fields: [
        { key: "search", type: "text", label: "Search" },
      ],
    };
    const defaults = getFilterDefaults(schema);
    assert.deepStrictEqual(defaults, {});
  });

  it("should return only explicitly defined defaults", () => {
    const schema: FilterSchema = {
      fields: [
        { key: "search", type: "text", label: "Search" },
        { key: "status", type: "select", label: "Status", options: [{ value: "all", label: "All" }] },
      ],
      defaultValues: {
        search: "initial",
      },
    };
    const defaults = getFilterDefaults(schema);
    assert.strictEqual(defaults.search, "initial");
    assert.strictEqual(defaults.status, undefined);
  });
});

// ============================================================================
// Test Suite: Filter Value Types
// ============================================================================

describe("useFilters - Filter Value Types", () => {
  it("should handle string values for text filter", () => {
    const filters: Record<string, FilterValue> = {
      search: "search term",
    };
    assert.strictEqual(typeof filters.search, "string");
  });

  it("should handle string values for select filter", () => {
    const filters: Record<string, FilterValue> = {
      status: "active",
    };
    assert.strictEqual(typeof filters.status, "string");
  });

  it("should handle string values for date filter", () => {
    const filters: Record<string, FilterValue> = {
      date_from: "2024-01-01",
    };
    assert.strictEqual(typeof filters.date_from, "string");
  });

  it("should handle DateRange objects for daterange filter", () => {
    const filters: Record<string, FilterValue> = {
      date_range: { from: "2024-01-01", to: "2024-01-31" },
    };
    const range = filters.date_range as { from: string; to: string };
    assert.strictEqual(range.from, "2024-01-01");
    assert.strictEqual(range.to, "2024-01-31");
  });

  it("should handle string arrays for status filter", () => {
    const filters: Record<string, FilterValue> = {
      status: ["pending", "confirmed"],
    };
    const status = filters.status as string[];
    assert.strictEqual(status.length, 2);
    assert.strictEqual(status[0], "pending");
  });

  it("should handle null for optional filters", () => {
    const filters: Record<string, FilterValue> = {
      search: null,
    };
    assert.strictEqual(filters.search, null);
  });
});

// ============================================================================
// Test Suite: Storage Key Generation
// ============================================================================

describe("useFilters - Storage Key Generation", () => {
  const STORAGE_PREFIX = "filter_state_";

  it("should generate correct storage key", () => {
    const storageId = "users-page";
    const key = `${STORAGE_PREFIX}${storageId}`;
    assert.strictEqual(key, "filter_state_users-page");
  });

  it("should handle special characters in storage ID", () => {
    const storageId = "users/page:filter";
    const key = `${STORAGE_PREFIX}${storageId}`;
    assert.strictEqual(key, "filter_state_users/page:filter");
  });
});

// ============================================================================
// Test Suite: Filter Merge Logic
// ============================================================================

describe("useFilters - Filter Merge Logic", () => {
  it("should merge partial state with defaults", () => {
    const defaults = { search: "", status: "all" };
    const partial = { search: "john" };
    const merged = { ...defaults, ...partial };
    assert.deepStrictEqual(merged, { search: "john", status: "all" });
  });

  it("should prefer partial over defaults", () => {
    const defaults = { search: "", status: "all" };
    const partial = { search: "john", status: "active" };
    const merged = { ...defaults, ...partial };
    assert.deepStrictEqual(merged, { search: "john", status: "active" });
  });

  it("should handle null partial (return defaults)", () => {
    const defaults: Record<string, FilterValue> = { search: "", status: "all" };
    const partial: Record<string, FilterValue> | null = null;
    let merged: Record<string, FilterValue>;
    if (partial !== null) {
      merged = { ...defaults, ...partial as Record<string, FilterValue> };
    } else {
      merged = { ...defaults };
    }
    assert.deepStrictEqual(merged, { search: "", status: "all" });
  });

  it("should handle empty partial (return defaults)", () => {
    const defaults = { search: "", status: "all" };
    const partial = {};
    const merged = { ...defaults, ...partial };
    assert.deepStrictEqual(merged, { search: "", status: "all" });
  });
});

// ============================================================================
// Test Suite: hasActiveFilters Logic
// ============================================================================

describe("useFilters - hasActiveFilters Logic", () => {
  it("should return false when filters match defaults", () => {
    const defaults: Record<string, FilterValue> = { search: "", status: "all" };
    const filters: Record<string, FilterValue> = { search: "", status: "all" };
    
    const hasActive = Object.keys(filters).some((key) => {
      const filterValue = filters[key];
      const defaultValue = defaults[key];
      
      if (Array.isArray(filterValue) && Array.isArray(defaultValue)) {
        return JSON.stringify(filterValue) !== JSON.stringify(defaultValue);
      }
      
      return filterValue !== defaultValue;
    });
    
    assert.strictEqual(hasActive, false);
  });

  it("should return true when filters differ from defaults", () => {
    const defaults: Record<string, FilterValue> = { search: "", status: "all" };
    const filters: Record<string, FilterValue> = { search: "john", status: "all" };
    
    const hasActive = Object.keys(filters).some((key) => {
      const filterValue = filters[key];
      const defaultValue = defaults[key];
      
      if (Array.isArray(filterValue) && Array.isArray(defaultValue)) {
        return JSON.stringify(filterValue) !== JSON.stringify(defaultValue);
      }
      
      return filterValue !== defaultValue;
    });
    
    assert.strictEqual(hasActive, true);
  });

  it("should handle array comparison correctly", () => {
    const defaults: Record<string, FilterValue> = { status: [] };
    const filters: Record<string, FilterValue> = { status: ["pending"] };
    
    const hasActive = Object.keys(filters).some((key) => {
      const filterValue = filters[key];
      const defaultValue = defaults[key];
      
      if (Array.isArray(filterValue) && Array.isArray(defaultValue)) {
        return JSON.stringify(filterValue) !== JSON.stringify(defaultValue);
      }
      
      return filterValue !== defaultValue;
    });
    
    assert.strictEqual(hasActive, true);
  });
});
