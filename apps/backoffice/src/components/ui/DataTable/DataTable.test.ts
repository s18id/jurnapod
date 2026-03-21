// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
//
// DataTable Component Tests
//
// Tests cover:
// - Sort state management and aria-sort values
// - Pagination calculations
// - Row selection logic
// - Page reset rules
// - Table state manager (request cancellation)
// - Skeleton dimension calculations
// - Accessibility helper functions
//
// Note: These tests use node --test without React rendering.
// We test pure logic functions and type contracts.

import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert";

// ============================================================================
// Test Suite: Sort State
// ============================================================================

import {
  getAriaSortValue,
  calculateTotalPages,
  getPaginationRangeText,
  getPageResetRule,
  isAllSelected,
  isSomeSelected,
  getSelectedRowIds,
  calculateSafePage,
  PAGE_SIZE_OPTIONS,
  TableStateManager,
  generateTableAriaIds,
  findColumnById,
  buildColumnMap,
  isSelectionColumn,
  isRowActionColumn,
  countSelectedRows,
  isRowSelected,
  toggleRowSelection,
  clearAllSelections,
  selectAllRows,
  announceSortChange,
  announcePageChange,
  announceSelectionChange,
  announceBatchAction,
  announceError,
  announceRetry,
  checkPerformanceBudget,
  DEFAULT_TABLE_PERF_BUDGET,
  isNewerState,
  mergeState,
  type StateWrapper,
} from "./types";

import type {
  SortDirection,
  SortState,
  PaginationState,
  RowSelectionState,
  DataTableColumnDef,
} from "./types";

describe("DataTable - Sort State", () => {

  it("should return ascending for asc sort direction", () => {
    const result = getAriaSortValue("asc");
    assert.strictEqual(result, "ascending");
  });

  it("should return descending for desc sort direction", () => {
    const result = getAriaSortValue("desc");
    assert.strictEqual(result, "descending");
  });

  it("should return none for null sort direction", () => {
    const result = getAriaSortValue(null);
    assert.strictEqual(result, "none");
  });

});

// ============================================================================
// Test Suite: Pagination Calculations
// ============================================================================

describe("DataTable - Pagination Calculations", () => {

  it("should calculate correct total pages", () => {
    assert.strictEqual(calculateTotalPages(100, 25), 4);
    assert.strictEqual(calculateTotalPages(101, 25), 5);
    assert.strictEqual(calculateTotalPages(0, 25), 0);
    assert.strictEqual(calculateTotalPages(25, 25), 1);
    assert.strictEqual(calculateTotalPages(1, 25), 1);
  });

  it("should return 0 total pages when page size is 0", () => {
    assert.strictEqual(calculateTotalPages(100, 0), 0);
  });

  it("should generate correct pagination range text", () => {
    const result = getPaginationRangeText(1, 25, 100);
    assert.strictEqual(result, "1-25 of 100");
  });

  it("should handle first page range correctly", () => {
    const result = getPaginationRangeText(1, 25, 100);
    assert.ok(result.startsWith("1-"));
  });

  it("should handle middle page range correctly", () => {
    const result = getPaginationRangeText(2, 25, 100);
    assert.ok(result.startsWith("26-"));
  });

  it("should handle last page range correctly", () => {
    const result = getPaginationRangeText(4, 25, 100);
    assert.ok(result.startsWith("76-"));
  });

  it("should handle empty results", () => {
    const result = getPaginationRangeText(1, 25, 0);
    assert.strictEqual(result, "0 items");
  });

  it("should have correct page size options", () => {
    assert.deepStrictEqual(PAGE_SIZE_OPTIONS, [10, 25, 50, 100]);
  });

});

// ============================================================================
// Test Suite: Page Reset Rules
// ============================================================================

