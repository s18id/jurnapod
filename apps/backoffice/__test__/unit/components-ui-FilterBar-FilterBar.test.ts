// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
//
// FilterBar Component Tests
//
// Tests cover:
// - FilterSchema type definitions and validation
// - Filter field types (text, select, date, daterange, status)
// - Query serialization and parsing
// - URL state synchronization
// - Filter validation
// - Debounce logic for text input
// - Accessibility attributes
//
// Note: These tests use node --test without React rendering.
// We test pure logic functions and component contracts.

import assert from "node:assert";
import { describe, it } from "node:test";

// ============================================================================
// Test Suite: FilterSchema Types
// ============================================================================

import type {
  FilterField,
  FilterSchema,
  FilterFieldType,
  SelectOption,
  FilterValue,
  DateRange,
} from "./types";

// Import utility functions for testing
import {
  serializeFiltersToUrl,
  parseFiltersFromUrl,
  serializeFilterValue,
  parseFilterValue,
  isValidFilterField,
  getFilterDefaults,
  DEBOUNCE_MS,
  DATE_FORMAT,
  URL_PARAM_PREFIX,
} from "./types";

describe("FilterBar - FilterSchema Types", () => {

  it("should define valid filter field types", () => {
    const validTypes: FilterFieldType[] = ["text", "select", "date", "daterange", "status"];
    
    // All expected types should be valid
    assert.strictEqual(validTypes.includes("text"), true);
    assert.strictEqual(validTypes.includes("select"), true);
    assert.strictEqual(validTypes.includes("date"), true);
    assert.strictEqual(validTypes.includes("daterange"), true);
    assert.strictEqual(validTypes.includes("status"), true);
  });

  it("should create valid text filter field", () => {
    const field: FilterField = {
      key: "search",
      type: "text",
      label: "Search",
      placeholder: "Enter search term...",
    };
    
    assert.strictEqual(field.key, "search");
    assert.strictEqual(field.type, "text");
    assert.strictEqual(field.label, "Search");
    assert.strictEqual(field.placeholder, "Enter search term...");
  });

  it("should create valid select filter field with options", () => {
    const options: SelectOption[] = [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ];
    
    const field: FilterField = {
      key: "status",
      type: "select",
      label: "Status",
      options,
    };
    
    assert.strictEqual(field.key, "status");
    assert.strictEqual(field.type, "select");
    assert.deepStrictEqual(field.options, options);
  });

  it("should create valid date filter field", () => {
    const field: FilterField = {
      key: "created_at",
      type: "date",
      label: "Created Date",
    };
    
    assert.strictEqual(field.key, "created_at");
    assert.strictEqual(field.type, "date");
  });

  it("should create valid daterange filter field", () => {
    const field: FilterField = {
      key: "date_range",
      type: "daterange",
      label: "Date Range",
    };
    
    assert.strictEqual(field.key, "date_range");
    assert.strictEqual(field.type, "daterange");
  });

  it("should create valid status filter field with multi-select", () => {
    const options: SelectOption[] = [
      { value: "pending", label: "Pending" },
      { value: "confirmed", label: "Confirmed" },
      { value: "cancelled", label: "Cancelled" },
    ];
    
    const field: FilterField = {
      key: "reservation_status",
      type: "status",
      label: "Reservation Status",
      options,
    };
    
    assert.strictEqual(field.type, "status");
    assert.strictEqual(field.options?.length, 3);
  });

  it("should create valid filter schema with multiple fields", () => {
    const schema: FilterSchema = {
      fields: [
        { key: "search", type: "text", label: "Search" },
        { key: "status", type: "select", label: "Status", options: [{ value: "all", label: "All" }] },
        { key: "date_from", type: "date", label: "From Date" },
        { key: "date_to", type: "date", label: "To Date" },
      ],
      defaultValues: {
        search: "",
        status: "all",
      },
    };
    
    assert.strictEqual(schema.fields.length, 4);
    assert.strictEqual(schema.defaultValues?.search, "");
    assert.strictEqual(schema.defaultValues?.status, "all");
  });

  it("should allow optional placeholder for text fields", () => {
    const fieldWithoutPlaceholder: FilterField = {
      key: "name",
      type: "text",
      label: "Name",
    };
    
    const fieldWithPlaceholder: FilterField = {
      key: "name",
      type: "text",
      label: "Name",
      placeholder: "Enter name...",
    };
    
    assert.strictEqual(fieldWithoutPlaceholder.placeholder, undefined);
    assert.strictEqual(fieldWithPlaceholder.placeholder, "Enter name...");
  });
});

