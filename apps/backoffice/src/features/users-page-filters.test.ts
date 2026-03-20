// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it } from "node:test";
import assert from "node:assert";

// Test the useDirtyState hook logic (extracted for testing)
interface DirtyState {
  isDirty: boolean;
  markDirty: () => void;
  markClean: () => void;
  toggleDirty: (dirty: boolean) => void;
}

function createDirtyState(): DirtyState {
  let isDirty = false;

  return {
    get isDirty() { return isDirty; },
    markDirty() { isDirty = true; },
    markClean() { isDirty = false; },
    toggleDirty(dirty: boolean) { isDirty = dirty; },
  };
}

// Test the useUrlFilterState hook logic (extracted for testing)
interface FilterState {
  search: string;
  status: "all" | "active" | "inactive";
  role: string;
  outlet: string;
  companyId: number | null;
}

const DEFAULT_FILTER_STATE: FilterState = {
  search: "",
  status: "active",
  role: "all",
  outlet: "all",
  companyId: null,
};

function createFilterState(initial: FilterState = DEFAULT_FILTER_STATE): {
  getFilterState: () => FilterState;
  clearAllFilters: () => void;
  hasActiveFilters: () => boolean;
  updateFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
} {
  let filterState = { ...initial };

  return {
    getFilterState: () => ({ ...filterState }),
    clearAllFilters() {
      filterState = { ...DEFAULT_FILTER_STATE };
    },
    hasActiveFilters() {
      return (
        filterState.search !== "" ||
        filterState.status !== "active" ||
        filterState.role !== "all" ||
        filterState.outlet !== "all" ||
        filterState.companyId !== null
      );
    },
    updateFilter(key, value) {
      filterState = { ...filterState, [key]: value };
    },
  };
}

// Tests for useDirtyState logic
describe("Users Page - useDirtyState Logic", () => {
  it("initial state is not dirty", () => {
    const state = createDirtyState();
    assert.strictEqual(state.isDirty, false);
  });

  it("markDirty sets isDirty to true", () => {
    const state = createDirtyState();
    state.markDirty();
    assert.strictEqual(state.isDirty, true);
  });

  it("markClean sets isDirty to false", () => {
    const state = createDirtyState();
    state.markDirty();
    state.markClean();
    assert.strictEqual(state.isDirty, false);
  });

  it("toggleDirty can set both true and false", () => {
    const state = createDirtyState();
    assert.strictEqual(state.isDirty, false);
    state.toggleDirty(true);
    assert.strictEqual(state.isDirty, true);
    state.toggleDirty(false);
    assert.strictEqual(state.isDirty, false);
  });
});

// Tests for useUrlFilterState logic
describe("Users Page - useUrlFilterState Logic", () => {
  it("default filter state is correct", () => {
    const { getFilterState } = createFilterState();
    const state = getFilterState();
    assert.strictEqual(state.search, "");
    assert.strictEqual(state.status, "active");
    assert.strictEqual(state.role, "all");
    assert.strictEqual(state.outlet, "all");
    assert.strictEqual(state.companyId, null);
  });

  it("clearAllFilters resets to default state", () => {
    const { getFilterState, clearAllFilters } = createFilterState({
      search: "test",
      status: "inactive",
      role: "ADMIN",
      outlet: "123",
      companyId: 1,
    });

    clearAllFilters();
    const state = getFilterState();

    assert.strictEqual(state.search, "");
    assert.strictEqual(state.status, "active");
    assert.strictEqual(state.role, "all");
    assert.strictEqual(state.outlet, "all");
    assert.strictEqual(state.companyId, null);
  });

  it("hasActiveFilters is false when no filters are active", () => {
    const { hasActiveFilters } = createFilterState();
    assert.strictEqual(hasActiveFilters(), false);
  });

  it("hasActiveFilters is true when search is set", () => {
    const { updateFilter, hasActiveFilters } = createFilterState();
    updateFilter("search", "test");
    assert.strictEqual(hasActiveFilters(), true);
  });

  it("hasActiveFilters is true when status is not active", () => {
    const { updateFilter, hasActiveFilters } = createFilterState();
    updateFilter("status", "inactive");
    assert.strictEqual(hasActiveFilters(), true);
  });

  it("hasActiveFilters is true when role is not all", () => {
    const { updateFilter, hasActiveFilters } = createFilterState();
    updateFilter("role", "ADMIN");
    assert.strictEqual(hasActiveFilters(), true);
  });

  it("hasActiveFilters is true when outlet is not all", () => {
    const { updateFilter, hasActiveFilters } = createFilterState();
    updateFilter("outlet", "123");
    assert.strictEqual(hasActiveFilters(), true);
  });

  it("hasActiveFilters is true when companyId is set", () => {
    const { updateFilter, hasActiveFilters } = createFilterState();
    updateFilter("companyId", 1);
    assert.strictEqual(hasActiveFilters(), true);
  });

  it("updateFilter updates individual filter fields", () => {
    const { getFilterState, updateFilter } = createFilterState();
    
    updateFilter("search", "john");
    assert.strictEqual(getFilterState().search, "john");
    
    updateFilter("status", "inactive");
    assert.strictEqual(getFilterState().status, "inactive");
    
    updateFilter("role", "ADMIN");
    assert.strictEqual(getFilterState().role, "ADMIN");
    
    updateFilter("outlet", "456");
    assert.strictEqual(getFilterState().outlet, "456");
    
    updateFilter("companyId", 2);
    assert.strictEqual(getFilterState().companyId, 2);
  });
});

// Tests for clearAllFilters function logic
describe("Users Page - clearAllFilters Logic", () => {
  it("resets all filter states correctly", () => {
    const { getFilterState, clearAllFilters } = createFilterState({
      search: "test@example.com",
      status: "inactive",
      role: "ADMIN",
      outlet: "123",
      companyId: 5,
    });

    clearAllFilters();
    const state = getFilterState();

    assert.strictEqual(state.search, "");
    assert.strictEqual(state.status, "active");
    assert.strictEqual(state.role, "all");
    assert.strictEqual(state.outlet, "all");
    assert.strictEqual(state.companyId, null);
  });
});