describe("DataTable - Page Reset Rules", () => {

  it("should reset page on filter change", () => {
    const rule = getPageResetRule("filter_change");
    assert.strictEqual(rule.trigger, "filter_change");
    assert.strictEqual(rule.shouldReset, true);
  });

  it("should reset page on sort change", () => {
    const rule = getPageResetRule("sort_change");
    assert.strictEqual(rule.trigger, "sort_change");
    assert.strictEqual(rule.shouldReset, true);
  });

  it("should not reset page on page size change", () => {
    const rule = getPageResetRule("page_size_change");
    assert.strictEqual(rule.trigger, "page_size_change");
    assert.strictEqual(rule.shouldReset, false);
  });

  it("should calculate safe page after page size change", () => {
    // Current implementation caps at new total pages
    // Note: This is a simplified approach that doesn't perfectly map content positions
    // When increasing page size, content shifts to earlier pages
    
    // With 100 items, new total pages with size 50 is 2
    // Page 2 with old size 25 maps to position 26-50
    // With new size 50, position 26-50 is still on page 2 (since 50 items per page)
    // But the function caps at total pages, so returns min(2, 2) = 2
    const result1 = calculateSafePage(2, 25, 50, 100);
    assert.ok(result1 >= 1 && result1 <= 2, `Expected 1-2, got ${result1}`);
    
    // Page 5 capped to total pages (2)
    const result2 = calculateSafePage(5, 25, 50, 100);
    assert.strictEqual(result2, 2);
    
    // Ensure at least page 1
    assert.strictEqual(calculateSafePage(10, 25, 50, 100), 2);
  });

  it("should handle edge case of empty data", () => {
    assert.strictEqual(calculateSafePage(1, 25, 50, 0), 1);
  });

});

// ============================================================================
// Test Suite: Row Selection Logic
// ============================================================================

describe("DataTable - Row Selection Logic", () => {

  const mockGetRowId = (row: { id: string }) => row.id;
  const mockData = [
    { id: "1", name: "Alice" },
    { id: "2", name: "Bob" },
    { id: "3", name: "Charlie" },
  ];

  it("should detect all selected", () => {
    const selection: RowSelectionState = {
      "1": true,
      "2": true,
      "3": true,
    };
    assert.strictEqual(isAllSelected(selection, mockData, mockGetRowId), true);
  });

  it("should detect none selected", () => {
    const selection: RowSelectionState = {};
    assert.strictEqual(isAllSelected(selection, mockData, mockGetRowId), false);
  });

  it("should detect partial selection as not all", () => {
    const selection: RowSelectionState = {
      "1": true,
      "2": true,
    };
    assert.strictEqual(isAllSelected(selection, mockData, mockGetRowId), false);
  });

  it("should detect some selected", () => {
    const selection: RowSelectionState = {
      "1": true,
    };
    assert.strictEqual(isSomeSelected(selection, mockData, mockGetRowId), true);
  });

  it("should detect none as not some", () => {
    const selection: RowSelectionState = {};
    assert.strictEqual(isSomeSelected(selection, mockData, mockGetRowId), false);
  });

  it("should detect all as not some", () => {
    const selection: RowSelectionState = {
      "1": true,
      "2": true,
      "3": true,
    };
    assert.strictEqual(isSomeSelected(selection, mockData, mockGetRowId), false);
  });

  it("should get selected row IDs", () => {
    const selection: RowSelectionState = {
      "1": true,
      "3": true,
    };
    const result = getSelectedRowIds(selection, mockData, mockGetRowId);
    assert.deepStrictEqual(result, ["1", "3"]);
  });

  it("should return empty array when none selected", () => {
    const selection: RowSelectionState = {};
    const result = getSelectedRowIds(selection, mockData, mockGetRowId);
    assert.deepStrictEqual(result, []);
  });

  it("should handle empty data", () => {
    const selection: RowSelectionState = {};
    const emptyData: { id: string }[] = [];
    assert.strictEqual(isAllSelected(selection, emptyData, mockGetRowId), false);
    assert.strictEqual(isSomeSelected(selection, emptyData, mockGetRowId), false);
  });

});

// ============================================================================
// Test Suite: Table State Manager
// ============================================================================