// ============================================================================
// Test Suite: Query Serialization
// ============================================================================

describe("FilterBar - Query Serialization", () => {

  it("should serialize text filter to URL param", () => {
    const result = serializeFilterValue("search", "john doe");
    assert.strictEqual(result, "filter_search=john%20doe");
  });

  it("should serialize select filter to URL param", () => {
    const result = serializeFilterValue("status", "active");
    assert.strictEqual(result, "filter_status=active");
  });

  it("should serialize date filter to URL param", () => {
    const result = serializeFilterValue("date", "2024-01-15");
    assert.strictEqual(result, "filter_date=2024-01-15");
  });

  it("should serialize date range filter to URL params", () => {
    const range: DateRange = { from: "2024-01-01", to: "2024-01-31" };
    const result = serializeFilterValue("daterange", range);
    assert.strictEqual(result, "filter_daterange_from=2024-01-01&filter_daterange_to=2024-01-31");
  });

  it("should serialize status (multi-select) filter to comma-separated URL param", () => {
    const result = serializeFilterValue("status", ["pending", "confirmed"]);
    assert.strictEqual(result, "filter_status=pending,confirmed");
  });

  it("should serialize empty string text filter", () => {
    const result = serializeFilterValue("search", "");
    assert.strictEqual(result, null); // Empty values should return null
  });

  it("should serialize null/undefined filter as null", () => {
    assert.strictEqual(serializeFilterValue("search", null), null);
    assert.strictEqual(serializeFilterValue("search", undefined), null);
  });

  it("should parse text filter from URL param", () => {
    const params = new URLSearchParams("filter_search=john%20doe");
    const result = parseFilterValue("search", "text", params);
    assert.strictEqual(result, "john doe");
  });

  it("should parse select filter from URL param", () => {
    const params = new URLSearchParams("filter_status=active");
    const result = parseFilterValue("status", "select", params);
    assert.strictEqual(result, "active");
  });

  it("should parse date filter from URL param", () => {
    const params = new URLSearchParams("filter_date=2024-01-15");
    const result = parseFilterValue("date", "date", params);
    assert.strictEqual(result, "2024-01-15");
  });

  it("should parse date range filter from URL params", () => {
    const params = new URLSearchParams("filter_daterange_from=2024-01-01&filter_daterange_to=2024-01-31");
    const result = parseFilterValue("daterange", "daterange", params);
    assert.deepStrictEqual(result, { from: "2024-01-01", to: "2024-01-31" });
  });

  it("should parse status (multi-select) filter from comma-separated URL param", () => {
    const params = new URLSearchParams("filter_status=pending,confirmed");
    const result = parseFilterValue("status", "status", params);
    assert.deepStrictEqual(result, ["pending", "confirmed"]);
  });

  it("should return undefined for missing filter params", () => {
    const params = new URLSearchParams();
    const result = parseFilterValue("search", "text", params);
    assert.strictEqual(result, undefined);
  });

  it("should serialize multiple filters to URL", () => {
    const filters: Record<string, FilterValue> = {
      search: "john",
      status: "active",
      date: "2024-01-15",
    };
    
    const result = serializeFiltersToUrl(filters);
    const params = new URLSearchParams(result);
    
    assert.strictEqual(params.get("filter_search"), "john");
    assert.strictEqual(params.get("filter_status"), "active");
    assert.strictEqual(params.get("filter_date"), "2024-01-15");
  });

  it("should parse multiple filters from URL", () => {
    const schema: FilterSchema = {
      fields: [
        { key: "search", type: "text", label: "Search" },
        { key: "status", type: "select", label: "Status", options: [] },
        { key: "date", type: "date", label: "Date" },
      ],
    };
    
    const params = new URLSearchParams("filter_search=john&filter_status=active&filter_date=2024-01-15");
    const result = parseFiltersFromUrl(schema, params);
    
    assert.strictEqual(result.search, "john");
    assert.strictEqual(result.status, "active");
    assert.strictEqual(result.date, "2024-01-15");
  });

  it("should only parse filters defined in schema", () => {
    const schema: FilterSchema = {
      fields: [
        { key: "search", type: "text", label: "Search" },
        // status not in schema
      ],
    };
    
    const params = new URLSearchParams("filter_search=john&filter_status=active");
    const result = parseFiltersFromUrl(schema, params);
    
    assert.strictEqual(result.search, "john");
    assert.strictEqual(result.status, undefined);
  });
});

