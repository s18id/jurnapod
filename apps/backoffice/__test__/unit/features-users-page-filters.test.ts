// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert";
import { describe, it } from "node:test";

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

// Tests for URL query parameter serialization
describe("Users Page - URL Query Params", () => {
  // Simulate URLSearchParams parsing
  function parseFromUrl(params: URLSearchParams): Partial<FilterState> {
    const parsed: Partial<FilterState> = {};

    const search = params.get("search");
    if (search !== null) {
      parsed.search = search;
    }

    const status = params.get("status");
    if (status !== null && ["all", "active", "inactive"].includes(status)) {
      parsed.status = status as FilterState["status"];
    }

    const role = params.get("role");
    if (role !== null) {
      parsed.role = role;
    }

    const outlet = params.get("outlet");
    if (outlet !== null) {
      parsed.outlet = outlet;
    }

    const companyIdStr = params.get("companyId");
    if (companyIdStr !== null) {
      const companyId = parseInt(companyIdStr, 10);
      if (!isNaN(companyId)) {
        parsed.companyId = companyId;
      }
    }

    return parsed;
  }

  function serializeToUrl(state: FilterState): URLSearchParams {
    const params = new URLSearchParams();

    if (state.search) {
      params.set("search", state.search);
    }
    if (state.status !== "active") {
      params.set("status", state.status);
    }
    if (state.role !== "all") {
      params.set("role", state.role);
    }
    if (state.outlet !== "all") {
      params.set("outlet", state.outlet);
    }
    if (state.companyId !== null) {
      params.set("companyId", String(state.companyId));
    }

    return params;
  }

  it("parses search from URL params", () => {
    const params = new URLSearchParams("search=john@example.com");
    const result = parseFromUrl(params);
    assert.strictEqual(result.search, "john@example.com");
  });

  it("parses status from URL params", () => {
    const params = new URLSearchParams("status=inactive");
    const result = parseFromUrl(params);
    assert.strictEqual(result.status, "inactive");
  });

  it("parses role from URL params", () => {
    const params = new URLSearchParams("role=ADMIN");
    const result = parseFromUrl(params);
    assert.strictEqual(result.role, "ADMIN");
  });

  it("parses outlet from URL params", () => {
    const params = new URLSearchParams("outlet=123");
    const result = parseFromUrl(params);
    assert.strictEqual(result.outlet, "123");
  });

  it("parses companyId from URL params", () => {
    const params = new URLSearchParams("companyId=5");
    const result = parseFromUrl(params);
    assert.strictEqual(result.companyId, 5);
  });

  it("ignores invalid status value", () => {
    const params = new URLSearchParams("status=invalid");
    const result = parseFromUrl(params);
    assert.strictEqual(result.status, undefined);
  });

  it("ignores invalid companyId value", () => {
    const params = new URLSearchParams("companyId=notanumber");
    const result = parseFromUrl(params);
    assert.strictEqual(result.companyId, undefined);
  });

  it("parses all filters together", () => {
    const params = new URLSearchParams("search=test&status=all&role=OWNER&outlet=456&companyId=10");
    const result = parseFromUrl(params);
    assert.strictEqual(result.search, "test");
    assert.strictEqual(result.status, "all");
    assert.strictEqual(result.role, "OWNER");
    assert.strictEqual(result.outlet, "456");
    assert.strictEqual(result.companyId, 10);
  });

  it("serializes search to URL params", () => {
    const state: FilterState = { ...DEFAULT_FILTER_STATE, search: "test@example.com" };
    const params = serializeToUrl(state);
    assert.strictEqual(params.get("search"), "test@example.com");
  });

  it("serializes status to URL params when not default", () => {
    const state: FilterState = { ...DEFAULT_FILTER_STATE, status: "inactive" };
    const params = serializeToUrl(state);
    assert.strictEqual(params.get("status"), "inactive");
  });

  it("does not serialize status when default (active)", () => {
    const state: FilterState = { ...DEFAULT_FILTER_STATE, status: "active" };
    const params = serializeToUrl(state);
    assert.strictEqual(params.get("status"), null);
  });

  it("serializes role to URL params when not all", () => {
    const state: FilterState = { ...DEFAULT_FILTER_STATE, role: "ADMIN" };
    const params = serializeToUrl(state);
    assert.strictEqual(params.get("role"), "ADMIN");
  });

  it("serializes outlet to URL params when not all", () => {
    const state: FilterState = { ...DEFAULT_FILTER_STATE, outlet: "123" };
    const params = serializeToUrl(state);
    assert.strictEqual(params.get("outlet"), "123");
  });

  it("serializes companyId to URL params when set", () => {
    const state: FilterState = { ...DEFAULT_FILTER_STATE, companyId: 5 };
    const params = serializeToUrl(state);
    assert.strictEqual(params.get("companyId"), "5");
  });

  it("round-trips filter state through URL params", () => {
    const original: FilterState = {
      search: "john@test.com",
      status: "inactive",
      role: "OWNER",
      outlet: "789",
      companyId: 42,
    };
    
    // Serialize
    const params = serializeToUrl(original);
    
    // Parse
    const parsed = parseFromUrl(params);
    
    // Verify
    assert.strictEqual(parsed.search, original.search);
    assert.strictEqual(parsed.status, original.status);
    assert.strictEqual(parsed.role, original.role);
    assert.strictEqual(parsed.outlet, original.outlet);
    assert.strictEqual(parsed.companyId, original.companyId);
  });
});