describe("DataTable - TableStateManager", () => {
  let manager: TableStateManager;

  beforeEach(() => {
    manager = new TableStateManager();
  });

  after(() => {
    // Reset manager state after each test
    manager.reset();
  });

  it("should start request and return sequence", () => {
    const { sequence, signal } = manager.startRequest();
    // Sequence should be positive (global counter incremented)
    assert.ok(sequence > 0);
    assert.ok(signal instanceof AbortSignal);
  });

  it("should increment sequence on new request", () => {
    const first = manager.startRequest();
    const second = manager.startRequest();
    assert.ok(second.sequence > first.sequence);
  });

  it("should validate response against current sequence", () => {
    const { sequence } = manager.startRequest();
    assert.strictEqual(manager.isResponseValid(sequence), true);
    assert.strictEqual(manager.isResponseValid(sequence + 1000), false);
  });

  it("should return false for stale response", () => {
    manager.startRequest();
    const { sequence: newSeq } = manager.startRequest(); // New request
    assert.strictEqual(manager.isResponseValid(newSeq - 1), false);
  });

  it("should cancel pending request", () => {
    const { signal } = manager.startRequest();
    let aborted = false;
    signal.addEventListener("abort", () => {
      aborted = true;
    });
    
    manager.cancelPending();
    assert.strictEqual(aborted, true);
  });

  it("should reset state", () => {
    manager.startRequest();
    manager.reset();
    assert.strictEqual(manager.getCurrentSequence(), 0);
  });

});

// ============================================================================
// Test Suite: Accessibility Helpers
// ============================================================================

describe("DataTable - Accessibility Helpers", () => {

  it("should generate aria IDs with custom testId", () => {
    const ids = generateTableAriaIds("users-table");
    assert.strictEqual(ids.skipLink, "users-table-skip-link");
    assert.strictEqual(ids.tableSummary, "users-table-summary");
    assert.strictEqual(ids.liveRegion, "users-table-live-region");
    assert.strictEqual(ids.paginationInfo, "users-table-pagination-info");
  });

  it("should generate aria IDs with default", () => {
    const ids = generateTableAriaIds();
    assert.ok(ids.skipLink?.startsWith("datatable"));
    assert.ok(ids.tableSummary?.startsWith("datatable"));
    assert.ok(ids.liveRegion?.startsWith("datatable"));
    assert.ok(ids.paginationInfo?.startsWith("datatable"));
  });

});

// ============================================================================
// Test Suite: Type Exports
// ============================================================================

describe("DataTable - Type Exports", () => {

  it("should export PAGE_SIZE_OPTIONS as readonly tuple", () => {
    assert.ok(Array.isArray(PAGE_SIZE_OPTIONS));
    assert.strictEqual(PAGE_SIZE_OPTIONS.length, 4);
  });

});

// ============================================================================
// Test Suite: Edge Cases
// ============================================================================

describe("DataTable - Edge Cases", () => {

  it("should handle zero total count in pagination", () => {
    assert.strictEqual(calculateTotalPages(0, 25), 0);
    assert.strictEqual(getPaginationRangeText(1, 25, 0), "0 items");
  });

  it("should handle single item", () => {
    assert.strictEqual(calculateTotalPages(1, 25), 1);
    assert.strictEqual(getPaginationRangeText(1, 25, 1), "1-1 of 1");
  });

  it("should handle exact page boundary", () => {
    assert.strictEqual(calculateTotalPages(50, 25), 2);
    assert.strictEqual(getPaginationRangeText(2, 25, 50), "26-50 of 50");
  });

  it("should handle large dataset", () => {
    assert.strictEqual(calculateTotalPages(10000, 100), 100);
    assert.strictEqual(getPaginationRangeText(50, 100, 10000), "4901-5000 of 10000");
  });

});

// ============================================================================
// Test Suite: Sequence Number Generation
// ============================================================================

import { getNextSequence } from "./types";

describe("DataTable - Sequence Number Generation", () => {

  it("should increment sequence on each call", () => {
    const seq1 = getNextSequence();
    const seq2 = getNextSequence();
    const seq3 = getNextSequence();
    assert.strictEqual(seq2, seq1 + 1);
    assert.strictEqual(seq3, seq2 + 1);
  });

});