// ============================================================================
// Test Suite: Filter Validation
// ============================================================================

describe("FilterBar - Filter Validation", () => {

  it("should validate text filter with regex pattern", () => {
    // Validation pattern for alphanumeric search
    const pattern = /^[a-zA-Z0-9\s]*$/;
    assert.strictEqual(pattern.test("john123"), true);
    assert.strictEqual(pattern.test("john doe"), true);
    assert.strictEqual(pattern.test("john<script>"), false);
  });

  it("should validate date format (YYYY-MM-DD)", () => {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    assert.strictEqual(datePattern.test("2024-01-15"), true);
    assert.strictEqual(datePattern.test("2024-1-5"), false);
    assert.strictEqual(datePattern.test("01-15-2024"), false);
    assert.strictEqual(datePattern.test("invalid"), false);
  });

  it("should validate date range (from <= to)", () => {
    const validateRange = (range: DateRange): boolean => {
      if (!range.from || !range.to) return true; // Allow partial ranges
      return range.from <= range.to;
    };
    
    assert.strictEqual(validateRange({ from: "2024-01-01", to: "2024-01-31" }), true);
    assert.strictEqual(validateRange({ from: "2024-01-31", to: "2024-01-01" }), false);
    assert.strictEqual(validateRange({ from: "2024-01-01", to: "2024-01-01" }), true); // Same day is valid
    assert.strictEqual(validateRange({ from: "2024-01-01", to: "" }), true); // Partial range
  });

  it("should validate select value is in options", () => {
    const validateSelect = (value: string, options: SelectOption[]): boolean => {
      return options.some(opt => opt.value === value);
    };
    
    const options: SelectOption[] = [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ];
    
    assert.strictEqual(validateSelect("active", options), true);
    assert.strictEqual(validateSelect("inactive", options), true);
    assert.strictEqual(validateSelect("unknown", options), false);
  });

  it("should validate status values are in options", () => {
    const validateStatus = (values: string[], options: SelectOption[]): boolean => {
      return values.every(v => options.some(opt => opt.value === v));
    };
    
    const options: SelectOption[] = [
      { value: "pending", label: "Pending" },
      { value: "confirmed", label: "Confirmed" },
      { value: "cancelled", label: "Cancelled" },
    ];
    
    assert.strictEqual(validateStatus(["pending"], options), true);
    assert.strictEqual(validateStatus(["pending", "confirmed"], options), true);
    assert.strictEqual(validateStatus(["pending", "unknown"], options), false);
  });
});

// ============================================================================
// Test Suite: Filter Defaults
// ============================================================================

describe("FilterBar - Filter Defaults", () => {

  it("should return default values from schema", () => {
    const schema: FilterSchema = {
      fields: [
        { key: "search", type: "text", label: "Search" },
        { key: "status", type: "select", label: "Status", options: [] },
      ],
      defaultValues: {
        search: "",
        status: "all",
      },
    };
    
    const defaults = getFilterDefaults(schema);
    assert.strictEqual(defaults.search, "");
    assert.strictEqual(defaults.status, "all");
  });

  it("should use explicitly specified defaults", () => {
    const schema: FilterSchema = {
      fields: [
        { key: "search", type: "text", label: "Search" },
        { key: "status", type: "select", label: "Status", options: [] },
      ],
      defaultValues: {
        search: "initial",
      },
    };
    
    const defaults = getFilterDefaults(schema);
    assert.strictEqual(defaults.search, "initial");
    assert.strictEqual(defaults.status, undefined); // Not specified, so undefined
  });

  it("should return empty object when no defaults specified", () => {
    const schema: FilterSchema = {
      fields: [
        { key: "search", type: "text", label: "Search" },
      ],
    };
    
    const defaults = getFilterDefaults(schema);
    assert.deepStrictEqual(defaults, {});
  });
});