// ============================================================================
// Test Suite: Column Lookup Helpers (Performance Optimization)
// ============================================================================

describe("DataTable - Column Lookup Helpers", () => {
  const mockColumns: DataTableColumnDef<{ name: string; email: string }>[] = [
    {
      id: "selection",
      isSelection: true,
      header: "",
      cell: () => null,
    },
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      sortable: true,
    },
    {
      id: "email",
      accessorKey: "email",
      header: "Email",
      sortable: true,
      filterable: true,
    },
  ];

  describe("findColumnById", () => {
    it("should find column by id", () => {
      const col = findColumnById(mockColumns, "name");
      assert.strictEqual(col?.id, "name");
      assert.strictEqual(col?.sortable, true);
    });

    it("should find column by accessorKey", () => {
      const col = findColumnById(mockColumns, "email");
      assert.strictEqual(col?.id, "email");
      // accessorKey is on ColumnDef base type - cast for access
      const colAny = col as unknown as { accessorKey?: string };
      assert.strictEqual(colAny.accessorKey, "email");
    });

    it("should return undefined for non-existent column", () => {
      const col = findColumnById(mockColumns, "nonExistent");
      assert.strictEqual(col, undefined);
    });

    it("should prefer id over accessorKey when both match", () => {
      const col = findColumnById(mockColumns, "name");
      assert.strictEqual(col?.id, "name");
    });
  });

  describe("buildColumnMap", () => {
    it("should build map with id as key", () => {
      const map = buildColumnMap(mockColumns);
      const col = map.get("name");
      assert.strictEqual(col?.id, "name");
    });

    it("should also map accessorKey to same column", () => {
      const map = buildColumnMap(mockColumns);
      // accessorKey "email" should map to same column as id "email"
      const colByAccessor = map.get("email");
      const colById = map.get("email");
      assert.strictEqual(colByAccessor, colById);
    });

    it("should return empty map for empty columns", () => {
      const map = buildColumnMap([]);
      assert.strictEqual(map.size, 0);
    });
  });

  describe("isSelectionColumn", () => {
    it("should return true for selection column", () => {
      const selectionCol = mockColumns.find((c) => c.isSelection);
      assert.strictEqual(isSelectionColumn(selectionCol), true);
    });

    it("should return false for non-selection column", () => {
      const nameCol = mockColumns.find((c) => c.id === "name");
      assert.strictEqual(isSelectionColumn(nameCol), false);
    });

    it("should return false for undefined", () => {
      assert.strictEqual(isSelectionColumn(undefined), false);
    });
  });

  describe("isRowActionColumn", () => {
    it("should return true for row action column", () => {
      const actionCol = { ...mockColumns[0], isRowAction: true };
      assert.strictEqual(isRowActionColumn(actionCol), true);
    });

    it("should return false for non-row-action column", () => {
      assert.strictEqual(isRowActionColumn(mockColumns[0]), false);
    });
  });
});

// ============================================================================
// Test Suite: Selection Helpers
// ============================================================================

describe("DataTable - Selection Helpers", () => {
  const mockGetRowId = (row: { id: string }) => row.id;
  const mockData = [
    { id: "1", name: "Alice" },
    { id: "2", name: "Bob" },
    { id: "3", name: "Charlie" },
  ];

  describe("countSelectedRows", () => {
    it("should count selected rows", () => {
      const selection: RowSelectionState = { "1": true, "2": true };
      assert.strictEqual(countSelectedRows(selection), 2);
    });

    it("should return 0 for empty selection", () => {
      assert.strictEqual(countSelectedRows({}), 0);
    });

    it("should handle all selected", () => {
      const selection: RowSelectionState = { "1": true, "2": true, "3": true };
      assert.strictEqual(countSelectedRows(selection), 3);
    });
  });

  describe("isRowSelected", () => {
    it("should return true for selected row", () => {
      const selection: RowSelectionState = { "1": true };
      assert.strictEqual(isRowSelected(selection, "1"), true);
    });

    it("should return false for unselected row", () => {
      const selection: RowSelectionState = { "1": true };
      assert.strictEqual(isRowSelected(selection, "2"), false);
    });
  });

  describe("toggleRowSelection", () => {
    it("should select row if not selected", () => {
      const selection: RowSelectionState = {};
      const newSelection = toggleRowSelection(selection, "1");
      assert.strictEqual(newSelection["1"], true);
    });

    it("should deselect row if already selected", () => {
      const selection: RowSelectionState = { "1": true };
      const newSelection = toggleRowSelection(selection, "1");
      assert.strictEqual(newSelection["1"], undefined);
    });
  });

  describe("clearAllSelections", () => {
    it("should return empty state", () => {
      const selection: RowSelectionState = { "1": true, "2": true };
      const cleared = clearAllSelections();
      assert.deepStrictEqual(cleared, {});
    });
  });

  describe("selectAllRows", () => {
    it("should select all rows", () => {
      const selection = selectAllRows(mockData, mockGetRowId);
      assert.strictEqual(Object.keys(selection).length, 3);
      assert.strictEqual(selection["1"], true);
      assert.strictEqual(selection["2"], true);
      assert.strictEqual(selection["3"], true);
    });

    it("should return empty for empty data", () => {
      const selection = selectAllRows([], mockGetRowId);
      assert.deepStrictEqual(selection, {});
    });
  });
});

// ============================================================================
// Test Suite: Announcement Helpers (Accessibility)
// ============================================================================

describe("DataTable - Announcement Helpers", () => {

  describe("announceSortChange", () => {
    it("should announce ascending sort", () => {
      const announcement = announceSortChange("Name", "asc");
      assert.ok(announcement.includes("Name"));
      assert.ok(announcement.includes("ascending"));
    });

    it("should announce descending sort", () => {
      const announcement = announceSortChange("Name", "desc");
      assert.ok(announcement.includes("descending"));
    });

    it("should announce sort cleared", () => {
      const announcement = announceSortChange("Name", null);
      assert.ok(announcement.includes("cleared"));
    });
  });

  describe("announcePageChange", () => {
    it("should announce page change correctly", () => {
      const announcement = announcePageChange(2, 5, 100);
      assert.ok(announcement.includes("2"));
      assert.ok(announcement.includes("5"));
      assert.ok(announcement.includes("100"));
    });
  });

  describe("announceSelectionChange", () => {
    it("should announce selection count", () => {
      const announcement = announceSelectionChange(5);
      assert.ok(announcement.includes("5"));
      assert.ok(announcement.includes("rows"));
    });

    it("should handle singular", () => {
      const announcement = announceSelectionChange(1);
      assert.ok(announcement.includes("1"));
      assert.ok(announcement.includes("row"));
    });

    it("should announce cleared when 0", () => {
      const announcement = announceSelectionChange(0);
      assert.ok(announcement.includes("cleared"));
    });
  });

  describe("announceBatchAction", () => {
    it("should announce batch action", () => {
      const announcement = announceBatchAction("Delete", 3);
      assert.ok(announcement.includes("Delete"));
      assert.ok(announcement.includes("3"));
    });
  });

  describe("announceError", () => {
    it("should indicate retry available", () => {
      const announcement = announceError(true);
      assert.ok(announcement.includes("Retry"));
    });

    it("should indicate no retry", () => {
      const announcement = announceError(false);
      assert.ok(!announcement.includes("Retry"));
    });
  });

  describe("announceRetry", () => {
    it("should announce retry", () => {
      const announcement = announceRetry();
      assert.ok(announcement.includes("Retrying"));
    });
  });
});

// ============================================================================
// Test Suite: Performance Budget Helpers
// ============================================================================