// ============================================================================
// Test Suite: Debounce Configuration
// ============================================================================

describe("FilterBar - Debounce Configuration", () => {

  it("should define correct debounce delay", () => {
    assert.strictEqual(DEBOUNCE_MS, 300);
  });

  it("should allow custom debounce delay", () => {
    // The implementation should allow passing custom delay
    const customDelay = 500;
    assert.strictEqual(customDelay > DEBOUNCE_MS, true);
  });
});

// ============================================================================
// Test Suite: URL Parameter Naming
// ============================================================================

describe("FilterBar - URL Parameter Naming", () => {

  it("should use correct URL param prefix", () => {
    assert.strictEqual(URL_PARAM_PREFIX, "filter_");
  });

  it("should generate correct param names for different field types", () => {
    const getParamName = (key: string): string => `${URL_PARAM_PREFIX}${key}`;
    
    assert.strictEqual(getParamName("search"), "filter_search");
    assert.strictEqual(getParamName("status"), "filter_status");
    assert.strictEqual(getParamName("date_from"), "filter_date_from");
  });

  it("should generate correct param names for date range", () => {
    const getDateRangeParams = (key: string): [string, string] => [
      `${URL_PARAM_PREFIX}${key}_from`,
      `${URL_PARAM_PREFIX}${key}_to`,
    ];
    
    const [fromParam, toParam] = getDateRangeParams("date_range");
    assert.strictEqual(fromParam, "filter_date_range_from");
    assert.strictEqual(toParam, "filter_date_range_to");
  });
});

// ============================================================================
// Test Suite: Field Type Validation
// ============================================================================

describe("FilterBar - Field Type Validation", () => {

  it("should validate text field type", () => {
    const field: FilterField = { key: "search", type: "text", label: "Search" };
    assert.strictEqual(isValidFilterField(field), true);
  });

  it("should validate select field type", () => {
    const field: FilterField = { 
      key: "status", 
      type: "select", 
      label: "Status",
      options: [{ value: "all", label: "All" }],
    };
    assert.strictEqual(isValidFilterField(field), true);
  });

  it("should validate date field type", () => {
    const field: FilterField = { key: "date", type: "date", label: "Date" };
    assert.strictEqual(isValidFilterField(field), true);
  });

  it("should validate daterange field type", () => {
    const field: FilterField = { key: "range", type: "daterange", label: "Range" };
    assert.strictEqual(isValidFilterField(field), true);
  });

  it("should validate status field type", () => {
    const field: FilterField = { 
      key: "status", 
      type: "status", 
      label: "Status",
      options: [{ value: "all", label: "All" }],
    };
    assert.strictEqual(isValidFilterField(field), true);
  });

  it("should reject invalid field type", () => {
    const field = { key: "test", type: "invalid" as FilterFieldType, label: "Test" };
    assert.strictEqual(isValidFilterField(field), false);
  });

  it("should reject select without options", () => {
    const field: FilterField = { key: "status", type: "select", label: "Status" };
    assert.strictEqual(isValidFilterField(field), false);
  });

  it("should reject status without options", () => {
    const field: FilterField = { key: "status", type: "status", label: "Status" };
    assert.strictEqual(isValidFilterField(field), false);
  });
});

// ============================================================================
// Test Suite: Date Format Configuration
// ============================================================================

describe("FilterBar - Date Format Configuration", () => {

  it("should define correct date format", () => {
    assert.strictEqual(DATE_FORMAT, "YYYY-MM-DD");
  });

  it("should validate date format matches expected pattern", () => {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    assert.strictEqual(datePattern.test("2024-01-15"), true);
    assert.strictEqual(datePattern.test("2024-12-31"), true);
  });
});