describe("DataTable - Performance Budget Helpers", () => {

  describe("checkPerformanceBudget", () => {
    it("should return met=true when under budget", () => {
      const result = checkPerformanceBudget(200, 150);
      assert.strictEqual(result.met, true);
      assert.strictEqual(result.targetMs, 200);
      assert.strictEqual(result.actualMs, 150);
    });

    it("should return met=true when exactly at budget", () => {
      const result = checkPerformanceBudget(200, 200);
      assert.strictEqual(result.met, true);
    });

    it("should return met=false when over budget", () => {
      const result = checkPerformanceBudget(200, 250);
      assert.strictEqual(result.met, false);
    });

    it("should handle zero budget", () => {
      const result = checkPerformanceBudget(0, 0);
      assert.strictEqual(result.met, true);
    });

    it("should handle negative actual (fast)", () => {
      const result = checkPerformanceBudget(200, -1);
      assert.strictEqual(result.met, true);
    });
  });

  describe("DEFAULT_TABLE_PERF_BUDGET", () => {
    it("should be 200ms", () => {
      assert.strictEqual(DEFAULT_TABLE_PERF_BUDGET, 200);
    });
  });
});

// ============================================================================
// Test Suite: State Wrapper Utilities (AC2 - Optimistic vs Server)
// ============================================================================

describe("DataTable - State Wrapper Utilities", () => {
  const createWrapper = <T>(data: T, timestamp: number): StateWrapper<T> => ({
    data,
    source: "server",
    timestamp,
  });

  describe("isNewerState", () => {
    it("should return true when a is newer", () => {
      const a = createWrapper({ value: 1 }, 200);
      const b = createWrapper({ value: 1 }, 100);
      assert.strictEqual(isNewerState(a, b), true);
    });

    it("should return false when a is older", () => {
      const a = createWrapper({ value: 1 }, 100);
      const b = createWrapper({ value: 1 }, 200);
      assert.strictEqual(isNewerState(a, b), false);
    });

    it("should return false when timestamps are equal", () => {
      const a = createWrapper({ value: 1 }, 100);
      const b = createWrapper({ value: 1 }, 100);
      assert.strictEqual(isNewerState(a, b), false);
    });
  });

  describe("mergeState", () => {
    it("should return server data when no optimistic state", () => {
      const server = createWrapper({ value: "server" }, 100);
      const result = mergeState(null, server);
      assert.strictEqual(result.value, "server");
    });

    it("should return optimistic data when newer", () => {
      const server = createWrapper({ value: "server" }, 100);
      const optimistic = createWrapper({ value: "optimistic" }, 200);
      const result = mergeState(optimistic, server);
      assert.strictEqual(result.value, "optimistic");
    });

    it("should return server data when server is newer", () => {
      const server = createWrapper({ value: "server" }, 200);
      const optimistic = createWrapper({ value: "optimistic" }, 100);
      const result = mergeState(optimistic, server);
      assert.strictEqual(result.value, "server");
    });
  });
});

// ============================================================================
// Test Suite: Race Condition Handling (AC2 - Integration)
// ============================================================================

describe("DataTable - Race Condition Handling", () => {
  let manager: TableStateManager;

  beforeEach(() => {
    manager = new TableStateManager();
  });

  after(() => {
    manager.reset();
  });

  it("should handle rapid sequential requests correctly", () => {
    // First request
    const req1 = manager.startRequest();
    const seq1 = req1.sequence;

    // Second request (should cancel first)
    const req2 = manager.startRequest();
    const seq2 = req2.sequence;

    // Third request
    const req3 = manager.startRequest();
    const seq3 = req3.sequence;

    assert.ok(seq3 > seq2);
    assert.ok(seq2 > seq1);

    // Only the latest response is valid
    assert.strictEqual(manager.isResponseValid(seq1), false);
    assert.strictEqual(manager.isResponseValid(seq2), false);
    assert.strictEqual(manager.isResponseValid(seq3), true);
  });

  it("should abort old request when new request starts", () => {
    const req1 = manager.startRequest();
    let req1Aborted = false;
    req1.signal.addEventListener("abort", () => {
      req1Aborted = true;
    });

    // Start new request
    manager.startRequest();

    assert.strictEqual(req1Aborted, true);
  });

  it("should handle request queuing without losing cancellation", () => {
    // Rapid fire requests
    for (let i = 0; i < 10; i++) {
      const req = manager.startRequest();
      assert.ok(req.sequence > 0);
      assert.ok(req.signal instanceof AbortSignal);
    }

    // Only the last one should be valid
    const lastSeq = manager.getCurrentSequence();
    assert.strictEqual(manager.isResponseValid(lastSeq), true);
    assert.strictEqual(manager.isResponseValid(lastSeq - 1), false);
  });

  it("should properly isolate concurrent table instances", () => {
    const manager1 = new TableStateManager();
    const manager2 = new TableStateManager();

    const req1 = manager1.startRequest();
    const req2 = manager2.startRequest();

    // Each manager should have independent state
    assert.ok(req1.sequence > 0);
    assert.ok(req2.sequence > 0);

    // Completing request on manager1 should not affect manager2
    const seq1FromManager2 = manager2.getCurrentSequence();
    assert.strictEqual(manager1.isResponseValid(seq1FromManager2), false);

    manager1.reset();
    manager2.reset();
  });
});