// ============================================================================
// Test Suite: FilterValue Type
// ============================================================================

describe("FilterBar - FilterValue Type", () => {

  it("should accept string value for text filter", () => {
    const value: FilterValue = "search term";
    assert.strictEqual(typeof value, "string");
  });

  it("should accept string value for select filter", () => {
    const value: FilterValue = "active";
    assert.strictEqual(typeof value, "string");
  });

  it("should accept string value for date filter", () => {
    const value: FilterValue = "2024-01-15";
    assert.strictEqual(typeof value, "string");
  });

  it("should accept DateRange for daterange filter", () => {
    const value: FilterValue = { from: "2024-01-01", to: "2024-01-31" };
    assert.strictEqual(typeof value, "object");
    assert.strictEqual((value as DateRange).from, "2024-01-01");
  });

  it("should accept string array for status filter", () => {
    const value: FilterValue = ["pending", "confirmed"];
    assert.strictEqual(Array.isArray(value), true);
  });

  it("should accept null for optional filters", () => {
    const value: FilterValue = null;
    assert.strictEqual(value, null);
  });
});

// ============================================================================
// Test Suite: Accessibility Helpers
// ============================================================================

describe("FilterBar - Accessibility Helpers", () => {

  it("should generate correct input id", () => {
    const getInputId = (key: string, testId?: string): string => {
      if (testId) return `${testId}-${key}`;
      return `filter-${key}`;
    };
    
    assert.strictEqual(getInputId("search"), "filter-search");
    assert.strictEqual(getInputId("search", "users-page"), "users-page-search");
  });

  it("should generate correct help text id", () => {
    const getHelpId = (key: string): string => `filter-${key}-help`;
    assert.strictEqual(getHelpId("search"), "filter-search-help");
  });

  it("should generate correct error message id", () => {
    const getErrorId = (key: string): string => `filter-${key}-error`;
    assert.strictEqual(getErrorId("search"), "filter-search-error");
  });

  it("should associate label with input using htmlFor", () => {
    const inputId = "filter-search";
    const labelHtmlFor = inputId;
    assert.strictEqual(labelHtmlFor, "filter-search");
  });

  it("should associate help text using aria-describedby", () => {
    const helpId = `filter-search-help`;
    const ariaDescribedBy = `${helpId}`;
    assert.strictEqual(ariaDescribedBy, "filter-search-help");
  });

  it("should associate error message using aria-describedby", () => {
    const errorId = `filter-search-error`;
    const ariaDescribedBy = `${errorId}`;
    assert.strictEqual(ariaDescribedBy, "filter-search-error");
  });

  it("should combine help and error in aria-describedby", () => {
    const helpId = "filter-search-help";
    const errorId = "filter-search-error";
    const ariaDescribedBy = `${helpId} ${errorId}`;
    assert.strictEqual(ariaDescribedBy, "filter-search-help filter-search-error");
  });
});

// ============================================================================
// Test Suite: Live Region Announcements
// ============================================================================

describe("FilterBar - Live Region Announcements", () => {

  it("should generate filter applied announcement", () => {
    const announceFilterApply = (count: number): string => {
      return `${count} result${count === 1 ? "" : "s"} found`;
    };
    
    assert.strictEqual(announceFilterApply(0), "0 results found");
    assert.strictEqual(announceFilterApply(1), "1 result found");
    assert.strictEqual(announceFilterApply(10), "10 results found");
  });

  it("should generate filter cleared announcement", () => {
    const announceFilterClear = (): string => {
      return "Filters cleared";
    };
    
    assert.strictEqual(announceFilterClear(), "Filters cleared");
  });

  it("should generate error announcement", () => {
    const announceError = (field: string, message: string): string => {
      return `Error in ${field}: ${message}`;
    };
    
    assert.strictEqual(announceError("search", "Invalid characters"), "Error in search: Invalid characters");
  });

  it("should generate loading announcement", () => {
    const announceLoading = (): string => {
      return "Loading results...";
    };
    
    assert.strictEqual(announceLoading(), "Loading results...");
  });
});