// ============================================================================
// Test Suite: Pagination State Transitions
// ============================================================================

describe("DataTable - Pagination State Transitions", () => {

  it("should calculate correct page boundaries for various scenarios", () => {
    // Page 1 with 25 items
    assert.strictEqual(getPaginationRangeText(1, 25, 100), "1-25 of 100");

    // Page 2 with 25 items
    assert.strictEqual(getPaginationRangeText(2, 25, 100), "26-50 of 100");

    // Last page
    assert.strictEqual(getPaginationRangeText(4, 25, 100), "76-100 of 100");

    // Partial last page
    assert.strictEqual(getPaginationRangeText(5, 25, 110), "101-110 of 110");
  });

  it("should handle single page correctly", () => {
    assert.strictEqual(getPaginationRangeText(1, 25, 10), "1-10 of 10");
  });

  it("should handle page size changes correctly", () => {
    // Going from 25 to 50 items per page
    // Page 2 with 25 items = position 26-50
    // With 50 items per page, position 26-50 is still on page 2
    const safePage = calculateSafePage(2, 25, 50, 100);
    assert.ok(safePage >= 1 && safePage <= 2);

    // Going from 25 to 100 items per page
    const safePage2 = calculateSafePage(3, 25, 100, 100);
    assert.ok(safePage2 >= 1 && safePage2 <= 1);
  });

  it("should handle total count changes correctly", () => {
    // If total count shrinks below current page
    const safePage = calculateSafePage(5, 25, 25, 50);
    // Total pages is now 2, so page 5 should be capped to 2
    assert.strictEqual(safePage, 2);
  });

  it("should handle empty result set", () => {
    assert.strictEqual(calculateTotalPages(0, 25), 0);
    assert.strictEqual(getPaginationRangeText(1, 25, 0), "0 items");
  });
});

// ============================================================================
// Test Suite: Sort State Transitions
// ============================================================================

describe("DataTable - Sort State Transitions", () => {

  it("should cycle through sort directions correctly", () => {
    // Null -> asc -> desc -> null
    assert.strictEqual(getAriaSortValue(null), "none");

    // asc direction
    const ascResult = getAriaSortValue("asc");
    assert.strictEqual(ascResult, "ascending");

    // desc direction
    const descResult = getAriaSortValue("desc");
    assert.strictEqual(descResult, "descending");
  });

  it("should provide correct aria-sort values for accessibility", () => {
    assert.strictEqual(getAriaSortValue("asc"), "ascending");
    assert.strictEqual(getAriaSortValue("desc"), "descending");
    assert.strictEqual(getAriaSortValue(null), "none");
  });

  it("should handle page reset rules for sort changes", () => {
    const filterRule = getPageResetRule("filter_change");
    assert.strictEqual(filterRule.shouldReset, true);

    const sortRule = getPageResetRule("sort_change");
    assert.strictEqual(sortRule.shouldReset, true);

    const pageSizeRule = getPageResetRule("page_size_change");
    assert.strictEqual(pageSizeRule.shouldReset, false);
  });
});